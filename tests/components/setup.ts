import { enableAutoUnmount } from '@vue/test-utils'
import { afterEach, vi } from 'vitest'

enableAutoUnmount(afterEach)

vi.stubGlobal('matchMedia', vi.fn((media: string) => ({
  matches: false,
  media,
  onchange: null,
  addListener () {},
  removeListener () {},
  addEventListener () {},
  removeEventListener () {},
  dispatchEvent: () => false,
})))
