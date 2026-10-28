import type { FeedConfig } from '../types/feed'

/** The server owns configuration validation; the client consumes its public DTO. */
export async function fetchConfig (): Promise<FeedConfig> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error('Loading the feed list timed out. Refresh the page to try again.'))
        controller.abort()
      }, 15_000)
    })
    const load = async () => {
      const response = await fetch('/api/config', {
        signal: controller.signal,
        credentials: 'omit',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      })
      if (!response.ok) {
        throw new Error(`Could not load the feed list (HTTP ${response.status}). Refresh the page to try again.`)
      }
      return await response.json() as FeedConfig
    }
    return await Promise.race([load(), timeout])
  } finally {
    clearTimeout(timer)
  }
}
