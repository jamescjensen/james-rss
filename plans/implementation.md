# RSS reader implementation plan

All seven implementation steps are complete as of October 28, 2026. Operational setup, configuration, commands, deployment, and known limitations are documented in the [project README](../README.md). Test and live-feed results are recorded in the [verification report](verification.md).

## Scope and behavior

Build a simple RSS reader using the existing Vue, TypeScript, Vue Router, Pinia, and Vuetify stack.

- Maintain feeds and manually assigned categories in `server/config/feeds.json`. Edit this file manually; the development API watches changes, while production changes take effect after restarting the API. Refresh the reader to receive updated navigation metadata; no frontend rebuild is needed.
- Support an all-feeds page, a separate page for each manually defined category, and a separate page for each feed.
- Sort every page by publication date, newest first.
- Display each item in a shared card with its title, description, publication date, available media, and categories provided by the feed itself.
- Open the item's original linked page in a new tab when its card is activated. Do not create an article detail or wrapper page.
- Fetch feeds when the application loads. A browser refresh starts a new fetch. Do not add polling, background refresh, refresh timers, or a refresh button.
- Use standardized Vuetify components, shared wrappers where needed, and universal styles so equivalent controls look and behave consistently across pages.

## Configuration and data model

Keep the typed configuration loader and validation under `server/config/`, alongside `server/config/feeds.json`:

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

- Use stable IDs for route parameters and category references.
- Validate configuration only on the server. Expose category IDs/names and feed IDs/names/category assignments plus any optional bias labels through `/api/config`; do not include upstream feed URLs in the frontend model or bundle.
- Validate unique category/feed IDs, required names, HTTP(S) feed URLs, and category references. Report configuration errors clearly.
- Allow multiple categories per feed and feeds with no categories. Uncategorized feeds still appear on the all-feeds and individual-feed pages.
- Keep manually assigned categories separate from item categories supplied by RSS. Manual categories determine page membership; RSS categories are card metadata.
- Allow an optional, manually defined non-empty `bias` string per feed and show it beside the source name on article cards when present.
- Normalize items into a shared TypeScript model containing a stable item ID, feed ID, title, article URL, sanitized description, publication date, media attachments, and feed-provided item categories.
- Preserve item identity within its feed, preferring a feed GUID and falling back to a deterministic combination of available item fields. Remove repeated entries within a feed; do not merge independently published entries across feeds.

## Feed loading and normalization

- Fetch configured feeds through a Node.js/TypeScript API at `/api/feeds/:feedId`. Browser-direct requests failed during live checks, so feed fetching now runs on the server while XML normalization and HTML sanitization remain in the browser.
- Accept only configured feed IDs; preserve the final upstream URL in `X-Feed-URL` so relative links and media resolve correctly. Apply an upstream request timeout and response size limit, and return typed per-feed errors. Proxy `/api` through Vite locally and through the production host on the same origin.
- Start a single loading operation per application load: request public navigation metadata from `/api/config`, then load feed items by ID and retain results in a Pinia store. Route changes filter existing results without refetching. Show initial loading/configuration-failure states before resolving category/feed membership.
- Load feeds independently with bounded concurrency and request timeouts so a slow or broken feed does not block successful feeds.
- Parse RSS XML, including CDATA, standard item fields, media namespaces, and enclosure metadata. Detect malformed XML and unsupported feed formats with a useful feed-specific error.
- Resolve relative article and media URLs against the feed URL, accounting for a declared base URL where present. Permit only appropriate HTTP(S) destinations.
- Prefer the item's publication date and use another supplied item date only when necessary. Keep missing or invalid dates explicitly unknown rather than inventing a publication time.
- Sort valid dates in descending order; put undated items last. Use feed configuration order and original item order as deterministic tie-breakers.
- Read category metadata from each item's RSS category fields. Do not substitute manually configured categories for absent item metadata.
- Preserve description formatting through a maintained HTML sanitizer with a restrictive allowlist. Remove executable content, unsafe URLs, event handlers, and embedded scripts. Apply safe new-tab behavior to links inside descriptions too.
- Normalize supplied images, audio, and video from media fields, enclosures, and supported description markup. Avoid duplicating media already rendered in the description. Use native audio/video controls without autoplay; provide a safe attachment link for unsupported types.
- Surface network, timeout, HTTP, and parsing failures per feed while retaining successful results. Do not automatically retry.

## Routes and navigation

| Page | Route | Included items |
| --- | --- | --- |
| All feeds | `/` | Items from every configured feed |
| Category | `/categories/:categoryId` | Items from feeds assigned to that manual category |
| Feed | `/feeds/:feedId` | Items from the selected feed |

- Create navigation sections for All feeds, Categories, and Feeds using the configuration's display names and order.
- Use one reusable item-list page or shared list component with route-derived filtering, headings, and active navigation state.
- For the example configuration, provide separate News, UK News, and The Guardian pages. Guardian items appear on both category pages, the Guardian page, and the all-feeds page.
- Display a clear not-found state for unknown feed/category IDs and an empty state for valid pages with no items.
- Keep navigation usable on narrow screens through a responsive Vuetify application shell.
- Document the hosting fallback needed for direct navigation and refresh on Vue Router history routes.

## Cards and design consistency

- Implement one shared item card used on every page. Include the feed name as source context, especially for combined lists.
- Show the title, sanitized description, readable publication date, available media, and RSS item categories. Omit absent descriptions/media/categories gracefully and label unknown dates explicitly.
- Render at most one image per item: the first usable image in the description, or the first image attachment if the description contains none. Omit additional image variants while preserving audio, video, and other attachments.
- Expose the exact timestamp in a semantic `time` element when a valid date exists; display dates in the browser's locale and timezone.
- Make the card's primary article action a real link with `target="_blank"` and `rel="noopener noreferrer"`, supporting keyboard activation and browser link actions.
- Make non-interactive card areas activate that article link. Keep description links and media controls independently usable; prevent them from accidentally activating the card. Avoid nested anchors and provide a visible focus indicator.
- Ensure article URLs are validated before making cards clickable. Render items without a usable article URL as unavailable links rather than sending users to a wrapper page.
- Use Vuetify theme tokens and global component defaults for colors, typography, spacing, buttons, cards, and chips. Add shared wrappers only for repeated application-specific behavior.
- Centralize any universal utility classes in the existing global styles. Avoid page-specific versions of equivalent buttons or cards and arbitrary per-page visual overrides.
- Provide consistent loading, empty, partial-failure, and total-failure states using shared components or stock Vuetify patterns.

## Implementation sequence

1. Add configuration, validation, and shared TypeScript types. Document how to add a feed or category.
2. Implement feed fetching, XML normalization, description sanitization, media extraction, and deterministic sorting.
3. Add the Pinia store with one initial load, independent feed results, and route-independent state.
4. Replace the starter screen with the responsive application shell and all-feeds, category, and feed routes.
5. Build the shared item list/card and establish global Vuetify defaults and common states.
6. Verify behavior with representative local feed fixtures and actual configured feeds, including the backend request path, redirect URL preservation, and failure handling. Completed October 28, 2026; see [verification results](verification.md).
7. Update project documentation with configuration, npm commands, deployment routing requirements, and known limitations. Completed October 28, 2026; see the [project README](../README.md).

## Verification and acceptance criteria

- Use focused tests for configuration validation, RSS normalization, sanitization, media extraction, missing fields, duplicate entries, category membership, and date ordering. Select a test setup compatible with the existing Vite/TypeScript project when implementation begins.
- Verify the Guardian example appears on both manual category pages and its individual-feed page. Feed-provided item categories appear on cards and do not create manual navigation categories.
- Verify newest-first ordering independently on all three page types, including equal timestamps, missing dates, and invalid dates.
- Verify one failed or slow feed leaves other feeds readable and identifies the affected feed.
- Verify HTML descriptions retain safe formatting while scripts, event handlers, and unsafe links cannot execute.
- Verify image, audio, and video handling, independent media controls, keyboard navigation, focus visibility, and article links opening directly in new tabs.
- Verify route changes do not fetch feeds again, leaving the page idle causes no refresh, and a full browser refresh starts feed loading again.
- Check mobile and desktop layouts, consistent controls, empty states, unknown routes, and direct refresh of category/feed URLs.
- Run `npm run type-check`, `npm run lint`, `npm run build`, and the focused tests added for the data pipeline. Resolve failures before considering implementation complete.

## Initial exclusions

No accounts, database, read/unread tracking, bookmarks, config editor, article wrapper pages, scheduled refresh, or persistent feed cache.
