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

Configuration is validated before the application starts. Invalid configuration stops startup with field-specific errors in the browser console. Run `npm test` to validate the checked-in configuration and exercise the validation rules. Feed fetching and reader pages are covered by later steps in `plans/implementation.md`.

The tests use Node's built-in TypeScript support and jsdom; use Node.js 22.22.2+ or 24.15+.

## Feed pipeline

The feed utilities in `src/feeds/` are available for the reader store to consume:

- `fetchFeed(feed)` fetches and normalizes one feed, returning either items or a typed, feed-specific error. Requests omit credentials and bypass the browser cache. The default timeout is 15 seconds and includes reading the response body.
- `loadFeeds(feeds, options)` loads up to four feeds concurrently by default. Its optional `onResult` callback receives each result as it finishes; the final result array follows configuration order. There are no automatic retries, polling, or persistent caching.
- `parseFeed(xml, feed)` parses RSS 0.9x/2.0 XML. Atom and RDF feeds return an explicit unsupported-format error. Item identity uses GUIDs when supplied and otherwise a deterministic combination of item fields; repeated identities are removed within a feed.
- `sortFeedItems(items, feeds)` returns a new newest-first array. Missing/invalid dates sort last; equal dates use feed configuration order followed by the original item order. Keep each feed's parsed item order when combining results.

Descriptions retain allowlisted HTML formatting through DOMPurify. Links use HTTP(S) destinations and open safely in new tabs. Embedded images and native audio/video controls remain in sanitized descriptions without autoplay; matching enclosure/media URLs are omitted from the separate media array. Other enclosures become typed media or attachment links for the future card component.

Fetching is browser-direct. A network error mentions possible CORS restrictions because browsers do not reliably distinguish those from other network failures. No proxy has been added. The pipeline is not yet connected to application startup; loading state and route-independent storage belong to implementation step 3.

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
