import type { MaybeRefOrGetter } from 'vue'
import { computed, toValue } from 'vue'
import { useFeedStore } from '../stores/feeds.ts'

export type ReaderView = 'all' | 'category' | 'feed' | 'not-found'

/** Derive page state exclusively from retained results; navigation never fetches. */
export function useReaderPage (
  view: MaybeRefOrGetter<ReaderView>,
  id: MaybeRefOrGetter<string | undefined>,
) {
  const store = useFeedStore()
  const category = computed(() => store.config.categories.find(category => category.id === toValue(id)))
  const feed = computed(() => store.config.feeds.find(feed => feed.id === toValue(id)))
  const found = computed(() => {
    switch (toValue(view)) {
      case 'all': { return true }
      case 'category': { return category.value !== undefined }
      case 'feed': { return feed.value !== undefined }
      default: { return false }
    }
  })
  const title = computed(() => {
    switch (toValue(view)) {
      case 'all': { return 'All feeds' }
      case 'category': { return category.value?.name ?? 'Category not found' }
      case 'feed': { return feed.value?.name ?? 'Feed not found' }
      default: { return 'Page not found' }
    }
  })
  const feeds = computed(() => {
    if (!found.value) {
      return []
    }
    switch (toValue(view)) {
      case 'category': { return store.config.feeds.filter(feed => feed.categoryIds.includes(toValue(id) ?? '')) }
      case 'feed': { return store.config.feeds.filter(feed => feed.id === toValue(id)) }
      default: { return store.config.feeds }
    }
  })
  const feedIds = computed(() => new Set(feeds.value.map(feed => feed.id)))
  const items = computed(() => store.items.filter(item => feedIds.value.has(item.feedId)))
  const pendingCount = computed(() => feeds.value.filter(feed => store.feedStates[feed.id]?.status === 'loading').length)
  const isLoading = computed(() => pendingCount.value > 0)
  const errors = computed(() => store.errors.filter(error => feedIds.value.has(error.feedId)))
  const allFailed = computed(() => feeds.value.length > 0 && errors.value.length === feeds.value.length)

  return { title, found, feeds, items, pendingCount, isLoading, errors, allFailed }
}
