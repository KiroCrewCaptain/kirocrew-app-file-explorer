/**
 * The page's own stand-ins for dashboard internals a bundle cannot import: the
 * popup menu, the deep-link reader, and the small path helpers.
 */
import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { fireEvent, render, renderHook, screen } from '@testing-library/react'

import { Menu, MenuItem, type MenuPosition } from '../src/lib/Menu'
import { useDeepLinkParam } from '../src/lib/useDeepLinkParam'
import { isAbsolutePath, hasCommandModifier, stripTrailingSeparators } from '../src/lib/platform'

function Harness({ onSelect = vi.fn() }: { onSelect?: () => void }) {
  const [at, setAt] = useState<MenuPosition | null>(null)
  const close = () => setAt(null)
  return (
    <>
      <button data-fe-menu-trigger="" onClick={() => setAt(at ? null : { x: 10, y: 10 })}>open</button>
      <button>outside</button>
      <Menu at={at} onClose={close} label="Actions">
        <MenuItem onClose={close} onSelect={onSelect}>First</MenuItem>
        <MenuItem onClose={close} onSelect={vi.fn()}>Second</MenuItem>
      </Menu>
    </>
  )
}

describe('Menu', () => {
  it('opens on its trigger, focuses the first item, and runs an item then closes', () => {
    const onSelect = vi.fn()
    render(<Harness onSelect={onSelect} />)
    fireEvent.click(screen.getByText('open'))
    expect(screen.getByRole('menu', { name: 'Actions' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'First' })).toHaveFocus()
    fireEvent.click(screen.getByRole('menuitem', { name: 'First' }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('moves focus with the arrow keys and closes on Escape', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('open'))
    fireEvent.keyDown(document, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: 'Second' })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: 'First' })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes on a press outside, but its own trigger toggles it rather than reopening it', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('open'))
    fireEvent.mouseDown(screen.getByText('outside'))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('open'))
    fireEvent.mouseDown(screen.getByText('open'))
    fireEvent.click(screen.getByText('open'))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('useDeepLinkParam', () => {
  it('delivers the param once and removes it with a replace that keeps the router state', () => {
    const state = { usr: null, key: 'k1', idx: 3 }
    window.history.replaceState(state, '', '/apps/file-explorer?path=%2Fhome%2Fu%2Fa.md&tab=x#frag')
    const before = window.history.length
    const seen: string[] = []
    const { rerender } = renderHook(() => useDeepLinkParam('path', (v) => seen.push(v)))
    rerender()
    expect(seen).toEqual(['/home/u/a.md'])
    expect(window.location.pathname + window.location.search + window.location.hash).toBe('/apps/file-explorer?tab=x#frag')
    expect(window.history.state).toEqual(state)
    expect(window.history.length).toBe(before)
  })

  it('takes a link that arrives later through popstate', () => {
    window.history.replaceState(null, '', '/apps/file-explorer')
    const seen: string[] = []
    renderHook(() => useDeepLinkParam('path', (v) => seen.push(v)))
    expect(seen).toEqual([])
    window.history.pushState(null, '', '/apps/file-explorer?path=%2Ftmp')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(seen).toEqual(['/tmp'])
  })
})

describe('path helpers', () => {
  it.each([
    ['/etc', true], ['~', true], ['~/x', true], ['C:\\x', true], ['C:/x', true], ['\\\\host\\s', true],
    ['~bob/x', false], ['src/a', false], ['', false],
  ])('isAbsolutePath(%s) is %s', (p, abs) => {
    expect(isAbsolutePath(p)).toBe(abs)
  })

  it('strips trailing separators, backslashes only on a Windows-shaped path', () => {
    expect(stripTrailingSeparators('C:\\a\\')).toBe('C:\\a')
    expect(stripTrailingSeparators('/a/b//')).toBe('/a/b')
    expect(stripTrailingSeparators('/a/b\\')).toBe('/a/b\\')
  })

  it('treats exactly one of Cmd and Ctrl as the command modifier', () => {
    expect(hasCommandModifier({ metaKey: true, ctrlKey: false })).toBe(true)
    expect(hasCommandModifier({ metaKey: true, ctrlKey: true })).toBe(false)
  })
})
