import type { FeedCategory, FeedDefinition } from '../../src/types/feed'

export interface ServerFeedDefinition extends FeedDefinition {
  url: string
}

export interface ServerFeedConfig {
  categories: FeedCategory[]
  feeds: ServerFeedDefinition[]
}
