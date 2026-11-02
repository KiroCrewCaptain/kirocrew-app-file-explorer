/**
 * Small pure helpers the built-in page imported from the dashboard's own
 * modules. A bundle cannot import those (they are not part of the App SDK), so
 * the few this page needs are restated here with the same behaviour.
 */

/** A path whose backslashes are separators: a drive path (`C:\x`) or a UNC share. */
const WINDOWS_SHAPED_PATH_RE = /^(?:[A-Za-z]:|\\\\[^\\/]+)[\\/]/

function backslashIsSeparator(p: string): boolean {
  return WINDOWS_SHAPED_PATH_RE.test(p)
}

/** The last path segment. Backslash splits only a Windows-shaped path. */
export function pathBasename(p: string): string {
  const cut = backslashIsSeparator(p)
    ? Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
    : p.lastIndexOf('/')
  return p.slice(cut + 1)
}

/** `p` without trailing separators (backslashes only on a Windows-shaped path). */
export function stripTrailingSeparators(p: string): string {
  return p.replace(backslashIsSeparator(p) ? /[\\/]+$/ : /\/+$/, '')
}

/**
 * The platform command modifier is held: Cmd on macOS, Ctrl elsewhere. Exactly
 * one of the two, because Cmd+Ctrl is a chord macOS reserves for itself.
 */
export const hasCommandModifier = (e: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey'>): boolean =>
  e.metaKey !== e.ctrlKey

/**
 * Absolute in the sense the backend trusts: a POSIX root, `~` or `~/...` (the
 * gateway user's own home), a drive path, or a UNC share. `~name` is not.
 */
export function isAbsolutePath(filePath: string): boolean {
  return /^(?:\/|~(?:$|\/)|[A-Za-z]:[\\/]|\\\\)/.test(filePath)
}

/** Copy text to the clipboard; `true` on success. Never throws. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through to the selection copy */
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}

/** `localStorage.setItem` that swallows a quota or privacy-mode refusal. */
export function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* quota exceeded or storage disabled */
  }
}
