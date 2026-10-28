<template>
  <v-container class="reader-page">
    <div v-if="store.isConfigLoading" role="status">
      <v-progress-linear aria-label="Loading feeds" indeterminate />

      <p class="reader-subtitle">Loading feeds…</p>
    </div>

    <v-alert
      v-else-if="store.configError"
      :text="store.configError"
      title="Reader unavailable"
      type="error"
    />

    <template v-else>
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
        >
          <ul>
            <li v-for="error in errors" :key="error.feedId">{{ error.message }}</li>
          </ul>
        </v-alert>

        <ArticleList v-if="items.length > 0" :feeds="feeds" :items="items" />

        <v-empty-state
          v-else-if="!isLoading && !allFailed"
          icon="mdi-rss"
          :text="feeds.length > 0 ? 'No items are available from these feeds.' : 'No feeds are assigned to this view.'"
          title="No items yet"
        />
      </section>
    </template>
  </v-container>
</template>

<script lang="ts" setup>
  import type { ReaderView } from '@/composables/reader'
  import ArticleList from '@/components/ArticleList.vue'
  import { useReaderPage } from '@/composables/reader'
  import { useFeedStore } from '@/stores/feeds'

  const props = defineProps<{ view: ReaderView, id?: string }>()
  const store = useFeedStore()
  const { title, found, feeds, items, pendingCount, isLoading, errors, allFailed } = useReaderPage(
    () => props.view,
    () => props.id,
  )
</script>
