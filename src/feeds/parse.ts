import type { FeedDefinition, FeedError, FeedItem, FeedMedia } from '../types/feed'
import { sanitizeDescription } from './description.ts'
import { elementBase, httpUrl } from './url.ts'

// XML namespace identifiers are exact strings; changing HTTP to HTTPS changes their identity.
// eslint-disable-next-line unicorn/prefer-https
const MEDIA_NAMESPACE = 'http://search.yahoo.com/mrss/'
// eslint-disable-next-line unicorn/prefer-https
const CONTENT_NAMESPACE = 'http://purl.org/rss/1.0/modules/content/'
// eslint-disable-next-line unicorn/prefer-https
const DC_NAMESPACE = 'http://purl.org/dc/elements/1.1/'

export class FeedParseError extends Error {
  readonly type: Extract<FeedError['type'], 'parse' | 'unsupported'>

  constructor (type: FeedParseError['type'], message: string) {
    super(message)
    this.name = 'FeedParseError'
    this.type = type
  }
}

function children (element: Element, name: string, namespace: string | null = null): Element[] {
  return Array.from(element.children).filter(child => child.localName === name && child.namespaceURI === namespace)
}

function text (element: Element | undefined): string {
  return element?.textContent?.trim() ?? ''
}

function publicationDate (item: Element): { raw: string, iso: string | null } {
  const candidates = [
    ...children(item, 'pubDate'),
    ...children(item, 'date', DC_NAMESPACE),
    ...children(item, 'updated'),
  ].map(element => text(element))
  for (const raw of candidates) {
    const timestamp = Date.parse(raw)
    if (Number.isFinite(timestamp)) {
      return { raw, iso: new Date(timestamp).toISOString() }
    }
  }
  return { raw: candidates[0] ?? '', iso: null }
}

function mediaType (mimeType: string, medium: string, url: string): FeedMedia['type'] {
  for (const candidate of [mimeType.split('/', 1)[0], medium]) {
    switch (candidate) {
      case 'image':
      case 'audio':
      case 'video': {
        return candidate
      }
    }
  }
  // Some RSS publishers supply media URLs without either MIME type or medium.
  if (!mimeType) {
    const path = new URL(url).pathname.toLowerCase()
    if (/\.(?:avif|bmp|gif|jpe?g|png|svg|tiff?|webp)$/.test(path)) {
      return 'image'
    }
    if (/\.(?:aac|flac|m4a|mp3|oga|ogg|opus|wav)$/.test(path)) {
      return 'audio'
    }
    if (/\.(?:m4v|mov|mp4|ogv|webm)$/.test(path)) {
      return 'video'
    }
  }
  return 'attachment'
}

function extractMedia (item: Element, base: string, embedded: Set<string>, hasImage: boolean): FeedMedia[] {
  const media = new Map<string, FeedMedia>()
  const elements = [
    ...children(item, 'enclosure'),
    ...Array.from(item.getElementsByTagNameNS(MEDIA_NAMESPACE, 'content')),
    ...Array.from(item.getElementsByTagNameNS(MEDIA_NAMESPACE, 'thumbnail')),
  ]
  for (const element of elements) {
    const url = httpUrl(element.getAttribute('url'), elementBase(element, base))
    if (!url || embedded.has(url) || media.has(url)) {
      continue
    }
    const mimeType = element.getAttribute('type')?.trim().toLowerCase() ?? ''
    const medium = element.localName === 'thumbnail' ? 'image' : element.getAttribute('medium') ?? ''
    const title = text(children(element, 'title', MEDIA_NAMESPACE)[0])
    const type = mediaType(mimeType, medium, url)
    if (type === 'image') {
      if (hasImage) {
        continue
      }
      hasImage = true
    }
    media.set(url, {
      url,
      type,
      ...(mimeType ? { mimeType } : {}),
      ...(title ? { title } : {}),
    })
  }
  return [...media.values()]
}

/** Parse RSS 0.9x/2.0; other formats are reported explicitly rather than silently ignored. */
export function parseFeed (xml: string, feed: FeedDefinition, sourceUrl: string): FeedItem[] {
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  if (document.getElementsByTagNameNS('*', 'parsererror').length > 0) {
    throw new FeedParseError('parse', `Could not parse RSS XML for ${feed.name}`)
  }
  const root = document.documentElement
  if (root.localName !== 'rss' || root.namespaceURI) {
    throw new FeedParseError('unsupported', `Unsupported feed format for ${feed.name}; expected RSS 0.9x or 2.0`)
  }
  const channel = children(root, 'channel')[0]
  if (!channel) {
    throw new FeedParseError('parse', `Missing RSS channel for ${feed.name}`)
  }
  const items = new Map<string, FeedItem>()
  for (const item of children(channel, 'item')) {
    const title = text(children(item, 'title')[0]) || 'Untitled item'
    const link = children(item, 'link')[0]
    const guidElement = children(item, 'guid')[0]
    const guid = text(guidElement)
    const guidLink = guidElement && guidElement.getAttribute('isPermaLink') !== 'false'
      ? httpUrl(guid)
      : null
    const articleUrl = (link && httpUrl(text(link), elementBase(link, sourceUrl))) || guidLink
    const date = publicationDate(item)
    const descriptionElement = children(item, 'description')[0] ?? children(item, 'encoded', CONTENT_NAMESPACE)[0]
    const rawDescription = text(descriptionElement)
    const description = sanitizeDescription(rawDescription, elementBase(descriptionElement ?? item, sourceUrl))
    const id = JSON.stringify(guid
      ? [feed.id, 'guid', guid]
      : [feed.id, 'item', articleUrl, title, date.raw, rawDescription])
    if (items.has(id)) {
      continue
    }
    items.set(id, {
      id,
      feedId: feed.id,
      title,
      articleUrl,
      sanitizedDescription: description.html,
      publishedAt: date.iso,
      media: extractMedia(item, sourceUrl, description.embeddedMediaUrls, description.hasImage),
      categories: [...new Set(children(item, 'category').map(category => text(category)).filter(Boolean))],
    })
  }
  return [...items.values()]
}
