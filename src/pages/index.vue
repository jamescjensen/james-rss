<template>
  <v-container class="reader-page">
    <header class="reader-header">
      <h1 class="reader-title">{{ title }}</h1>

      <p v-if="found" class="reader-subtitle">
        {{ items.length }} {{ items.length === 1 ? 'item' : 'items' }}
        from {{ feeds.length }} {{ feeds.length === 1 ? 'feed' : 'feeds' }} · Newest first
      </p>
    </header>

    <v-empty-state
      v-if="!found"
      icon="mdi-magnify"
      text="This page is not in the feed configuration. Choose a category or feed from the navigation."
    >
      <template #actions>
        <v-btn :to="{ name: 'all' }">All feeds</v-btn>
      </template>
    </v-empty-state>

    <section v-else :aria-busy="isLoading" aria-label="Feed items">
      <div v-if="isLoading" class="reader-section" role="status">
        <v-progress-linear aria-label="Loading feeds" indeterminate />

        <p class="reader-subtitle">
          Loading {{ pendingCount }} {{ pendingCount === 1 ? 'feed' : 'feeds' }}…
        </p>
      </div>

      <v-alert
        v-if="errors.length > 0"
        class="reader-section"
        :title="allFailed ? 'Feeds unavailable' : 'Some feeds could not load'"
        :type="allFailed ? 'error' : 'warning'"
        variant="tonal"
      >
        <ul>
          <li v-for="error in errors" :key="error.feedId">{{ error.message }}</li>
        </ul>
      </v-alert>

      <v-list v-if="items.length > 0" lines="two">
        <v-list-item
          v-for="item in items"
          :key="item.id"
          :append-icon="item.articleUrl ? 'mdi-open-in-new' : undefined"
          :href="item.articleUrl ?? undefined"
          :rel="item.articleUrl ? 'noopener noreferrer' : undefined"
          :target="item.articleUrl ? '_blank' : undefined"
        >
          <v-list-item-title class="reader-item-title">{{ item.title }}</v-list-item-title>

          <v-list-item-subtitle>
            {{ feedName(item.feedId) }} ·
            <time v-if="item.publishedAt" :datetime="item.publishedAt">{{ formatDate(item.publishedAt) }}</time>
            <span v-else>Publication date unknown</span>
          </v-list-item-subtitle>
        </v-list-item>
      </v-list>

      <v-empty-state
        v-else-if="!isLoading && !allFailed"
        icon="mdi-rss"
        :text="feeds.length > 0 ? 'No items are available from these feeds.' : 'No feeds are assigned to this view.'"
        title="No items yet"
      />
    </section>
  </v-container>
</template>

<script lang="ts" setup>
  import type { ReaderView } from '@/composables/reader'
  import { useReaderPage } from '@/composables/reader'
  import { useFeedStore } from '@/stores/feeds'

  const props = defineProps<{ view: ReaderView, id?: string }>()
  const store = useFeedStore()
  const { title, found, feeds, items, pendingCount, isLoading, errors, allFailed } = useReaderPage(
    () => props.view,
    () => props.id,
  )

  function feedName (feedId: string): string {
    return store.config.feeds.find(feed => feed.id === feedId)?.name ?? feedId
  }

  function formatDate (date: string): string {
    return new Date(date).toLocaleString()
  }
</script>
