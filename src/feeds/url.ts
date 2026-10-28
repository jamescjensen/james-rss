/** Resolve feed-supplied URLs without allowing executable or embedded data URLs. */
export function httpUrl (value: string | null | undefined, base?: string): string | null {
  if (!value?.trim()) {
    return null
  }
  try {
    const url = new URL(value.trim(), base)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

export function elementBase (element: Element, feedUrl: string): string {
  const ancestors: Element[] = []
  for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
    ancestors.unshift(ancestor)
  }
  return ancestors.reduce((base, ancestor) => {
    // This is the XML namespace identifier, not a fetched URL.
    // eslint-disable-next-line unicorn/prefer-https
    const declared = ancestor.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'base')
    return httpUrl(declared, base) ?? base
  }, feedUrl)
}
