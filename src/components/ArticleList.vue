<template>
  <ol class="article-list">
    <li v-for="item in items" :key="item.id">
      <ArticleCard
        :feed-bias="feedsById.get(item.feedId)?.bias"
        :feed-name="feedsById.get(item.feedId)?.name ?? item.feedId"
        :item="item"
      />
    </li>
  </ol>
</template>

<script lang="ts" setup>
  import type { FeedDefinition, FeedItem } from '@/types/feed'
  import { computed } from 'vue'
  import ArticleCard from './ArticleCard.vue'

  const props = defineProps<{ items: readonly FeedItem[], feeds: readonly FeedDefinition[] }>()
  const feedsById = computed(() => new Map(props.feeds.map(feed => [feed.id, feed])))
</script>
