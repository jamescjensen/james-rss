import type { FeedDefinition, FeedItem } from '../types/feed'

/** Preserve XML order for ties within a feed and config order for ties across feeds. */
export function sortFeedItems (items: readonly FeedItem[], feeds: readonly FeedDefinition[]): FeedItem[] {
  const ranks = new Map(feeds.map((feed, index) => [feed.id, index]))
  const entries = items.map((item, index) => {
    const timestamp = item.publishedAt === null ? Number.NaN : Date.parse(item.publishedAt)
    return {
      item,
      index,
      timestamp: Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY,
      rank: ranks.get(item.feedId) ?? feeds.length,
    }
  })
  // Sorting this new array preserves the input and supports the project's ES target.
  // eslint-disable-next-line unicorn/no-array-sort
  return entries.sort((a, b) => {
    if (a.timestamp !== b.timestamp) {
      return a.timestamp > b.timestamp ? -1 : 1
    }
    return a.rank - b.rank || a.index - b.index
  }).map(entry => entry.item)
}
