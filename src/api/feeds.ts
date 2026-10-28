import type { FeedDefinition, FeedError, FeedResult } from '../types/feed'
import { FeedParseError, parseFeed } from '../feeds/parse.ts'
import { httpUrl } from '../feeds/url.ts'

interface FetchOptions {
  fetch?: typeof fetch
  timeoutMs?: number
}

interface LoadOptions extends FetchOptions {
  concurrency?: number
  /** Called as each feed completes, so successful feeds need not wait for slow ones. */
  onResult?: (result: FeedResult) => void
}

class HttpError extends Error {}
class TimeoutError extends Error {}
class ApiError extends Error {
  readonly type: FeedError['type']

  constructor (error: FeedError) {
    super(error.message)
    this.type = error.type
  }
}

async function apiError (response: Response): Promise<Error> {
  try {
    const body = await response.json()
    const error = body?.error
    if (['network', 'http', 'timeout'].includes(error?.type) && typeof error?.message === 'string') {
      return new ApiError(error)
    }
  } catch {
    // A hosting proxy may return an HTML error instead of the feed API's JSON response.
  }
  return new HttpError(`HTTP ${response.status}`)
}

function errorType (error: unknown): FeedError['type'] {
  if (error instanceof ApiError) {
    return error.type
  }
  if (error instanceof TimeoutError) {
    return 'timeout'
  }
  if (error instanceof HttpError) {
    return 'http'
  }
  return error instanceof FeedParseError ? error.type : 'network'
}

export async function fetchFeed (feed: FeedDefinition, options: FetchOptions = {}): Promise<FeedResult> {
  const timeoutMs = options.timeoutMs ?? 15_000
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('Feed timeout must be a positive finite number')
  }
  const request = options.fetch ?? globalThis.fetch
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new TimeoutError(`Request timed out after ${timeoutMs} ms`))
        controller.abort()
      }, timeoutMs)
    })
    const load = async () => {
      const response = await request(`/api/feeds/${encodeURIComponent(feed.id)}`, {
        signal: controller.signal,
        credentials: 'omit',
        cache: 'no-store',
        headers: { Accept: 'application/rss+xml, application/xml, text/xml;q=0.9' },
      })
      if (!response.ok) {
        throw await apiError(response)
      }
      // The same-origin API URL is not the base for relative article and media links.
      const sourceUrl = httpUrl(response.headers.get('X-Feed-URL'))
      if (!sourceUrl) {
        throw new FeedParseError('parse', 'Feed API did not provide a valid upstream URL')
      }
      return parseFeed(await response.text(), feed, sourceUrl)
    }
    return { feedId: feed.id, status: 'success', items: await Promise.race([load(), timeout]) }
  } catch (error) {
    const type = errorType(error)
    let detail = error instanceof Error ? error.message : 'Request failed'
    if (type === 'network' && !(error instanceof ApiError)) {
      detail = 'Could not reach the feed API. Check the connection and whether the backend is running.'
    }
    return { feedId: feed.id, status: 'error', error: { type, message: `${feed.name}: ${detail}` } }
  } finally {
    clearTimeout(timer)
  }
}

/** Run once per requested load; no polling, retries, or persistent cache. */
export async function loadFeeds (feeds: readonly FeedDefinition[], options: LoadOptions = {}): Promise<FeedResult[]> {
  const concurrency = options.concurrency ?? 4
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError('Feed concurrency must be a positive integer')
  }
  const results: FeedResult[] = []
  let nextIndex = 0
  async function worker () {
    while (nextIndex < feeds.length) {
      const index = nextIndex++
      const result = await fetchFeed(feeds[index]!, options)
      results[index] = result
      options.onResult?.(result)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, feeds.length) }, () => worker()))
  return results
}
