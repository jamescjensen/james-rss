import type { ReaderView } from '../src/composables/reader.ts'
import type { FeedConfig, FeedItem } from '../src/types/feed.ts'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useReaderPage } from '../src/composables/reader.ts'
import { createReaderRoutes } from '../src/router/routes.ts'
import { useFeedStore } from '../src/stores/feeds.ts'

function setup () {
  setActivePinia(createPinia())
  const store = useFeedStore()
  const config: FeedConfig = {
    categories: [{ id: 'news', name: 'News' }, { id: 'uk-news', name: 'UK News' }, { id: 'empty', name: 'Empty' }],
    feeds: [
      { id: 'guardian', name: 'The Guardian', categoryIds: ['news', 'uk-news'] },
      { id: 'other', name: 'Other feed', categoryIds: ['news'] },
    ],
  }
  store.config = config
  store.hasStarted = true
  return store
}

function item (id: string, feedId: string, publishedAt: string): FeedItem {
  return { id, feedId, publishedAt, title: id, articleUrl: null, sanitizedDescription: '', media: [], categories: [] }
}

test('category and feed URLs map to the shared reader and unmatched paths map to not-found', async () => {
  const page = { render: () => null }
  const router = createRouter({ history: createMemoryHistory(), routes: createReaderRoutes(page) })
  for (const [path, expected] of [
    ['/', { view: 'all' }],
    ['/categories/news', { view: 'category', id: 'news' }],
    ['/categories/uk-news', { view: 'category', id: 'uk-news' }],
    ['/feeds/the-guardian', { view: 'feed', id: 'the-guardian' }],
    ['/categories', { view: 'not-found' }],
    ['/unmatched/path', { view: 'not-found' }],
  ] as const) {
    await router.push(path)
    const route = router.currentRoute.value
    const matched = route.matched[0]!
    assert.equal(matched.components?.default, page)
    const props = matched.props.default
    assert.deepEqual(typeof props === 'function' ? props(route) : props, expected)
  }
})

test('navigation changes the page heading and sorted selection without requesting feeds', async t => {
  const request = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Navigation must not fetch')
  })
  const store = setup()
  store.feedStates = {
    guardian: { status: 'success', error: null, items: [item('older', 'guardian', '2026-10-26T00:00:00Z')] },
    other: { status: 'success', error: null, items: [item('newer', 'other', '2026-10-28T00:00:00Z')] },
  }
  const router = createRouter({ history: createMemoryHistory(), routes: createReaderRoutes({ render: () => null }) })
  const view = ref<ReaderView>('all')
  const id = ref<string>()
  const page = useReaderPage(view, id)
  for (const [path, expectedTitle, expectedItems] of [
    ['/', 'All feeds', ['newer', 'older']],
    ['/categories/news', 'News', ['newer', 'older']],
    ['/categories/uk-news', 'UK News', ['older']],
    ['/feeds/guardian', 'The Guardian', ['older']],
    ['/feeds/other', 'Other feed', ['newer']],
  ] as const) {
    await router.push(path)
    const route = router.currentRoute.value
    const props = route.matched[0]!.props.default
    const resolved = typeof props === 'function' ? props(route) : props
    assert.ok(typeof resolved === 'object')
    view.value = resolved.view
    id.value = resolved.id
    assert.equal(page.title.value, expectedTitle)
    assert.equal(page.found.value, true)
    assert.deepEqual(page.items.value.map(item => item.id), expectedItems)
  }
  assert.equal(request.mock.callCount(), 0)
})

test('loading and failure states are limited to feeds in the selected view and react to completion', () => {
  const store = setup()
  store.feedStates = {
    guardian: { status: 'loading', items: [], error: null },
    other: { status: 'error', items: [], error: { type: 'http', message: 'Other feed: HTTP 503' } },
  }
  const view = ref<ReaderView>('category')
  const id = ref<string | undefined>('uk-news')
  const page = useReaderPage(view, id)
  assert.equal(page.isLoading.value, true)
  assert.equal(page.pendingCount.value, 1)
  assert.deepEqual(page.errors.value, [])
  assert.equal(page.allFailed.value, false)
  store.feedStates.guardian = { status: 'success', items: [item('story', 'guardian', '2026-10-28T00:00:00Z')], error: null }
  assert.equal(page.isLoading.value, false)
  assert.equal(page.items.value.length, 1)
  view.value = 'all'
  id.value = undefined
  assert.equal(page.errors.value.length, 1)
  assert.equal(page.allFailed.value, false)
  view.value = 'feed'
  id.value = 'other'
  assert.equal(page.allFailed.value, true)
  assert.equal(page.items.value.length, 0)
})

test('empty categories are valid and unknown IDs are not-found even while unrelated feeds load', () => {
  const store = setup()
  store.feedStates.guardian = { status: 'loading', items: [], error: null }
  const view = ref<ReaderView>('category')
  const id = ref<string | undefined>('empty')
  const page = useReaderPage(view, id)
  assert.equal(page.found.value, true)
  assert.equal(page.title.value, 'Empty')
  assert.equal(page.feeds.value.length, 0)
  assert.equal(page.isLoading.value, false)
  assert.equal(page.allFailed.value, false)
  id.value = 'missing'
  assert.equal(page.found.value, false)
  assert.equal(page.title.value, 'Category not found')
  assert.deepEqual(page.items.value, [])
  assert.deepEqual(page.errors.value, [])
  view.value = 'feed'
  assert.equal(page.title.value, 'Feed not found')
  assert.equal(page.found.value, false)
  view.value = 'not-found'
  assert.equal(page.title.value, 'Page not found')
})
