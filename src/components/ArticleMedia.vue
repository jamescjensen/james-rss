<template>
  <figure v-if="url" class="article-media" :class="{ 'article-media-wide': media.type === 'audio' || media.type === 'video' }">
    <img
      v-if="media.type === 'image' && !failed"
      :alt="media.title || 'Feed image'"
      decoding="async"
      loading="lazy"
      referrerpolicy="no-referrer"
      :src="url"
      @error="failed = true"
    >

    <audio
      v-else-if="media.type === 'audio' && !failed"
      :aria-label="media.title || 'Audio attachment'"
      controls
      preload="none"
      :src="url"
      @error="failed = true"
    />

    <video
      v-else-if="media.type === 'video' && !failed"
      :aria-label="media.title || 'Video attachment'"
      controls
      playsinline
      preload="none"
      :src="url"
      @error="failed = true"
    />

    <figcaption v-if="media.title || failed || media.type !== 'image'">
      <a
        v-if="failed || media.type !== 'image'"
        class="article-media-link"
        :href="url"
        rel="noopener noreferrer"
        target="_blank"
      >
        {{ media.title || `Open ${media.type}` }}
        <span class="sr-only"> (opens in a new tab)</span>
      </a>

      <span v-else>{{ media.title }}</span>
    </figcaption>
  </figure>
</template>

<script lang="ts" setup>
  import type { FeedMedia } from '@/types/feed'
  import { computed, ref } from 'vue'
  import { httpUrl } from '@/feeds/url'

  const props = defineProps<{ media: FeedMedia }>()
  const url = computed(() => httpUrl(props.media.url))
  const failed = ref(false)
</script>
