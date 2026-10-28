import type { FeedConfig } from '../src/types/feed.ts'
import type { TestContext } from 'node:test'
import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { JSDOM } from 'jsdom'
import { createPinia } from 'pinia'
import { useFeedStore } from '../src/stores/feeds.ts'

const browser = new JSDOM('')
Object.assign(globalThis, {
  window: browser.window,
  document: browser.window.document,
  DOMParser: browser.window.DOMParser,
})
after(() => browser.window.close())

function config (): FeedConfig {
  return {
    categories: [{ id: 'news', name: 'News' }, { id: 'uk-news', name: 'UK News' }, { id: 'empty', name: 'Empty' }],
    feeds: [
      { id: 'guardian', name: 'The Guardian', categoryIds: ['news', 'uk-news'] },
      { id: 'other', name: 'Other feed', categoryIds: ['news'] },
      { id: 'uncategorized', name: 'Uncategorized', categoryIds: [] },
    ],
  }
}

function mockFeedRequests (t: TestContext, initial: FeedConfig, request: (url: string) => Promise<Response>) {
  return t.mock.method(globalThis, 'fetch', async (url: string) => {
    if (url === '/api/config') {
      return Response.json(initial)
    }
    const response = await request(url)
    response.headers.set('X-Feed-URL', 'https://example.com/rss')
    return response
  })
}

function rss (title: string, date = ''): string {
  return `<rss version="2.0"><channel><item>
    <title>${title}</title><pubDate>${date}</pubDate><category>RSS category</category>
  </item></channel></rss>`
}

test('starts idle and tracks one shared load across overlapping callers', async t => {
  const store = useFeedStore(createPinia())
  assert.equal(store.hasStarted, false)
  assert.equal(store.isLoading, false)
  assert.equal(store.hasFinished, false)
  assert.deepEqual(store.items, [])
  let finish: (response: Response) => void = () => {}
  const initial = config()
  initial.feeds = initial.feeds.slice(0, 1)
  const request = mockFeedRequests(t, initial, async () => new Promise<Response>(resolve => {
    finish = resolve
  }))
  const first = store.loadOnce()
  const second = store.loadOnce()
  assert.equal(store.hasStarted, true)
  assert.equal(store.isLoading, true)
  assert.equal(store.hasFinished, false)
  assert.equal(store.isConfigLoading, true)
  await setImmediate()
  assert.equal(store.isConfigLoading, false)
  assert.equal(store.feedStates.guardian?.status, 'loading')
  assert.equal(request.mock.callCount(), 2)
  finish(new Response(rss('Loaded')))
  await Promise.all([first, second])
  assert.equal(store.isLoading, false)
  assert.equal(store.hasFinished, true)
  assert.equal(store.feedStates.guardian?.status, 'success')
  assert.deepEqual(store.items.map(item => item.title), ['Loaded'])
  await store.loadOnce()
  assert.equal(request.mock.callCount(), 2)
})

test('makes successful results available while another feed remains pending, then retains them on failure', async t => {
  const store = useFeedStore(createPinia())
  const initial = config()
  initial.feeds = initial.feeds.slice(0, 2)
  let finishOther: (response: Response) => void = () => {}
  mockFeedRequests(t, initial, async (url: string) => {
    if (url === `/api/feeds/${initial.feeds[0]!.id}`) {
      return new Response(rss('Available immediately'))
    }
    return new Promise<Response>(resolve => {
      finishOther = resolve
    })
  })
  const loading = store.loadOnce()
  await setImmediate()
  assert.equal(store.feedStates.guardian?.status, 'success')
  assert.equal(store.feedStates.other?.status, 'loading')
  assert.equal(store.isLoading, true)
  assert.equal(store.hasFinished, false)
  assert.deepEqual(store.items.map(item => item.title), ['Available immediately'])
  finishOther(new Response('', { status: 503 }))
  await loading
  assert.equal(store.isLoading, false)
  assert.equal(store.hasFinished, true)
  assert.equal(store.feedStates.other?.status, 'error')
  assert.equal(store.feedStates.other?.error?.type, 'http')
  assert.equal(store.errors[0]?.feedId, 'other')
  assert.match(store.errors[0]!.message, /Other feed: HTTP 503/)
  assert.deepEqual(store.items.map(item => item.title), ['Available immediately'])
})

test('all/category/feed selections are newest first and do not fetch on repeated access', async t => {
  const initial = config()
  const request = mockFeedRequests(t, initial, async (url: string) => {
    if (url === `/api/feeds/${initial.feeds[0]!.id}`) {
      return new Response(`<rss><channel>
        <item><title>Older</title><pubDate>2026-10-25T00:00:00Z</pubDate></item>
        <item><title>Guardian newest</title><pubDate>2026-10-28T00:00:00Z</pubDate></item>
      </channel></rss>`)
    }
    return new Response(url === `/api/feeds/${initial.feeds[1]!.id}`
      ? rss('Other newer', '2026-10-27T00:00:00Z')
      : rss('Uncategorized', '2026-10-26T00:00:00Z'))
  })
  const pinia = createPinia()
  const store = useFeedStore(pinia)
  await store.loadOnce()
  const anotherConsumer = useFeedStore(pinia)
  assert.equal(anotherConsumer, store)
  for (let index = 0; index < 3; index++) {
    assert.deepEqual(store.items.map(item => item.title), ['Guardian newest', 'Other newer', 'Uncategorized', 'Older'])
    assert.deepEqual(store.itemsForCategory('news').map(item => item.title), ['Guardian newest', 'Other newer', 'Older'])
    assert.deepEqual(store.itemsForCategory('uk-news').map(item => item.title), ['Guardian newest', 'Older'])
    assert.deepEqual(store.itemsForFeed('guardian').map(item => item.title), ['Guardian newest', 'Older'])
    assert.equal(store.itemsForFeed('uncategorized').length, 1)
    assert.deepEqual(store.itemsForCategory('RSS category'), [])
    assert.deepEqual(store.itemsForCategory('empty'), [])
    assert.deepEqual(store.itemsForCategory('unknown'), [])
    assert.deepEqual(store.itemsForFeed('unknown'), [])
    await anotherConsumer.loadOnce()
  }
  assert.equal(request.mock.callCount(), initial.feeds.length + 1)
})

test('equal dates preserve feed configuration order despite reverse completion order', async t => {
  const initial = config()
  initial.feeds = initial.feeds.slice(0, 2)
  let finishGuardian: (response: Response) => void = () => {}
  mockFeedRequests(t, initial, async (url: string) => {
    if (url === `/api/feeds/${initial.feeds[0]!.id}`) {
      return new Promise<Response>(resolve => {
        finishGuardian = resolve
      })
    }
    return new Response(rss('Other', '2026-10-28T00:00:00Z'))
  })
  const store = useFeedStore(createPinia())
  const loading = store.loadOnce()
  await setImmediate()
  assert.deepEqual(store.items.map(item => item.title), ['Other'])
  finishGuardian(new Response(`<rss><channel>
    <item><title>First</title><pubDate>2026-10-28T00:00:00Z</pubDate></item>
    <item><title>Second</title><pubDate>2026-10-28T00:00:00Z</pubDate></item>
  </channel></rss>`))
  await loading
  assert.deepEqual(store.items.map(item => item.title), ['First', 'Second', 'Other'])
})

test('all failures settle and are not retried by subsequent calls', async t => {
  const request = mockFeedRequests(t, config(), async () => {
    throw new TypeError('Network unavailable')
  })
  const store = useFeedStore(createPinia())
  await store.loadOnce()
  assert.equal(store.hasFinished, true)
  assert.equal(store.isLoading, false)
  assert.equal(store.errors.length, 3)
  assert.deepEqual(store.items, [])
  await store.loadOnce()
  assert.equal(request.mock.callCount(), 4)
})

test('empty configuration completes without feed requests', async t => {
  const request = mockFeedRequests(t, { categories: [], feeds: [] }, async () => {
    throw new Error('No request expected')
  })
  const store = useFeedStore(createPinia())
  await store.loadOnce()
  assert.equal(store.hasStarted, true)
  assert.equal(store.hasFinished, true)
  assert.equal(store.isLoading, false)
  assert.deepEqual(store.items, [])
  assert.deepEqual(store.errors, [])
  assert.equal(request.mock.callCount(), 1)
})

test('retains the first configuration and results until a fresh application store is created', async t => {
  const initial = config()
  initial.feeds = initial.feeds.slice(0, 1)
  const request = mockFeedRequests(t, initial, async () => new Response(rss('Retained')))
  const store = useFeedStore(createPinia())
  await store.loadOnce()
  initial.feeds[0]!.categoryIds.length = 0
  initial.categories[0]!.name = 'Changed externally'
  await store.loadOnce()
  assert.equal(store.itemsForCategory('news').length, 1)
  assert.equal(store.config.categories[0]!.name, 'News')
  assert.equal(request.mock.callCount(), 2)
  const freshStore = useFeedStore(createPinia())
  await freshStore.loadOnce()
  assert.equal(request.mock.callCount(), 4)
})

test('waits for server configuration before requesting feeds and shares pending configuration loads', async t => {
  let finishConfig: (response: Response) => void = () => {}
  const request = t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.equal(url, '/api/config')
    assert.equal(options.cache, 'no-store')
    assert.equal(options.credentials, 'omit')
    return new Promise<Response>(resolve => {
      finishConfig = resolve
    })
  })
  const store = useFeedStore(createPinia())
  const first = store.loadOnce()
  const second = store.loadOnce()
  await setImmediate()
  assert.equal(store.isConfigLoading, true)
  assert.equal(store.isLoading, true)
  assert.equal(store.hasFinished, false)
  assert.deepEqual(store.feedStates, {})
  assert.equal(request.mock.callCount(), 1)
  finishConfig(Response.json({ categories: [], feeds: [] }))
  await Promise.all([first, second])
  assert.equal(store.isConfigLoading, false)
  assert.equal(store.hasFinished, true)
  assert.equal(store.configError, null)
})

test('configuration network, HTTP, and JSON failures settle without requesting feeds or retrying', async t => {
  for (const scenario of ['network', 'http', 'json']) {
    const request = t.mock.method(globalThis, 'fetch', async (url: string) => {
      assert.equal(url, '/api/config')
      if (scenario === 'network') {
        throw new TypeError('Offline')
      }
      return scenario === 'http' ? new Response('', { status: 503 }) : new Response('not JSON')
    })
    const store = useFeedStore(createPinia())
    await store.loadOnce()
    assert.equal(store.hasFinished, true)
    assert.equal(store.isLoading, false)
    assert.equal(store.isConfigLoading, false)
    assert.match(store.configError!, /Could not load the feed list/)
    assert.deepEqual(store.feedStates, {})
    await store.loadOnce()
    assert.equal(request.mock.callCount(), 1)
  }
})
