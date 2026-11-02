/**
 * A light stand-in for the host's `@kirocrew/app-sdk`.
 *
 * Only the names the bundle uses, with the host's documented behaviour where a
 * test depends on it. The `stub*` / `resetStubSdk` exports are test controls; no
 * host module has them. A test that needs a different host shape replaces this
 * module with `vi.mock`.
 */

import { vi } from 'vitest'
import type { KeyboardEvent } from 'react'
import type { AppApi, ChatLaunchOptions, NumberOptions } from '@kirocrew/app-sdk'

let locale = 'en'

/** The host's active language for the next lookups. */
export function stubLocale(next: string): void {
  locale = next
}

export const stubOpenChat = vi.fn<(opts?: ChatLaunchOptions) => void>()
export const stubNavigate = vi.fn<(path: string) => void>()

const unstubbed = () => Promise.reject(new Error('stub app-sdk: no API in this test'))

/** The scoped client `useAppApi()` returns; a test replaces `get` to answer requests. */
export const stubApi: AppApi = { request: unstubbed, get: unstubbed }

export function resetStubSdk(): void {
  locale = 'en'
  stubOpenChat.mockReset()
  stubNavigate.mockReset()
  stubApi.request = unstubbed
  stubApi.get = unstubbed
}

export function activeLocale(): string {
  return locale
}

export function useLanguageGeneration(): number {
  return 0
}

export function fmtNumber(value: number, options?: NumberOptions): string {
  if (!Number.isFinite(value)) return '—'
  return new Intl.NumberFormat(locale, options).format(value)
}

export function useAppApi(): AppApi {
  return stubApi
}

export function useNavigate(): (path: string) => void {
  return stubNavigate
}

export function useChatLauncher(): { openChat: (opts?: ChatLaunchOptions) => void } {
  return { openChat: stubOpenChat }
}

/** The host guard's contract minus its composition latch: an Enter typed while
 *  an IME composes is not claimed. */
export function useImeGuard() {
  const composing = (e: KeyboardEvent) => e.nativeEvent?.isComposing === true || e.keyCode === 229
  const claimEnter = (e: KeyboardEvent) => {
    if (composing(e)) return false
    e.preventDefault()
    return true
  }
  const claimKey = (e: KeyboardEvent) => !composing(e)
  const bindComposition = (opts: { onFocus?: () => void; onBlur?: () => void } = {}) => ({
    onFocus: opts.onFocus,
    onBlur: opts.onBlur,
  })
  const bindEnter = (opts: {
    onEnter?: () => void
    onEscape?: () => void
    onFocus?: () => void
    onBlur?: () => void
  }) => ({
    ...bindComposition({ onFocus: opts.onFocus, onBlur: opts.onBlur }),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' && claimEnter(e)) opts.onEnter?.()
      else if (e.key === 'Escape') opts.onEscape?.()
    },
  })
  return { claimEnter, claimKey, bindComposition, bindEnter }
}
