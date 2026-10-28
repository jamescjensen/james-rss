import type { FeedConfig, FeedError } from '../src/types/feed'
import type { ServerFeedConfig } from './config/types'

interface ProxyOptions {
  fetch?: typeof fetch
  timeoutMs?: number
  maxBytes?: number
}

class ProxyError extends Error {
  readonly type: FeedError['type']
  readonly status: number

  constructor (type: FeedError['type'], message: string, status: number) {
    super(message)
    this.type = type
    this.status = status
  }
}

function errorResponse (status: number, error: FeedError, headers: Record<string, string> = {}): Response {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store', ...headers } })
}

async function readFeed (response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) {
    return ''
  }
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        return Buffer.concat(chunks).toString('utf8')
      }
      size += value.byteLength
      if (size > maxBytes) {
        await reader.cancel()
        throw new ProxyError('http', `Feed exceeds the ${maxBytes}-byte response limit`, 502)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
}

/** Accept configured IDs only; callers cannot supply arbitrary upstream URLs. */
export function createFeedHandler (config: ServerFeedConfig, options: ProxyOptions = {}) {
  const feeds = new Map(config.feeds.map(feed => [feed.id, { ...feed }]))
  const publicConfig: FeedConfig = {
    categories: config.categories.map(({ id, name }) => ({ id, name })),
    feeds: config.feeds.map(({ id, name, categoryIds, bias }) => ({
      id, name, categoryIds: [...categoryIds], ...(bias === undefined ? {} : { bias }),
    })),
  }
  const timeoutMs = options.timeoutMs ?? 10_000
  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isInteger(maxBytes) || maxBytes <= 0) {
    throw new RangeError('Proxy timeout and response size limit must be positive finite values')
  }

  return async (request: Request): Promise<Response> => {
    if (request.method !== 'GET') {
      return errorResponse(405, { type: 'http', message: 'Only GET requests are supported' }, { Allow: 'GET' })
    }
    const path = new URL(request.url).pathname
    if (path === '/api/config') {
      return Response.json(publicConfig, { headers: { 'Cache-Control': 'no-store' } })
    }
    const match = /^\/api\/feeds\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(path)
    const feed = match ? feeds.get(match[1]!) : undefined
    if (!feed) {
      return errorResponse(404, { type: 'http', message: 'Unknown feed ID' })
    }
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new ProxyError('timeout', `Upstream request timed out after ${timeoutMs} ms`, 504))
          controller.abort()
        }, timeoutMs)
      })
      const load = async () => {
        const response = await (options.fetch ?? globalThis.fetch)(feed.url, {
          signal: controller.signal,
          credentials: 'omit',
          cache: 'no-store',
          headers: { Accept: 'application/rss+xml, application/xml, text/xml;q=0.9' },
        })
        if (!response.ok) {
          controller.abort()
          throw new ProxyError('http', `Upstream returned HTTP ${response.status}`, 502)
        }
        const xml = await readFeed(response, maxBytes)
        return new Response(xml, {
          headers: {
            'Content-Type': 'application/rss+xml; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            'X-Feed-URL': response.url || feed.url,
          },
        })
      }
      return await Promise.race([load(), timeout])
    } catch (error) {
      controller.abort()
      if (error instanceof ProxyError) {
        return errorResponse(error.status, { type: error.type, message: error.message })
      }
      return errorResponse(502, { type: 'network', message: 'Could not reach the upstream feed' })
    } finally {
      clearTimeout(timer)
    }
  }
}
