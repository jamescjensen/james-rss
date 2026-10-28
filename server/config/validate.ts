import type { FeedCategory } from '../../src/types/feed'
import type { ServerFeedConfig, ServerFeedDefinition } from './types'

function isRecord (value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validateFeedConfig (value: unknown): ServerFeedConfig {
  const errors: string[] = []
  const categories: FeedCategory[] = []
  const feeds: ServerFeedDefinition[] = []

  function requiredString (value: unknown, path: string): string {
    if (typeof value !== 'string' || value.trim() === '') {
      errors.push(`${path} must be a non-empty string`)
      return ''
    }
    if (value !== value.trim()) {
      errors.push(`${path} must not have leading or trailing whitespace`)
    }
    return value
  }

  function uniqueId (value: unknown, path: string, seen: Set<string>): string {
    const id = requiredString(value, path)
    if (id && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
      errors.push(`${path} must use lowercase letters, numbers, and single hyphens between words`)
    }
    if (seen.has(id)) {
      errors.push(`${path} duplicates ID "${id}"`)
    }
    if (id) {
      seen.add(id)
    }
    return id
  }

  if (!isRecord(value)) {
    throw new Error('Invalid feed configuration: expected an object with categories and feeds arrays')
  }

  const categoryIds = new Set<string>()
  const feedIds = new Set<string>()

  if (Array.isArray(value.categories)) {
    for (const [index, category] of value.categories.entries()) {
      const path = `categories[${index}]`
      if (!isRecord(category)) {
        errors.push(`${path} must be an object`)
        continue
      }
      categories.push({
        id: uniqueId(category.id, `${path}.id`, categoryIds),
        name: requiredString(category.name, `${path}.name`),
      })
    }
  } else {
    errors.push('categories must be an array')
  }

  if (Array.isArray(value.feeds)) {
    for (const [index, feed] of value.feeds.entries()) {
      const path = `feeds[${index}]`
      if (!isRecord(feed)) {
        errors.push(`${path} must be an object`)
        continue
      }

      const id = uniqueId(feed.id, `${path}.id`, feedIds)
      const name = requiredString(feed.name, `${path}.name`)
      const url = requiredString(feed.url, `${path}.url`)
      if (url) {
        try {
          const parsed = new URL(url)
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            errors.push(`${path}.url must use HTTP or HTTPS`)
          }
        } catch {
          errors.push(`${path}.url must be an absolute HTTP(S) URL`)
        }
      }

      const assignedCategories: string[] = []
      if (Array.isArray(feed.categoryIds)) {
        for (const [categoryIndex, reference] of feed.categoryIds.entries()) {
          const referencePath = `${path}.categoryIds[${categoryIndex}]`
          const categoryId = requiredString(reference, referencePath)
          if (!categoryId) {
            continue
          }
          if (!categoryIds.has(categoryId)) {
            errors.push(`${referencePath} references unknown category "${categoryId}"`)
          }
          if (assignedCategories.includes(categoryId)) {
            errors.push(`${referencePath} repeats category "${categoryId}"`)
          }
          assignedCategories.push(categoryId)
        }
      } else {
        errors.push(`${path}.categoryIds must be an array (use [] for an uncategorized feed)`)
      }

      feeds.push({ id, name, url, categoryIds: assignedCategories })
    }
  } else {
    errors.push('feeds must be an array')
  }

  if (errors.length > 0) {
    throw new Error(`Invalid feed configuration:\n${errors.map(error => `- ${error}`).join('\n')}`)
  }

  return { categories, feeds }
}
