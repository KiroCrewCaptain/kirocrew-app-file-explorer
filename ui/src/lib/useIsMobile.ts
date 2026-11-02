import { useSyncExternalStore } from 'react'

/** The dashboard's own phone breakpoint: narrower than 768 px is the stacked layout. */
const MOBILE_QUERY = '(max-width: 767px)'

let cachedFn: unknown
let cachedMql: MediaQueryList | null = null

function currentMql(): MediaQueryList | null {
  const fn = typeof window !== 'undefined' ? window.matchMedia : undefined
  if (typeof fn !== 'function') return null
  if (fn !== cachedFn) {
    cachedFn = fn
    cachedMql = fn.call(window, MOBILE_QUERY)
  }
  return cachedMql
}

const WINDOW_EVENTS = ['orientationchange', 'resize', 'pageshow'] as const

function subscribe(cb: () => void) {
  const mql = currentMql()
  mql?.addEventListener('change', cb)
  for (const type of WINDOW_EVENTS) window.addEventListener(type, cb)
  document.addEventListener('visibilitychange', cb)
  return () => {
    mql?.removeEventListener('change', cb)
    for (const type of WINDOW_EVENTS) window.removeEventListener(type, cb)
    document.removeEventListener('visibilitychange', cb)
  }
}

/** True on a narrow (phone-width) viewport. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => currentMql()?.matches ?? false,
    () => false,
  )
}
