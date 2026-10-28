import type { FeedItem } from '../../src/types/feed'
import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import { createVuetify } from 'vuetify'
import ArticleCard from '../../src/components/ArticleCard.vue'
import ArticleList from '../../src/components/ArticleList.vue'
import ArticleMedia from '../../src/components/ArticleMedia.vue'
import { sanitizeDescription } from '../../src/feeds/description'
import { componentDefaults } from '../../src/plugins/defaults'

function item (overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: 'story', feedId: 'guardian', title: 'A story', articleUrl: 'https://example.com/story',
    publishedAt: '2026-10-28T01:00:00.000Z', sanitizedDescription: '', media: [], categories: ['World', 'UK'],
    ...overrides,
  }
}

function plugins () {
  return [createVuetify({ defaults: componentDefaults })]
}

test('renders item metadata and a real, safely opened article link without wrapping other content', () => {
  const wrapper = mount(ArticleCard, { props: { item: item(), feedName: 'The Guardian' }, global: { plugins: plugins() } })
  expect(wrapper.element.tagName).toBe('ARTICLE')
  expect(wrapper.get('h2').text()).toContain('A story')
  expect(wrapper.text()).toContain('The Guardian')
  expect(wrapper.get('time').attributes('datetime')).toBe('2026-10-28T01:00:00.000Z')
  expect(wrapper.get('a.article-link').attributes()).toMatchObject({
    href: 'https://example.com/story', target: '_blank', rel: 'noopener noreferrer',
  })
  expect(wrapper.get('ul[aria-label="RSS categories"]').text()).toContain('World')
  expect(wrapper.get('ul[aria-label="RSS categories"]').text()).toContain('UK')
  expect(wrapper.attributes('aria-labelledby')).toBe(wrapper.get('h2').attributes('id'))
})

test('keeps description links and native controls independent from the primary article link', async () => {
  const description = sanitizeDescription(`
    <p>Safe <strong>formatting</strong><script>alert(1)</script></p>
    <a href="/related">Related article</a><audio src="/clip.mp3" autoplay></audio>`, 'https://example.com/')
  const wrapper = mount(ArticleCard, {
    props: { item: item({ sanitizedDescription: description.html }), feedName: 'The Guardian' },
    global: { plugins: plugins() },
  })
  expect(wrapper.get('.article-description strong').text()).toBe('formatting')
  expect(wrapper.find('script').exists()).toBe(false)
  const link = wrapper.get('.article-description a')
  expect(link.attributes()).toMatchObject({ href: 'https://example.com/related', target: '_blank', rel: 'noopener noreferrer' })
  expect(wrapper.find('a a').exists()).toBe(false)
  const audio = wrapper.get('audio')
  expect(audio.element.closest('a')).toBeNull()
  expect(audio.attributes('controls')).toBeDefined()
  expect(audio.attributes('autoplay')).toBeUndefined()
  await audio.trigger('click')
  expect(wrapper.get('.article-link').attributes('href')).toBe('https://example.com/story')
})

test('handles missing fields and refuses unsafe article URLs', () => {
  const wrapper = mount(ArticleCard, {
    props: { item: item({ title: '', articleUrl: 'javascript:alert(1)', publishedAt: 'invalid', categories: [] }), feedName: 'Feed' },
    global: { plugins: plugins() },
  })
  expect(wrapper.text()).toContain('Untitled item')
  expect(wrapper.text()).toContain('Publication date unknown')
  expect(wrapper.text()).toContain('Article link unavailable')
  expect(wrapper.find('a').exists()).toBe(false)
  expect(wrapper.find('time').exists()).toBe(false)
  expect(wrapper.find('.article-description').exists()).toBe(false)
  expect(wrapper.find('.article-categories').exists()).toBe(false)
})

test('renders audio/video controls without autoplay and provides attachment links', () => {
  const wrapper = mount(ArticleCard, {
    props: { item: item({ media: [
      { url: 'https://example.com/sound.mp3', type: 'audio' },
      { url: 'https://example.com/movie.mp4', type: 'video' },
      { url: 'https://example.com/report.pdf', type: 'attachment', title: 'Report' },
    ] }), feedName: 'Feed' },
    global: { plugins: plugins() },
  })
  for (const control of wrapper.findAll('audio, video')) {
    expect(control.attributes('controls')).toBeDefined()
    expect(control.attributes('preload')).toBe('none')
    expect(control.attributes('autoplay')).toBeUndefined()
    expect(control.element.closest('a')).toBeNull()
  }
  expect(wrapper.get('a[href="https://example.com/report.pdf"]').text()).toContain('Report')
  expect(wrapper.get('a[href="https://example.com/report.pdf"]').attributes('target')).toBe('_blank')
})

test('failed images and video become usable external media links', async () => {
  for (const type of ['image', 'video'] as const) {
    const wrapper = mount(ArticleMedia, { props: { media: { url: `https://example.com/${type}`, type } } })
    await wrapper.get(type === 'image' ? 'img' : 'video').trigger('error')
    expect(wrapper.find('img, video').exists()).toBe(false)
    expect(wrapper.get('a').attributes()).toMatchObject({
      href: `https://example.com/${type}`, target: '_blank', rel: 'noopener noreferrer',
    })
  }
})

test('unsafe media URLs render no media or attachment link', () => {
  const wrapper = mount(ArticleMedia, { props: { media: { type: 'image', url: 'javascript:alert(1)' } } })
  expect(wrapper.find('figure, img, a').exists()).toBe(false)
})

test('the shared list preserves sorted input, identifies sources, and gives headings unique IDs', () => {
  const wrapper = mount(ArticleList, {
    props: {
      items: [item({ id: 'new', title: 'New story' }), item({ id: 'old', title: 'Older story', feedId: 'other' })],
      feeds: [{ id: 'guardian', name: 'The Guardian', categoryIds: [] }, { id: 'other', name: 'Other feed', categoryIds: [] }],
    },
    global: { plugins: plugins() },
  })
  const cards = wrapper.findAll('article')
  expect(cards.map(card => card.get('h2').text())).toEqual(['New story', 'Older story'])
  expect(cards[0]!.text()).toContain('The Guardian')
  expect(cards[1]!.text()).toContain('Other feed')
  expect(cards[0]!.get('h2').attributes('id')).not.toBe(cards[1]!.get('h2').attributes('id'))
})
