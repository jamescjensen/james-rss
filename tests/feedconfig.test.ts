import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { validateFeedConfig } from '../server/config/validate.ts'

function config () {
  return {
    categories: [
      { id: 'news', name: 'News' },
      { id: 'uk-news', name: 'UK News' },
    ],
    feeds: [{
      id: 'the-guardian',
      name: 'The Guardian',
      url: 'https://www.theguardian.com/uk/rss',
      categoryIds: ['news', 'uk-news'],
    }],
  }
}

test('the repository configuration is valid', () => {
  const raw: unknown = JSON.parse(readFileSync(new URL('../server/config/feeds.json', import.meta.url), 'utf8'))
  assert.doesNotThrow(() => validateFeedConfig(raw))
})

test('preserves feed order and multiple manual categories', () => {
  const input = config()
  // HTTP feeds are allowed by the configuration contract.
  // eslint-disable-next-line unicorn/prefer-https
  input.feeds.push({ id: 'another', name: 'Another', url: 'http://example.com/rss', categoryIds: [] })
  assert.deepEqual(validateFeedConfig(input), input)
})

test('allows empty configuration and uncategorized feeds', () => {
  assert.deepEqual(validateFeedConfig({ categories: [], feeds: [] }), { categories: [], feeds: [] })
  const input = config()
  input.categories = []
  input.feeds[0]!.categoryIds = []
  assert.deepEqual(validateFeedConfig(input), input)
})

test('preserves an optional bias label and omits it when not configured', () => {
  const input = config()
  const result = validateFeedConfig({ ...input, feeds: [{ ...input.feeds[0], id: 'with-bias', bias: 'Custom label' }, ...input.feeds] })
  assert.equal(result.feeds[0]!.bias, 'Custom label')
  assert.equal(Object.hasOwn(result.feeds[1]!, 'bias'), false)
})

test('rejects empty, padded, or non-string bias labels', () => {
  const input = config()
  for (const bias of ['', ' ', ' padded', 'padded ', null, 42, false]) {
    assert.throws(() => validateFeedConfig({ ...input, feeds: [{ ...input.feeds[0], bias }] }), /feeds\[0\].bias/)
  }
})

test('rejects invalid configuration shapes', () => {
  for (const input of [null, [], 'feeds', {}, { categories: [], feeds: {} }, { categories: [null], feeds: [null] }]) {
    assert.throws(() => validateFeedConfig(input), /Invalid feed configuration/)
  }
})

test('reports duplicate IDs for both categories and feeds', () => {
  const input = config()
  input.categories.push(input.categories[0]!)
  input.feeds.push(input.feeds[0]!)
  assert.throws(() => validateFeedConfig(input), error => {
    assert.ok(error instanceof Error)
    assert.match(error.message, /categories\[2\].id duplicates ID "news"/)
    assert.match(error.message, /feeds\[1\].id duplicates ID "the-guardian"/)
    return true
  })
})

test('rejects empty names and route-unsafe IDs', () => {
  const input = config()
  input.categories[0]!.name = ' '
  input.feeds[0]!.id = '../feed'
  input.feeds[0]!.name = ''
  assert.throws(() => validateFeedConfig(input), error => {
    assert.ok(error instanceof Error)
    assert.match(error.message, /categories\[0\].name must be a non-empty string/)
    assert.match(error.message, /feeds\[0\].id must use lowercase/)
    assert.match(error.message, /feeds\[0\].name must be a non-empty string/)
    return true
  })
})

test('rejects malformed, relative, and non-HTTP feed URLs', () => {
  for (const url of ['', '/rss', 'not a URL', 'ftp://example.com/rss', 'javascript:alert(1)']) {
    const input = config()
    input.feeds[0]!.url = url
    assert.throws(() => validateFeedConfig(input), /feeds\[0\].url/)
  }
})

test('rejects unknown, duplicate, and non-string category references', () => {
  for (const categoryIds of [['missing'], ['news', 'news'], [null], 'news']) {
    const input = config()
    const invalid = { ...input, feeds: [{ ...input.feeds[0], categoryIds }] }
    assert.throws(() => validateFeedConfig(invalid), /feeds\[0\].categoryIds/)
  }
})
