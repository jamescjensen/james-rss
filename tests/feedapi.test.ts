import type { ServerFeedConfig } from '../server/config/types.ts'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createFeedHandler } from '../server/feeds.ts'

const config: ServerFeedConfig = {
  categories: [],
  feeds: [{ id: 'guardian', name: 'The Guardian', url: 'https://www.theguardian.com/uk/rss', categoryIds: [] }],
}

function request (path = '/api/feeds/guardian', method = 'GET'): Request {
  return new Request(`http://localhost${path}`, { method })
}

test('publishes navigation metadata without upstream URLs or fetching any feeds', async () => {
  const handler = createFeedHandler({
    ...config,
    categories: [{ id: 'news', name: 'News' }],
    feeds: [{ ...config.feeds[0]!, categoryIds: ['news'] }],
  }, { fetch: async () => {
    throw new Error('Config must not fetch feeds')
  } })
  const response = await handler(request('/api/config'))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.deepEqual(await response.json(), {
    categories: [{ id: 'news', name: 'News' }],
    feeds: [{ id: 'guardian', name: 'The Guardian', categoryIds: ['news'] }],
  })
})

test('fetches only the configured URL, forwards no credentials, and exposes the final URL', async () => {
  let calls = 0
  const handler = createFeedHandler(config, { fetch: async (url, options) => {
    calls++
    assert.equal(url, config.feeds[0]!.url)
    assert.equal(options?.credentials, 'omit')
    assert.equal(options?.cache, 'no-store')
    assert.equal(new Headers(options?.headers).has('cookie'), false)
    const response = new Response('<rss><channel/></rss>', { headers: { 'Set-Cookie': 'secret=value' } })
    Object.defineProperty(response, 'url', { value: 'https://www.theguardian.com/uk/rss?redirected' })
    return response
  } })
  for (let index = 0; index < 2; index++) {
    const response = await handler(request('/api/feeds/guardian?url=https://unconfigured.example'))
    assert.equal(response.status, 200)
    assert.equal(await response.text(), '<rss><channel/></rss>')
    assert.equal(response.headers.get('X-Feed-URL'), 'https://www.theguardian.com/uk/rss?redirected')
    assert.equal(response.headers.get('Cache-Control'), 'no-store')
    assert.equal(response.headers.get('Content-Type'), 'application/rss+xml; charset=utf-8')
    assert.equal(response.headers.get('Set-Cookie'), null)
  }
  assert.equal(calls, 2)
})

test('rejects unknown IDs, arbitrary URLs, and unsupported methods without upstream requests', async () => {
  let calls = 0
  const handler = createFeedHandler(config, { fetch: async () => {
    calls++
    throw new Error('No upstream request expected')
  } })
  for (const path of ['/api/feeds/missing', '/api/feeds/https%3A%2F%2Fevil.example', '/api/feeds', '/api/elsewhere']) {
    assert.equal((await handler(request(path))).status, 404)
  }
  const response = await handler(request('/api/feeds/guardian', 'POST'))
  assert.equal(response.status, 405)
  assert.equal(response.headers.get('Allow'), 'GET')
  assert.equal(calls, 0)
})

test('reports upstream HTTP and network failures without retrying', async () => {
  for (const offline of [false, true]) {
    let calls = 0
    const handler = createFeedHandler(config, { fetch: async () => {
      calls++
      if (offline) {
        throw new TypeError('Network failure')
      }
      return new Response('', { status: 403 })
    } })
    const response = await handler(request())
    assert.equal(response.status, 502)
    const body = await response.json()
    assert.equal(body.error.type, offline ? 'network' : 'http')
    assert.equal(response.headers.get('Cache-Control'), 'no-store')
    assert.equal(calls, 1)
  }
})

test('times out both requests and response bodies and aborts upstream work', async () => {
  for (const bodyStalls of [false, true]) {
    let signal: AbortSignal | undefined
    const handler = createFeedHandler(config, { timeoutMs: 15, fetch: async (_url, options) => {
      signal = options?.signal ?? undefined
      return bodyStalls ? new Response(new ReadableStream()) : new Promise<Response>(() => {})
    } })
    const response = await handler(request())
    assert.equal(response.status, 504)
    assert.equal((await response.json()).error.type, 'timeout')
    assert.equal(signal?.aborted, true)
  }
})

test('limits response size even without a content-length header and cancels the body', async () => {
  let canceled = false
  const handler = createFeedHandler(config, { maxBytes: 4, fetch: async () => new Response(new ReadableStream({
    start (controller) {
      controller.enqueue(new TextEncoder().encode('too large'))
    },
    cancel () {
      canceled = true
    },
  })) })
  const response = await handler(request())
  assert.equal(response.status, 502)
  assert.match((await response.json()).error.message, /response limit/)
  assert.equal(canceled, true)
})

test('validates proxy resource limits', () => {
  assert.throws(() => createFeedHandler(config, { timeoutMs: 0 }), RangeError)
  assert.throws(() => createFeedHandler(config, { timeoutMs: Number.NaN }), RangeError)
  assert.throws(() => createFeedHandler(config, { maxBytes: -1 }), RangeError)
})
