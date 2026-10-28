import createDOMPurify from 'dompurify'
import { httpUrl } from './url.ts'

export function sanitizeDescription (html: string, base: string): {
  html: string
  embeddedMediaUrls: Set<string>
} {
  // A dedicated instance keeps each item's URL base and hooks isolated.
  const purifier = createDOMPurify(window)
  purifier.addHook('uponSanitizeAttribute', (_node, attribute) => {
    if (['href', 'src', 'poster'].includes(attribute.attrName)) {
      const url = httpUrl(attribute.attrValue, base)
      attribute.keepAttr = url !== null
      if (url) {
        attribute.attrValue = url
      }
    }
  })
  purifier.addHook('afterSanitizeAttributes', node => {
    if (node.nodeName === 'A' && node.hasAttribute('href')) {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    }
    if (node.nodeName === 'AUDIO' || node.nodeName === 'VIDEO') {
      node.setAttribute('controls', '')
      node.setAttribute('preload', 'none')
    }
    if (node.nodeName === 'IMG') {
      node.setAttribute('loading', 'lazy')
      node.setAttribute('referrerpolicy', 'no-referrer')
    }
  })
  const fragment = purifier.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'a', 'ul', 'ol', 'li',
      'blockquote', 'pre', 'code', 'h2', 'h3', 'h4', 'hr', 'figure', 'figcaption',
      'img', 'audio', 'video', 'source', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
    ],
    ALLOWED_ATTR: ['href', 'src', 'poster', 'alt', 'title', 'type'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    RETURN_DOM_FRAGMENT: true,
  })
  const embeddedMediaUrls = new Set<string>()
  for (const element of fragment.querySelectorAll('img[src], audio[src], video[src], audio source[src], video source[src]')) {
    const url = element.getAttribute('src')
    if (url) {
      embeddedMediaUrls.add(url)
    }
  }
  const container = document.createElement('div')
  container.append(fragment)
  return { html: container.innerHTML, embeddedMediaUrls }
}
