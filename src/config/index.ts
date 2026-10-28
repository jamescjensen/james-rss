import rawConfig from './feeds.json'
import { validateFeedConfig } from './validate'

export const feedConfig = validateFeedConfig(rawConfig)
