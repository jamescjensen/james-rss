import rawConfig from './feeds.json' with { type: 'json' }
import { validateFeedConfig } from './validate.ts'

export const feedConfig = validateFeedConfig(rawConfig)
