# james-rss

A simple RSS reader built with Vue, TypeScript, Vuetify, Pinia, and Vue Router, backed by a small Node.js feed API.

The reader provides an all-feeds page, separate category pages, and individual feed pages, all newest first. Cards display the source, title, publication date, sanitized description, media, and RSS item categories. Clicking a card opens the original article in a new tab; description links and media controls work independently.

Feeds load once per page load. Navigation uses retained results, and a browser refresh fetches feeds again. There is no polling, automatic retry, persistent cache, account system, read tracking, or article wrapper page.

## Getting started

Use Node.js 22.22.2+ or 24.15+ and npm. These versions support the project's native TypeScript execution and jsdom tests.

```sh
npm ci
npm run dev
```

This starts both services:

| Service | Default address | Purpose |
| --- | --- | --- |
| Vite | `http://127.0.0.1:3000` | Reader UI and same-origin `/api` proxy |
| Feed API | `http://127.0.0.1:3001` | Server-owned configuration and upstream RSS requests |

Open the URL printed by Vite. If its default port is busy, Vite may choose another port. Stop the combined development command with Ctrl+C.

## Feed configuration

Edit [server/config/feeds.json](server/config/feeds.json). Configuration loading and validation live entirely under [server/config/](server/config/).

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

To add a category, append an object with an `id` and display `name` to `categories`. To add a feed, append an object with an `id`, display `name`, absolute HTTP(S) `url`, and `categoryIds` array to `feeds`.

- IDs contain lowercase letters and numbers separated by single hyphens, such as `uk-news`. Keep IDs stable because URLs use them.
- Category IDs must be unique within categories; feed IDs must be unique within feeds.
- Names must be non-empty. IDs, names, and URLs must not have surrounding whitespace.
- Category assignments must reference existing categories and cannot repeat within a feed. Use `[]` for an uncategorized feed.
- Array order determines navigation order. A feed may belong to multiple categories.

Manual categories determine page membership. The example feed appears on both News and UK News pages. Categories supplied by RSS items appear as card metadata and do not create navigation categories.

The API validates configuration before listening. Invalid configuration stops API startup with field-specific errors in the server logs. In development, the API watches configuration changes automatically. In production, restart the API after editing configuration. Refresh the browser to receive the updated list; configuration changes require no frontend rebuild.

The frontend receives only category IDs/names and feed IDs/names/category assignments from `/api/config`. Upstream feed URLs and the configuration validator are not bundled into the frontend. Each feed response supplies its upstream base URL separately for resolving article and media links.

## Reader behavior

| Route | Contents |
| --- | --- |
| `/` | All configured feeds |
| `/categories/:categoryId` | Feeds assigned to one manual category |
| `/feeds/:feedId` | One configured feed |

For the example configuration, `/categories/news`, `/categories/uk-news`, and `/feeds/the-guardian` are separate pages. Unknown IDs and unmatched paths show a not-found page. Valid views without items show an empty state. On narrow screens, the toolbar menu opens navigation, which closes after selecting a page.

Dates display in the browser's locale and timezone. Missing or invalid dates sort last. Equal dates use feed configuration order and original item order. Duplicate item identities are removed within each feed; independently published entries from different feeds remain separate.

Descriptions retain allowlisted HTML through DOMPurify. Each item displays at most one image: the first valid description image, or the first image attachment if there is no description image. Additional images and size variants are omitted. Images load lazily. Audio/video use native controls without autoplay; unsupported attachments and failed media provide external links. Missing metadata is handled without inventing publication dates or article destinations.

Every view uses shared `ArticleList`, `ArticleCard`, and `ArticleMedia` components. [Component defaults](src/plugins/defaults.ts) standardize Vuetify buttons, cards, chips, alerts, and progress indicators. [Global styles](src/styles/main.scss) provide shared layout, typography, media sizing, and focus indicators.

## API and loading

| Endpoint | Response |
| --- | --- |
| `GET /api/config` | Public navigation metadata, without upstream URLs |
| `GET /api/feeds/:feedId` | RSS XML for a configured feed ID |

The API accepts configured feed IDs only. Callers cannot supply arbitrary upstream URLs. Successful feed responses include `X-Feed-URL`, containing the final upstream URL after redirects. The browser uses it to resolve relative article and media links; a missing or unsafe base URL produces a feed error.

The reader requests configuration first, then loads up to four feeds concurrently. Each feed settles independently, keeping successful results readable when other feeds fail. Errors are scoped to feeds in the selected view. Configuration failure displays a reader-unavailable state before category/feed membership is resolved.

Upstream requests time out after 10 seconds, including response reading, and have a 5 MiB response limit. Upstream HTTP/network failures return HTTP 502; upstream timeouts return HTTP 504 with typed JSON errors. Browser requests time out after 15 seconds. Requests omit credentials, upstream cookies are not forwarded, and API responses use `Cache-Control: no-store`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm ci` | Install locked dependencies |
| `npm run dev` | Start the API watcher and Vite together |
| `npm run dev:api` | Start only the API watcher |
| `npm run dev:web` | Start only Vite, with an API already running |
| `npm run build` | Type-check and build the frontend into `dist/` |
| `npm run build-only` | Build the frontend without type-checking |
| `npm run type-check` | Check frontend, backend, and build configuration types |
| `npm test` | Run unit/integration and component suites |
| `npm run test:unit` | Check configuration, API, parsing, stores, and routes |
| `npm run test:components` | Check shared Vue card/list/media components |
| `npm run lint` | Check ESLint rules |
| `npm run lint:fix` | Apply ESLint fixes |
| `npm run preview` | Start the API and Vite build preview together |
| `npm run preview:web` | Start only Vite's build preview, with an API already running |
| `npm start` | Run the production API without watching |

Build before running preview:

```sh
npm run build
npm run preview
```

Preview starts its own API. Stop the development API first to avoid a port conflict. Vite's preview server is for local build checks; production hosting is described below.

## Production hosting

The frontend and API need the same public origin. Build and serve `dist/` as static files, run the API using `npm start`, and route `/api/` to that API before applying the frontend history fallback.

The API executes TypeScript directly with Node.js. Its runtime files are the root `package.json` and the `server/` directory, including configuration. Type-only references to frontend DTO declarations are stripped at runtime. `npm start` serves API responses only; it does not serve `dist/`.

| Environment variable | Default | Meaning |
| --- | --- | --- |
| `FEED_PORT` | `3001` | API listening port, an integer from 1 to 65535 |
| `FEED_HOST` | `127.0.0.1` | API bind address |

Development and preview proxies target `127.0.0.1` and follow `FEED_PORT`. For example, `FEED_PORT=3101 npm run dev` starts the API and configures Vite's proxy for port 3101. Leave the local bind address unchanged when using those proxies. A production reverse proxy must use the API's configured address and port.

For example, an Nginx server whose document root is the built `dist/` directory can use these locations with the API's default address:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3001;
}

location / {
    try_files $uri $uri/ /index.html;
}
```

Preserve API response headers, including `X-Feed-URL`, and exclude `/api/` responses from proxy caching. The history fallback allows direct visits and refreshes on URLs such as `/categories/news` and `/feeds/the-guardian`. Hosting the static build alone is insufficient because the reader requires the feed API.

## Troubleshooting and limitations

| Symptom | Check |
| --- | --- |
| Reader unavailable | Confirm the API is running and inspect server logs for configuration errors. |
| One feed fails | Check its configured URL and reported upstream status. Refresh the page to retry. |
| API cannot start | Check for an occupied port or invalid `FEED_PORT`; stop an existing API or choose another port. |
| Nested URL returns a server 404 | Configure the frontend history fallback. |
| Feed reports a missing upstream URL | Ensure the reverse proxy preserves `X-Feed-URL` and sends `/api/` to the API. |
| Configuration changes do not appear | Restart the production API and refresh the browser. |

RSS 0.9x/2.0 is supported. Atom and RDF feeds return an unsupported-format error. Server-side fetching removes the browser CORS requirement, but upstream access restrictions, outages, and invalid XML can still prevent a feed from loading. Unknown attachment formats open externally rather than through a custom player.

The build currently emits Vue Router's warning about an unspecified `rootDir`; type-checking and compilation pass. Verification covered the local application and fixtures, not a deployed production reverse proxy, other browser engines, or playback from a live audio/video stream.

## Project layout and verification

- `server/config/` — private feed configuration, types, loader, and validation
- `server/feeds.ts` — API routing and bounded upstream response reading
- `server/index.ts` — Node HTTP entry point
- `src/api/` — all frontend requests to the backend
- `src/feeds/` — XML normalization, sanitization, media extraction, and sorting
- `src/stores/feeds.ts` — one initial load and retained feed state
- `src/router/` and `src/composables/reader.ts` — routes and view-specific selections
- `src/components/` — shared article list, cards, and media
- `src/plugins/` and `src/styles/` — shared component defaults, theme, and styling
- `tests/` — Node tests, component tests, and RSS fixtures

The [implementation plan](plans/implementation.md) is complete. The [verification report](plans/verification.md) records 52 passing tests, both configured live feeds, request counts across navigation/refresh, failure simulations, and verification limits as of October 28, 2026.
