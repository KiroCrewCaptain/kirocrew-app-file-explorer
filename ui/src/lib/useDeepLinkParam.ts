/**
 * Read a query parameter off the page URL once, hand it to `onValue`, and remove
 * it with a history REPLACE.
 *
 * The built-in page used the dashboard router's `useSearchParams`, which a bundle
 * cannot import. This reads `window.location` instead and keeps the router's own
 * history state when it rewrites the URL, so Back and the router are unaffected.
 *
 * It looks on mount, after every render, and on `popstate`, so a link that
 * arrives while the page is already open (the host re-renders its route) is
 * still taken. A value is delivered once: the param is gone from the URL as soon
 * as it is read.
 */

import { useEffect } from 'react'

function take(param: string): string | null {
  const url = new URL(window.location.href)
  const raw = url.searchParams.get(param)
  if (raw === null) return null
  url.searchParams.delete(param)
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  return raw
}

export function useDeepLinkParam(param: string, onValue: (value: string) => void): void {
  useEffect(() => {
    const raw = take(param)
    if (raw !== null) onValue(raw)
  })
  useEffect(() => {
    const onPop = () => {
      const raw = take(param)
      if (raw !== null) onValue(raw)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [param, onValue])
}
