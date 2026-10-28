export interface FeedCategory {
  id: string
  name: string
}

export interface FeedDefinition {
  id: string
  name: string
  categoryIds: string[]
}

export interface FeedConfig {
  categories: FeedCategory[]
  feeds: FeedDefinition[]
}

export interface FeedMedia {
  url: string
  type: 'image' | 'audio' | 'video' | 'attachment'
  mimeType?: string
  title?: string
}

export interface FeedItem {
  id: string
  feedId: string
  title: string
  articleUrl: string | null
  sanitizedDescription: string
  /** ISO timestamp, or null when the feed supplies no usable date. */
  publishedAt: string | null
  media: FeedMedia[]
  /** Categories supplied by the RSS item, separate from manual feed categories. */
  categories: string[]
}

export interface FeedError {
  type: 'network' | 'http' | 'timeout' | 'parse' | 'unsupported'
  message: string
}

export type FeedResult = {
  feedId: string
  status: 'success'
  items: FeedItem[]
} | {
  feedId: string
  status: 'error'
  error: FeedError
}
