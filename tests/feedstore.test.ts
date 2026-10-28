import type { FeedConfig } from '../src/types/feed.ts'
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
      { id: 'guardian', name: 'The Guardian', url: 'https://example.com/guardian', categoryIds: ['news', 'uk-news'] },
      { id: 'other', name: 'Other feed', url: 'https://example.com/other', categoryIds: ['news'] },
      { id: 'uncategorized', name: 'Uncategorized', url: 'https://example.com/uncategorized', categoryIds: [] },
    ],
  }
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
  const request = t.mock.method(globalThis, 'fetch', async () => new Promise<Response>(resolve => {
    finish = resolve
  }))
  const initial = config()
  initial.feeds = initial.feeds.slice(0, 1)
  const first = store.loadOnce(initial)
  const second = store.loadOnce(initial)
  assert.equal(store.hasStarted, true)
  assert.equal(store.isLoading, true)
  assert.equal(store.hasFinished, false)
  assert.equal(store.feedStates.guardian?.status, 'loading')
  await Promise.resolve()
  assert.equal(request.mock.callCount(), 1)
  finish(new Response(rss('Loaded')))
  await Promise.all([first, second])
  assert.equal(store.isLoading, false)
  assert.equal(store.hasFinished, true)
  assert.equal(store.feedStates.guardian?.status, 'success')
  assert.deepEqual(store.items.map(item => item.title), ['Loaded'])
  await store.loadOnce(initial)
  assert.equal(request.mock.callCount(), 1)
})

test('makes successful results available while another feed remains pending, then retains them on failure', async t => {
  const store = useFeedStore(createPinia())
  const initial = config()
  initial.feeds = initial.feeds.slice(0, 2)
  let finishOther: (response: Response) => void = () => {}
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    if (url === initial.feeds[0]!.url) {
      return new Response(rss('Available immediately'))
    }
    return new Promise<Response>(resolve => {
      finishOther = resolve
    })
  })
  const loading = store.loadOnce(initial)
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
  const request = t.mock.method(globalThis, 'fetch', async (url: string) => {
    if (url === initial.feeds[0]!.url) {
      return new Response(`<rss><channel>
        <item><title>Older</title><pubDate>2026-10-25T00:00:00Z</pubDate></item>
        <item><title>Guardian newest</title><pubDate>2026-10-28T00:00:00Z</pubDate></item>
      </channel></rss>`)
    }
    return new Response(url === initial.feeds[1]!.url
      ? rss('Other newer', '2026-10-27T00:00:00Z')
      : rss('Uncategorized', '2026-10-26T00:00:00Z'))
  })
  const pinia = createPinia()
  const store = useFeedStore(pinia)
  await store.loadOnce(initial)
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
    await anotherConsumer.loadOnce(initial)
  }
  assert.equal(request.mock.callCount(), initial.feeds.length)
})

test('equal dates preserve feed configuration order despite reverse completion order', async t => {
  const initial = config()
  initial.feeds = initial.feeds.slice(0, 2)
  let finishGuardian: (response: Response) => void = () => {}
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    if (url === initial.feeds[0]!.url) {
      return new Promise<Response>(resolve => {
        finishGuardian = resolve
      })
    }
    return new Response(rss('Other', '2026-10-28T00:00:00Z'))
  })
  const store = useFeedStore(createPinia())
  const loading = store.loadOnce(initial)
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
  const request = t.mock.method(globalThis, 'fetch', async () => {
    throw new TypeError('Network unavailable')
  })
  const store = useFeedStore(createPinia())
  await store.loadOnce(config())
  assert.equal(store.hasFinished, true)
  assert.equal(store.isLoading, false)
  assert.equal(store.errors.length, 3)
  assert.deepEqual(store.items, [])
  await store.loadOnce(config())
  assert.equal(request.mock.callCount(), 3)
})

test('empty configuration completes without requests', async t => {
  const request = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('No request expected')
  })
  const store = useFeedStore(createPinia())
  await store.loadOnce({ categories: [], feeds: [] })
  assert.equal(store.hasStarted, true)
  assert.equal(store.hasFinished, true)
  assert.equal(store.isLoading, false)
  assert.deepEqual(store.items, [])
  assert.deepEqual(store.errors, [])
  assert.equal(request.mock.callCount(), 0)
})

test('retains the first configuration and results until a fresh application store is created', async t => {
  const initial = config()
  initial.feeds = initial.feeds.slice(0, 1)
  const request = t.mock.method(globalThis, 'fetch', async () => new Response(rss('Retained')))
  const store = useFeedStore(createPinia())
  await store.loadOnce(initial)
  initial.feeds[0]!.categoryIds.length = 0
  initial.categories[0]!.name = 'Changed externally'
  await store.loadOnce({ categories: [], feeds: [] })
  assert.equal(store.itemsForCategory('news').length, 1)
  assert.equal(store.config.categories[0]!.name, 'News')
  assert.equal(request.mock.callCount(), 1)
  const freshStore = useFeedStore(createPinia())
  await freshStore.loadOnce(initial)
  assert.equal(request.mock.callCount(), 2)
})
