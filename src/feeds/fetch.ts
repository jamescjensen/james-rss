import type { FeedDefinition, FeedError, FeedResult } from '../types/feed'
import { FeedParseError, parseFeed } from './parse.ts'

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

function errorType (error: unknown): FeedError['type'] {
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
      const response = await request(feed.url, {
        signal: controller.signal,
        credentials: 'omit',
        cache: 'no-store',
        headers: { Accept: 'application/rss+xml, application/xml, text/xml;q=0.9' },
      })
      if (!response.ok) {
        throw new HttpError(`HTTP ${response.status}`)
      }
      // Response.url accounts for HTTP redirects when resolving relative item URLs.
      return parseFeed(await response.text(), feed, response.url || feed.url)
    }
    return { feedId: feed.id, status: 'success', items: await Promise.race([load(), timeout]) }
  } catch (error) {
    const type = errorType(error)
    let detail = error instanceof Error ? error.message : 'Request failed'
    if (type === 'network') {
      detail = 'Request failed. Check the network and whether the feed permits browser access (CORS).'
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
