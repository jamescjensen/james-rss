import type { FeedConfig, FeedError, FeedItem } from '../types/feed'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { fetchConfig } from '../api/config.ts'
import { loadFeeds } from '../api/feeds.ts'
import { sortFeedItems } from '../feeds/sort.ts'

export interface FeedState {
  status: 'loading' | 'success' | 'error'
  items: FeedItem[]
  error: FeedError | null
}

export const useFeedStore = defineStore('feeds', () => {
  const config = ref<FeedConfig>({ categories: [], feeds: [] })
  const feedStates = ref<Partial<Record<string, FeedState>>>({})
  const hasStarted = ref(false)
  const isConfigLoading = ref(false)
  const configError = ref<string | null>(null)
  // Private to this store instance; shared by callers while loading and after completion.
  let loadPromise: Promise<void> | undefined

  const isLoading = computed(() => isConfigLoading.value || Object.values(feedStates.value).some(state => state?.status === 'loading'))
  const hasFinished = computed(() => hasStarted.value && !isLoading.value)
  const items = computed(() => sortFeedItems(
    config.value.feeds.flatMap(feed => feedStates.value[feed.id]?.items ?? []),
    config.value.feeds,
  ))
  const errors = computed(() => config.value.feeds.flatMap(feed => {
    const error = feedStates.value[feed.id]?.error
    return error ? [{ feedId: feed.id, ...error }] : []
  }))

  function itemsForFeed (feedId: string): FeedItem[] {
    return items.value.filter(item => item.feedId === feedId)
  }

  function itemsForCategory (categoryId: string): FeedItem[] {
    const feedIds = new Set(config.value.feeds
      .filter(feed => feed.categoryIds.includes(categoryId))
      .map(feed => feed.id))
    return items.value.filter(item => feedIds.has(item.feedId))
  }

  function loadOnce (): Promise<void> {
    if (loadPromise) {
      return loadPromise
    }
    // Schedule work after reserving the promise, including calls from synchronous state watchers.
    loadPromise = Promise.resolve().then(async () => {
      const snapshot = await fetchConfig()
      config.value = snapshot
      feedStates.value = Object.fromEntries(snapshot.feeds.map(feed => [
        feed.id, { status: 'loading', items: [], error: null },
      ]))
      isConfigLoading.value = false
      await loadFeeds(snapshot.feeds, {
        onResult: result => {
          feedStates.value[result.feedId] = result.status === 'success'
            ? { status: 'success', items: result.items, error: null }
            : { status: 'error', items: [], error: result.error }
        },
      })
    }).catch((error: unknown) => {
      if (isConfigLoading.value) {
        configError.value = error instanceof Error && error.message.startsWith('Could not load the feed list')
          ? error.message
          : 'Could not load the feed list. Refresh the page to try again.'
        isConfigLoading.value = false
        return
      }
      // Expected request failures arrive through onResult; settle pending feeds if loading itself fails.
      for (const feed of config.value.feeds) {
        if (feedStates.value[feed.id]?.status === 'loading') {
          feedStates.value[feed.id] = {
            status: 'error',
            items: [],
            error: { type: 'network', message: `${feed.name}: Feed loading could not complete.` },
          }
        }
      }
    })
    isConfigLoading.value = true
    hasStarted.value = true
    return loadPromise
  }

  return {
    config,
    feedStates,
    hasStarted,
    isConfigLoading,
    configError,
    isLoading,
    hasFinished,
    items,
    errors,
    itemsForFeed,
    itemsForCategory,
    loadOnce,
  }
})
