<template>
  <v-app>
    <a class="skip-link" href="#reader-content">Skip to feed items</a>

    <v-app-bar border="b" flat>
      <v-app-bar-nav-icon
        v-if="mobile"
        :aria-expanded="drawer"
        aria-label="Toggle feed navigation"
        @click="drawer = !drawer"
      />

      <v-app-bar-title>RSS reader</v-app-bar-title>
    </v-app-bar>

    <v-navigation-drawer
      v-model="drawer"
      aria-label="Feed navigation"
      :permanent="!mobile"
      tag="nav"
      :temporary="mobile"
    >
      <v-list nav>
        <v-list-item
          color="primary"
          prepend-icon="mdi-rss"
          title="All feeds"
          :to="{ name: 'all' }"
          @click="closeNavigation"
        />

        <v-list-subheader>Categories</v-list-subheader>

        <v-list-item
          v-for="category in store.config.categories"
          :key="category.id"
          color="primary"
          prepend-icon="mdi-folder-outline"
          :title="category.name"
          :to="{ name: 'category', params: { categoryId: category.id } }"
          @click="closeNavigation"
        />

        <v-list-subheader>Feeds</v-list-subheader>

        <v-list-item
          v-for="feed in store.config.feeds"
          :key="feed.id"
          color="primary"
          prepend-icon="mdi-rss-box"
          :title="feed.name"
          :to="{ name: 'feed', params: { feedId: feed.id } }"
          @click="closeNavigation"
        />
      </v-list>
    </v-navigation-drawer>

    <v-main id="reader-content" tabindex="-1">
      <router-view />
    </v-main>
  </v-app>
</template>

<script lang="ts" setup>
  import { ref, watch } from 'vue'
  import { useRoute } from 'vue-router'
  import { useDisplay } from 'vuetify'
  import { useFeedStore } from '@/stores/feeds'

  const store = useFeedStore()
  const route = useRoute()
  const { mobile } = useDisplay()
  const drawer = ref(!mobile.value)

  watch(mobile, isMobile => {
    drawer.value = !isMobile
  })
  watch(() => route.fullPath, closeNavigation)

  function closeNavigation () {
    if (mobile.value) {
      drawer.value = false
    }
  }
</script>
