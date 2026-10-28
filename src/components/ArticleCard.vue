<template>
  <v-card :aria-labelledby="titleId" class="article-card" tag="article">
    <div class="article-body">
      <header>
        <p class="article-meta">
          <span>{{ feedName }}</span>
          <span aria-hidden="true"> · </span>
          <time v-if="publicationDate" :datetime="publicationDate.toISOString()">{{ publicationDate.toLocaleString() }}</time>
          <span v-else>Publication date unknown</span>
        </p>

        <h2 :id="titleId" class="article-title">
          <a
            v-if="articleUrl"
            :aria-label="`${item.title || 'Untitled item'} (opens in a new tab)`"
            class="article-link"
            :href="articleUrl"
            rel="noopener noreferrer"
            target="_blank"
          >
            {{ item.title || 'Untitled item' }}
            <v-icon aria-hidden="true" icon="mdi-open-in-new" size="18" />
          </a>

          <span v-else>{{ item.title || 'Untitled item' }}</span>
        </h2>
      </header>

      <!-- Only HTML produced by the feed sanitizer is accepted here. -->
      <div v-if="item.sanitizedDescription" class="article-description" v-html="item.sanitizedDescription" />

      <div v-if="item.media.length > 0" class="article-media-list">
        <ArticleMedia v-for="media in item.media" :key="media.url" :media="media" />
      </div>

      <ul v-if="item.categories.length > 0" aria-label="RSS categories" class="article-categories">
        <li v-for="category in item.categories" :key="category">
          <v-chip>{{ category }}</v-chip>
        </li>
      </ul>

      <p v-if="!articleUrl" class="article-meta">Article link unavailable</p>
    </div>
  </v-card>
</template>

<script lang="ts" setup>
  import type { FeedItem } from '@/types/feed'
  import { computed, useId } from 'vue'
  import { httpUrl } from '@/feeds/url'
  import ArticleMedia from './ArticleMedia.vue'

  const props = defineProps<{ item: FeedItem, feedName: string }>()
  const titleId = useId()
  const articleUrl = computed(() => httpUrl(props.item.articleUrl))
  const publicationDate = computed(() => {
    const timestamp = props.item.publishedAt === null ? Number.NaN : Date.parse(props.item.publishedAt)
    return Number.isFinite(timestamp) ? new Date(timestamp) : null
  })
</script>
