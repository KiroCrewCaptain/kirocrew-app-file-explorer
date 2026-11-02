/**
 * A small popup menu: the tree's right-click menu and the viewer's overflow
 * menu. The built-in page used the dashboard's own context-menu and dropdown
 * primitives, which are not part of the App SDK, so this is the page's own.
 *
 * Rendered into `document.body` at a fixed point, so no scrolling or clipped
 * ancestor can hide it. It closes on Escape, on a press outside it, on a scroll,
 * on a resize, and after an item runs. A control that opens it carries
 * `data-fe-menu-trigger`, so pressing it again closes rather than reopens. Arrow keys move between items and the
 * first item takes focus when it opens, so the keyboard can drive it.
 */

import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface MenuPosition {
  /** Viewport x of the menu's left edge, or of its right edge when `alignEnd`. */
  x: number
  y: number
  alignEnd?: boolean
}

interface MenuProps {
  at: MenuPosition | null
  onClose: () => void
  label: string
  children: ReactNode
  testId?: string
}

export function Menu({ at, onClose, label, children, testId }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!at) return
    const items = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    items()[0]?.focus({ preventScroll: true })
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element | null
      if (ref.current?.contains(target)) return
      // The control that opens the menu toggles it on its own click; closing
      // here first would make that click reopen it.
      if (target?.closest?.('[data-fe-menu-trigger]')) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      e.preventDefault()
      const list = items()
      if (list.length === 0) return
      const i = list.indexOf(document.activeElement as HTMLElement)
      const next = e.key === 'ArrowDown' ? (i + 1) % list.length : (i - 1 + list.length) % list.length
      list[next].focus()
    }
    const close = () => onClose()
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [at, onClose])

  if (!at) return null
  const style: React.CSSProperties = at.alignEnd
    ? { position: 'fixed', top: at.y, right: Math.max(0, window.innerWidth - at.x) }
    : { position: 'fixed', top: at.y, left: at.x }
  return createPortal(
    <div ref={ref} className="mc-fe-menu" role="menu" aria-label={label} style={style} data-testid={testId}>
      {children}
    </div>,
    document.body,
  )
}

interface MenuItemProps {
  onSelect: () => void
  onClose: () => void
  children: ReactNode
}

export function MenuItem({ onSelect, onClose, children }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className="mc-fe-menu-item"
      onClick={() => { onClose(); onSelect() }}
    >
      {children}
    </button>
  )
}
