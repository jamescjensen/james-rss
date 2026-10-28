/**
 * main.ts
 *
 * Bootstraps Vuetify and other plugins then mounts the App`
 */

// Composables
import { createApp } from 'vue'
import { feedConfig } from '@/config'
// Plugins
import { registerPlugins } from '@/plugins'
import { useFeedStore } from '@/stores/feeds'

// Components
import App from './App.vue'

// Styles
import 'unfonts.css'
import './styles/tailwind.css'
import './styles/main.scss'

const app = createApp(App)

registerPlugins(app)

void useFeedStore().loadOnce(feedConfig)

app.mount('#app')
