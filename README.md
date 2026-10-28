# james-rss

Scaffolded with Vuetify CLI.

## Feed configuration

Edit `src/config/feeds.json` to maintain the feed list and manual categories. The file is bundled with the application; restart the development server or rebuild the deployed application after editing it.

```json
{
  "categories": [
    { "id": "news", "name": "News" },
    { "id": "uk-news", "name": "UK News" }
  ],
  "feeds": [
    {
      "id": "the-guardian",
      "name": "The Guardian",
      "url": "https://www.theguardian.com/uk/rss",
      "categoryIds": ["news", "uk-news"]
    }
  ]
}
```

To add a category, append an entry to `categories` with a unique, stable `id` and a display `name`. To add a feed, append an entry to `feeds` with a unique, stable `id`, a display `name`, an absolute HTTP(S) `url`, and a `categoryIds` array referencing existing categories. Use `[]` for feeds without a manual category. Array order determines navigation order.

IDs use lowercase letters and numbers separated by single hyphens, such as `uk-news`. Names must be non-empty, and IDs, names, and URLs must not contain leading or trailing whitespace. Category IDs and feed IDs must be unique within their respective lists. Duplicate category assignments are rejected.

Manual categories determine category page membership. Categories supplied by individual RSS items are separate card metadata and do not change the manual categories. For the example above, The Guardian belongs to both News and UK News.

Configuration is validated before the application starts. Invalid configuration stops startup with field-specific errors in the browser console. Run `npm test` to validate the checked-in configuration and exercise the feed pipeline and store. Reader pages are covered by later steps in `plans/implementation.md`.

The tests use Node's built-in TypeScript support and jsdom; use Node.js 22.22.2+ or 24.15+.

## Feed pipeline

The feed utilities in `src/feeds/` are available for the reader store to consume:

- `fetchFeed(feed)` fetches and normalizes one feed, returning either items or a typed, feed-specific error. Requests omit credentials and bypass the browser cache. The default timeout is 15 seconds and includes reading the response body.
- `loadFeeds(feeds, options)` loads up to four feeds concurrently by default. Its optional `onResult` callback receives each result as it finishes; the final result array follows configuration order. There are no automatic retries, polling, or persistent caching.
- `parseFeed(xml, feed)` parses RSS 0.9x/2.0 XML. Atom and RDF feeds return an explicit unsupported-format error. Item identity uses GUIDs when supplied and otherwise a deterministic combination of item fields; repeated identities are removed within a feed.
- `sortFeedItems(items, feeds)` returns a new newest-first array. Missing/invalid dates sort last; equal dates use feed configuration order followed by the original item order. Keep each feed's parsed item order when combining results.

Descriptions retain allowlisted HTML formatting through DOMPurify. Links use HTTP(S) destinations and open safely in new tabs. Embedded images and native audio/video controls remain in sanitized descriptions without autoplay; matching enclosure/media URLs are omitted from the separate media array. Other enclosures become typed media or attachment links for the future card component.

Fetching is browser-direct. A network error mentions possible CORS restrictions because browsers do not reliably distinguish those from other network failures. No proxy has been added.

## Feed store and startup

`src/main.ts` starts `useFeedStore().loadOnce(feedConfig)` after installing Pinia, without waiting for network requests before mounting the application. The store in `src/stores/feeds.ts` retains the first configuration and all feed results in memory for that application instance.

- `feedStates[feedId]` exposes each feed's loading/success/error status, items, and error. Successful results become available independently while other feeds are still loading.
- `hasStarted`, `isLoading`, `hasFinished`, and `errors` support overall loading and failure states. Finishing means all feeds have settled, including failures.
- `items`, `itemsForCategory(categoryId)`, and `itemsForFeed(feedId)` expose newest-first selections without fetching. Category membership uses manual feed assignments, including multiple categories per feed. Unknown IDs and empty categories return no items.
- Overlapping and subsequent `loadOnce` calls reuse the initial load, including after a failure. Page navigation does not trigger refreshes. A full browser reload creates a new store and fetches feeds again; there is no automatic refresh or persistent cache.

## Reader navigation

The responsive Vuetify shell lists categories and feeds in configuration order. On narrow screens, the toolbar menu opens the navigation drawer; selecting a page closes it. Each page filters retained store results and shows its own loading, error, empty, or not-found state.

- `/` displays all feeds.
- `/categories/:categoryId` displays feeds assigned to one manual category, such as `/categories/news` and `/categories/uk-news`.
- `/feeds/:feedId` displays one feed, such as `/feeds/the-guardian`.

Unknown IDs and other unmatched paths show a not-found page. Article links open the original URL in a new tab. The shared page currently uses a stock Vuetify item list; full article cards, descriptions, and media rendering belong to step 5.

### Hosting and direct links

Vue Router uses HTML5 history. Configure the production host to serve `dist/index.html` for application routes such as `/categories/news` and `/feeds/the-guardian`, while serving existing assets normally. Without this fallback, opening or refreshing a nested URL may produce a server 404. For example, an Nginx server rooted at `dist/` can use:

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

The Vite development server and `npm run preview` provide SPA fallback locally. Refreshing any reader URL starts the feed load for a fresh application instance.

## ❗️ Documentation

- Primary docs: https://vuetifyjs.com/
- Getting started guide: https://vuetifyjs.com/en/getting-started/installation/
- Community support: https://community.vuetifyjs.com/
- Issue tracker: https://issues.vuetifyjs.com/

## 🧱 Stack

- Framework: Vue 3 + Vite
- UI Library: Vuetify
- Language: TypeScript
- Package manager: npm

## 🧭 Start Here

- Main entry: `src/main.ts`
- Main app component: `src/App.vue`
- Main styles: `src/styles/`
- Plugin setup: `src/plugins/`

## 📁 Project Structure

- `src/main.ts` — application entry point
- `src/App.vue` — root component
- `src/components/` — reusable Vue components
- `src/plugins/` — plugin registration and setup
- `src/styles/` — global styles and theme settings
- `public/` — static public files

## ✨ Enabled Features

- ESLint
- Vuetify MCP
- Pinia
- Vue Router
- Tailwind CSS

## 💿 Install

Use your selected package manager (npm) to install dependencies:

```bash
npm install
```

## 🚀 Quick Start

```bash
npm install
npm run dev
```

## 🏗️ Build

```bash
npm run build
```

## 🧪 Available Scripts

- `npm run dev`
- `npm run build`
- `npm run preview`
- `npm run build-only`
- `npm run type-check`
- `npm test`
- `npm run lint`
- `npm run lint:fix`

## 🤖 Vuetify MCP Server

This project is configured with the Vuetify Model Context Protocol (MCP) server.
To install and configure the MCP server for your favorite IDE (Cursor, Trae, Windsurf, VS Code, Claude Desktop, etc.) run:

```bash
npx -y @vuetify/mcp-cli
```

This will open an interactive setup wizard to help you connect your AI assistant to the Vuetify ecosystem.

## 💪 Support Vuetify Development

This project uses Vuetify - an MIT licensed Open Source project. We are glad to welcome contributors and any support for ongoing development:

- Contribute to Vuetify and ecosystem projects: https://github.com/vuetifyjs
- Request enterprise support: https://support.vuetifyjs.com/
- Sponsor on GitHub: https://github.com/sponsors/vuetifyjs
- Support on Open Collective: https://opencollective.com/vuetify
