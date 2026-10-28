import type { ServerFeedDefinition } from '../server/config/types.ts'
import type { FeedItem, FeedResult } from '../src/types/feed.ts'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test, { after } from 'node:test'
import { JSDOM } from 'jsdom'
import { createFeedHandler } from '../server/feeds.ts'
import { fetchFeed, loadFeeds } from '../src/api/feeds.ts'
import { sanitizeDescription } from '../src/feeds/description.ts'
import { FeedParseError, parseFeed } from '../src/feeds/parse.ts'
import { sortFeedItems } from '../src/feeds/sort.ts'

const browser = new JSDOM('')
Object.assign(globalThis, {
  window: browser.window,
  document: browser.window.document,
  DOMParser: browser.window.DOMParser,
})
after(() => browser.window.close())

const feed: ServerFeedDefinition = {
  id: 'test', name: 'Test feed', url: 'https://example.com/feed/rss', categoryIds: ['manual'],
}
const fixture = readFileSync(new URL('fixtures/rss.xml', import.meta.url), 'utf8')
const emptyFeed = '<rss version="2.0"><channel/></rss>'

function wrap (items: string): string {
  return `<rss version="2.0"><channel>${items}</channel></rss>`
}

test('normalizes XML, CDATA, item categories, dates, and inherited XML bases', () => {
  const items = parseFeed(fixture, feed, feed.url)
  assert.equal(items.length, 3)
  assert.equal(items[0]!.title, 'Story & context')
  assert.equal(items[0]!.feedId, feed.id)
  assert.equal(items[0]!.articleUrl, 'https://example.com/news/article-one')
  assert.equal(items[0]!.publishedAt, '2026-10-28T01:00:00.000Z')
  assert.deepEqual(items[0]!.categories, ['World', 'UK'])
  assert.match(items[0]!.sanitizedDescription, /<strong>formatted<\/strong>/)
  assert.match(items[0]!.sanitizedDescription, /href="https:\/\/example.com\/news\/related"/)
  assert.equal(items[1]!.publishedAt, '2026-10-27T06:00:00.000Z')
  assert.match(items[1]!.sanitizedDescription, /Content fallback/)
  assert.deepEqual(items[2], {
    id: JSON.stringify([feed.id, 'guid', 'undated']),
    feedId: feed.id, title: 'Untitled item', articleUrl: null, publishedAt: null,
    sanitizedDescription: '', media: [], categories: [],
  })
})

test('extracts enclosure and namespace media without repeating embedded images/audio', () => {
  const [item] = parseFeed(fixture, feed, feed.url)
  assert.deepEqual(item!.media, [
    { url: 'https://example.com/news/stories/report.pdf', type: 'attachment', mimeType: 'application/pdf' },
    { url: 'https://example.com/news/media/film.mp4', type: 'video', mimeType: 'video/mp4', title: 'Film' },
    { url: 'https://example.com/news/stories/podcast.ogg', type: 'audio' },
    { url: 'https://example.com/news/media/film.jpg', type: 'image' },
  ])
  assert.match(item!.sanitizedDescription, /src="https:\/\/example.com\/news\/stories\/cover.jpg"/)
  assert.match(item!.sanitizedDescription, /controls=""/)
  assert.match(item!.sanitizedDescription, /preload="none"/)
  assert.doesNotMatch(item!.sanitizedDescription, /autoplay/)
})

test('sanitizes active content, unsafe URLs, attributes, SVG, and link targets', () => {
  const result = sanitizeDescription(`
    <script>alert(1)</script><iframe src="https://evil.example"></iframe>
    <svg><a href="javascript:alert(1)">unsafe</a></svg>
    <p style="color:red" onclick="alert(1)" data-command="bad">Safe <em>text</em></p>
    <a href="jav&#x61;script:alert(1)" target="_self">Bad link</a>
    <a href="/article" target="evil" rel="opener">Good link</a>
    <img src="data:image/svg+xml,bad" onerror="alert(1)">
    <video autoplay onplay="alert(1)" poster="javascript:alert(1)">
      <source src="/video.mp4" type="video/mp4">
    </video>`, feed.url)
  const document = new browser.window.DOMParser().parseFromString(result.html, 'text/html')
  assert.equal(document.querySelector('script, iframe, svg, [style], [onclick], [onerror], [onplay], [autoplay], [data-command]'), null)
  assert.equal(document.querySelector('a')!.hasAttribute('href'), false)
  const link = document.querySelector('a[href]')!
  assert.equal(link.getAttribute('href'), 'https://example.com/article')
  assert.equal(link.getAttribute('target'), '_blank')
  assert.equal(link.getAttribute('rel'), 'noopener noreferrer')
  assert.equal(document.querySelector('img')!.hasAttribute('src'), false)
  assert.equal(document.querySelector('video')!.hasAttribute('poster'), false)
  assert.equal(document.querySelector('video')!.hasAttribute('controls'), true)
  assert.deepEqual([...result.embeddedMediaUrls], ['https://example.com/video.mp4'])
  assert.match(result.html, /<em>text<\/em>/)
})

test('rejects malformed XML, missing channel, and unsupported formats', () => {
  for (const xml of ['<rss><channel>', '<rss/>', '']) {
    assert.throws(() => parseFeed(xml, feed, feed.url), error => error instanceof FeedParseError && error.type === 'parse')
  }
  for (const xml of ['<feed xmlns="http://www.w3.org/2005/Atom"/>', '<html/>']) {
    assert.throws(() => parseFeed(xml, feed, feed.url), error => error instanceof FeedParseError && error.type === 'unsupported')
  }
  assert.deepEqual(parseFeed(emptyFeed, feed, feed.url), [])
})

test('item identity is deterministic and deduplication stays within each feed', () => {
  const xml = wrap('<item><title>Same</title><link>/one</link></item>'.repeat(2))
  const first = parseFeed(xml, feed, feed.url)
  assert.equal(first.length, 1)
  assert.deepEqual(first, parseFeed(xml, feed, feed.url))
  assert.notEqual(first[0]!.id, parseFeed(xml, { ...feed, id: 'another' }, feed.url)[0]!.id)
})

test('resolves relative links and rejects unsafe links and non-permalink GUIDs', () => {
  const items = parseFeed(wrap(`
    <item><link>../article</link></item>
    <item><guid isPermaLink="false">https://example.com/id</guid></item>
    <item><guid>opaque-id</guid></item>
    <item><guid>https://example.com/permalink</guid></item>
    <item><link>javascript:alert(1)</link></item>`), feed, feed.url)
  assert.deepEqual(items.map(item => item.articleUrl), [
    'https://example.com/article', null, null, 'https://example.com/permalink', null,
  ])
})

test('sorts by descending date with config/XML order for ties and undated items last', () => {
  const base = parseFeed(wrap('<item/>'), feed, feed.url)[0]!
  const item = (id: string, feedId: string, publishedAt: string | null): FeedItem => ({ ...base, id, feedId, publishedAt })
  const items = [
    item('b-tie', 'b', '2026-10-27T00:00:00Z'),
    item('a-unknown', 'a', null),
    item('a-tie-1', 'a', '2026-10-27T00:00:00Z'),
    item('newest', 'b', '2026-10-28T00:00:00Z'),
    item('a-tie-2', 'a', '2026-10-27T00:00:00Z'),
    item('b-invalid', 'b', 'invalid'),
  ]
  const original = [...items]
  assert.deepEqual(sortFeedItems(items, [{ ...feed, id: 'a' }, { ...feed, id: 'b' }]).map(item => item.id), [
    'newest', 'a-tie-1', 'a-tie-2', 'b-tie', 'a-unknown', 'b-invalid',
  ])
  assert.deepEqual(items, original)
})

test('fetches the local API once without credentials/cache and uses the upstream URL header', async () => {
  let requests = 0
  const result = await fetchFeed(feed, { fetch: async (url, options) => {
    requests++
    assert.equal(url, `/api/feeds/${feed.id}`)
    assert.equal(options?.cache, 'no-store')
    assert.equal(options?.credentials, 'omit')
    const response = new Response(wrap('<item><link>article</link></item>'), {
      headers: { 'X-Feed-URL': 'https://redirected.example/rss/' },
    })
    return response
  } })
  assert.equal(requests, 1)
  assert.equal(result.status, 'success')
  if (result.status === 'success') {
    assert.equal(result.items[0]!.articleUrl, 'https://redirected.example/rss/article')
  }
})

test('returns feed-specific HTTP, network, parsing, and unsupported errors without retries', async () => {
  const scenarios = [
    { response: () => new Response('', { status: 503 }), type: 'http' },
    { response: () => {
      throw new TypeError('Failed to fetch')
    }, type: 'network' },
    { response: () => new Response('<rss>', { headers: { 'X-Feed-URL': feed.url } }), type: 'parse' },
    { response: () => new Response('<feed/>', { headers: { 'X-Feed-URL': feed.url } }), type: 'unsupported' },
  ]
  for (const scenario of scenarios) {
    let requests = 0
    const result = await fetchFeed(feed, { fetch: async () => {
      requests++
      return scenario.response()
    } })
    assert.equal(requests, 1)
    assert.equal(result.feedId, feed.id)
    assert.equal(result.status, 'error')
    if (result.status === 'error') {
      assert.equal(result.error.type, scenario.type)
      assert.match(result.error.message, /Test feed/)
      if (scenario.type === 'network') {
        assert.match(result.error.message, /backend is running/)
      }
    }
  }
})

test('times out requests and stalled response bodies, aborting the request', async () => {
  for (const stallBody of [false, true]) {
    let signal: AbortSignal | undefined
    const result = await fetchFeed(feed, {
      timeoutMs: 15,
      fetch: async (_url, options) => {
        signal = options?.signal ?? undefined
        if (stallBody) {
          return new Response(new ReadableStream(), { headers: { 'X-Feed-URL': feed.url } })
        }
        return new Promise<Response>(() => {})
      },
    })
    assert.equal(result.status, 'error')
    if (result.status === 'error') {
      assert.equal(result.error.type, 'timeout')
    }
    assert.equal(signal?.aborted, true)
  }
})

test('bounds concurrency, reports results independently, and returns configuration order', async () => {
  const feeds = ['slow', 'fast', 'failed', 'last'].map(id => ({ ...feed, id, url: `https://example.com/${id}` }))
  const completed: FeedResult[] = []
  let active = 0
  let peak = 0
  let finishSlow: (() => void) | undefined
  const results = await loadFeeds(feeds, {
    concurrency: 2,
    timeoutMs: 500,
    onResult: result => {
      completed.push(result)
      if (result.feedId === 'last') {
        finishSlow!()
      }
    },
    fetch: async url => {
      active++
      peak = Math.max(peak, active)
      if (url === `/api/feeds/${feeds[0]!.id}`) {
        await new Promise<void>(resolve => {
          finishSlow = resolve
        })
      }
      active--
      return new Response(emptyFeed, { headers: { 'X-Feed-URL': feed.url }, status: url === `/api/feeds/${feeds[2]!.id}` ? 503 : 200 })
    },
  })
  assert.equal(peak, 2)
  assert.deepEqual(completed.map(result => result.feedId), ['fast', 'failed', 'last', 'slow'])
  assert.deepEqual(results.map(result => result.feedId), feeds.map(feed => feed.id))
  assert.deepEqual(results.map(result => result.status), ['success', 'success', 'error', 'success'])
  assert.deepEqual(await loadFeeds([]), [])
})

test('rejects invalid loader options', async () => {
  await assert.rejects(loadFeeds([feed], { concurrency: 0 }), RangeError)
  await assert.rejects(loadFeeds([feed], { concurrency: 1.5 }), RangeError)
  await assert.rejects(fetchFeed(feed, { timeoutMs: 0 }), RangeError)
  await assert.rejects(fetchFeed(feed, { timeoutMs: Number.NaN }), RangeError)
})

test('parses server-fetched RSS and preserves typed upstream errors through the API', async () => {
  for (const scenario of ['success', 'timeout', 'network', 'http'] as const) {
    const handler = createFeedHandler({ categories: [], feeds: [feed] }, {
      timeoutMs: 15,
      fetch: async () => {
        switch (scenario) {
          case 'timeout': { return new Promise<Response>(() => {}) }
          case 'network': { throw new TypeError('Offline') }
          case 'http': { return new Response('', { status: 403 }) }
          default: {
            const response = new Response(wrap('<item><link>story</link></item>'))
            Object.defineProperty(response, 'url', { value: 'https://upstream.example/news/' })
            return response
          }
        }
      },
    })
    const result = await fetchFeed(feed, {
      fetch: async (url, options) => handler(new Request(new URL(String(url), 'http://localhost'), options)),
    })
    if (scenario === 'success') {
      assert.equal(result.status, 'success')
      if (result.status === 'success') {
        assert.equal(result.items[0]!.articleUrl, 'https://upstream.example/news/story')
      }
    } else {
      assert.equal(result.status, 'error')
      if (result.status === 'error') {
        assert.equal(result.error.type, scenario)
        assert.match(result.error.message, /Test feed:/)
      }
    }
  }
})

test('rejects a missing or unsafe upstream URL instead of resolving links against the API', async () => {
  for (const source of ['', 'javascript:alert(1)']) {
    const result = await fetchFeed(feed, {
      fetch: async () => {
        const response = new Response(wrap('<item><link>story</link></item>'), { headers: { 'X-Feed-URL': source } })
        Object.defineProperty(response, 'url', { value: 'http://localhost/api/feeds/test' })
        return response
      },
    })
    assert.equal(result.status, 'error')
    if (result.status === 'error') {
      assert.equal(result.error.type, 'parse')
      assert.match(result.error.message, /valid upstream URL/)
    }
  }
})
