# james-rss

Scaffolded with Vuetify CLI.

## Feed configuration

Edit `server/config/feeds.json` to maintain the feed list and manual categories. Configuration and validation live on the server. Restart the API after editing production configuration, then refresh the reader; no frontend rebuild is needed. The development API watches configuration changes automatically.

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

Configuration is loaded and validated by `server/config/index.ts` before the API starts. Invalid configuration stops server startup with field-specific errors in the server logs. The frontend receives only category IDs/names and feed IDs/names/category assignments from `/api/config`; upstream feed URLs are absent from this navigation response and the frontend bundle. Run `npm test` to validate the checked-in configuration and exercise the API, feed pipeline, and store.

The tests use Node's built-in TypeScript support and jsdom; use Node.js 22.22.2+ or 24.15+.

## Feed pipeline

All frontend requests to the backend live in `src/api/`: `config.ts` loads public navigation metadata, and `feeds.ts` handles feed requests, timeouts, API errors, and concurrent loading. XML parsing, description sanitization, media extraction, and sorting remain in `src/feeds/`.

- `fetchFeed(feed)` requests `/api/feeds/:feedId` and normalizes the returned XML, yielding either items or a typed, feed-specific error. Requests omit credentials and bypass the browser cache. The browser timeout is 15 seconds and includes reading the response body.
- `loadFeeds(feeds, options)` loads up to four feeds concurrently by default. Its optional `onResult` callback receives each result as it finishes; the final result array follows configuration order. There are no automatic retries, polling, or persistent caching.
- `parseFeed(xml, feed, sourceUrl)` parses RSS 0.9x/2.0 XML using the API-supplied upstream base URL. Atom and RDF feeds return an explicit unsupported-format error. Item identity uses GUIDs when supplied and otherwise a deterministic combination of item fields; repeated identities are removed within a feed.
- `sortFeedItems(items, feeds)` returns a new newest-first array. Missing/invalid dates sort last; equal dates use feed configuration order followed by the original item order. Keep each feed's parsed item order when combining results.

Descriptions retain allowlisted HTML formatting through DOMPurify. Links use HTTP(S) destinations and open safely in new tabs. Embedded images and native audio/video controls remain in sanitized descriptions without autoplay; matching enclosure/media URLs are omitted from the separate media array. Other enclosures become typed media or attachment links. Common file extensions identify media when a publisher omits its type.

## Feed backend

Feed queries run through a small Node.js/TypeScript API so upstream feeds do not need browser CORS support. The browser still parses XML and sanitizes descriptions. No additional runtime packages are required for the backend.

- `GET /api/config` returns public navigation metadata without upstream URLs. Only the server loads and validates the local JSON configuration.
- `GET /api/feeds/:feedId` accepts only IDs in `server/config/feeds.json`; request parameters cannot choose an arbitrary upstream URL.
- Successful responses contain RSS XML and an `X-Feed-URL` header with the final upstream URL after redirects. The browser uses that URL to resolve relative article and media links.
- Upstream requests have a 10-second timeout, including response reading, and a 5 MiB response limit. Upstream HTTP/network failures return HTTP 502; timeouts return HTTP 504, with typed JSON errors that the reader displays per feed.
- The API omits credentials, forwards no upstream cookies, and returns `Cache-Control: no-store`. Each browser reload queries feeds again. There is no polling, retry loop, or persistent cache.

`npm run dev` starts both Vite on `127.0.0.1:3000` and the API on `127.0.0.1:3001`. Vite proxies `/api` to the backend. The API watches source/config imports during development. `npm run preview` starts the API and Vite's build preview together after `npm run build`.

`npm start` runs the API alone for production. Its runtime files live entirely in `server/`, including configuration; Node.js strips type-only imports of the public DTO types from `src/types/feed.ts`. Use Node.js with built-in TypeScript support. Set `FEED_PORT` to change the API port and `FEED_HOST` to change its bind address. Development/preview proxies follow `FEED_PORT`; the default local bind address is recommended behind a reverse proxy.

## Feed store and startup

`src/main.ts` starts `useFeedStore().loadOnce()` after installing Pinia, without waiting for network requests before mounting the application. The store first requests `/api/config`, then loads feed items by ID. It retains public navigation metadata and all feed results in memory for that application instance.

- `feedStates[feedId]` exposes each feed's loading/success/error status, items, and error. Successful results become available independently while other feeds are still loading.
- `hasStarted`, `isLoading`, `hasFinished`, and `errors` support overall loading and failure states. Finishing means all feeds have settled, including failures.
- `isConfigLoading` and `configError` expose initial feed-list loading and failure independently. Reader pages wait for this request before deciding whether a category/feed exists.
- `items`, `itemsForCategory(categoryId)`, and `itemsForFeed(feedId)` expose newest-first selections without fetching. Category membership uses manual feed assignments, including multiple categories per feed. Unknown IDs and empty categories return no items.
- Overlapping and subsequent `loadOnce` calls reuse the initial load, including after a failure. Page navigation does not trigger refreshes. A full browser reload creates a new store and fetches feeds again; there is no automatic refresh or persistent cache.

## Reader navigation

The responsive Vuetify shell lists categories and feeds in configuration order. On narrow screens, the toolbar menu opens the navigation drawer; selecting a page closes it. Each page filters retained store results and shows its own loading, error, empty, or not-found state.

- `/` displays all feeds.
- `/categories/:categoryId` displays feeds assigned to one manual category, such as `/categories/news` and `/categories/uk-news`.
- `/feeds/:feedId` displays one feed, such as `/feeds/the-guardian`.

Unknown IDs and other unmatched paths show a not-found page. Every reader view uses `ArticleList` and `ArticleCard` to display the source, publication date, sanitized description, media, and RSS item categories. Non-interactive card areas follow a real article link to the original URL in a new tab; description links and native media controls work independently. There are no wrapper article pages.

Each card displays at most one image: the first usable description image, or the first image attachment when the description has none. Additional images, including size variants, are omitted. `ArticleMedia` displays lazy-loaded images and native audio/video controls without autoplay. Audio, video, and other attachments remain available. Unsupported attachments and failed media provide safe external links. Missing descriptions, dates, categories, or article URLs are handled without inventing content.

Shared component defaults in `src/plugins/defaults.ts` standardize Vuetify buttons, cards, chips, alerts, and progress indicators. Shared classes in `src/styles/main.scss` handle card layout, description typography, focus indicators, responsive media, and phone spacing across all views.

### Hosting and direct links

Vue Router uses HTML5 history. Configure the production host to serve `dist/index.html` for application routes such as `/categories/news` and `/feeds/the-guardian`, while serving existing assets normally. Route `/api/` to the running feed API on the same origin, before applying the SPA fallback. For example, an Nginx server rooted at `dist/` with the API running on its default port can use:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3001;
}

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
- `npm run dev:api` — API only, with source watching
- `npm run dev:web` — Vite only, when the API is already running
- `npm start` — production API
- `npm run build`
- `npm run preview`
- `npm run build-only`
- `npm run type-check`
- `npm test`
- `npm run test:unit` — configuration, API, parsing, store, and routing tests
- `npm run test:components` — shared card/list/media tests with Vitest and Vue Test Utils
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
