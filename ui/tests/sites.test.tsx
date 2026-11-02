/**
 * The Files cases of three Kiro Crew cross-site suites, ported:
 *
 * - `windowsBasenameSites.test.tsx`: a Windows gateway's `C:\…` path shows its
 *   file name, while breadcrumbs keep splitting on `/` only;
 * - `explorerNotebookNarrow.test.ts`: at phone widths the tree is a drawer
 *   reached from a bar at the top, and the viewer owns the full width;
 * - `ImeEnterGuardSites.test.tsx`: the path bar's Tab, which accepts a
 *   suggestion INTO the draft, asks the host's IME guard first.
 */
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import * as sdk from '@kirocrew/app-sdk'
import { basename as explorerBasename, crumbLabel, parentChain } from '../src/utils'

vi.mock('../src/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api')>()),
  fileExplorerApi: {
    complete: vi.fn().mockResolvedValue({
      entries: [{ name: 'src', path: '/home/user/src', type: 'dir', size: 0, mtime: 0 }],
    }),
  },
}))

import PathBar from '../src/PathBar'
import { fileExplorerApi } from '../src/api'

const src = (rel: string) => readFileSync(resolve(__dirname, '..', 'src', rel), 'utf8')

const WIN = 'C:\\Users\\u\\docs\\report.md'
const POSIX_BACKSLASH = '/tmp/we\\ird.md'

describe('Windows gateway paths show their file name', () => {
  it.each([
    [WIN, 'report.md'],
    ['C:\\Users\\u\\docs\\', 'docs'],
    [POSIX_BACKSLASH, 'we\\ird.md'],
    ['/a/b/', 'b'],
    ['/', ''],
  ])('basename(%s) is %s', (p, name) => {
    expect(explorerBasename(p)).toBe(name)
  })

  it('utils.ts derives file names through pathBasename only', () => {
    const s = src('utils.ts')
    expect(s).toMatch(/import \{[^}]*\bpathBasename\b[^}]*\} from '\.\/lib\/platform'/)
    expect(s).not.toMatch(/\.split\('\/'\)\.pop\(\)/)
    expect(s).not.toMatch(/\.lastIndexOf\('\/'\) \+ 1\)/)
  })
})

// Breadcrumb navigation for Windows roots is out of scope: these pin the
// behaviour so the separator-aware basename cannot collapse a Windows root crumb.
describe('breadcrumbs split on / only', () => {
  it.each([
    ['C:\\Users\\u\\repo', ['/', 'C:\\Users\\u\\repo']],
    ['/a/b/c', ['/', '/a', '/a/b', '/a/b/c']],
    ['/tmp/we\\ird', ['/', '/tmp', '/tmp/we\\ird']],
  ])('parentChain(%s)', (p, chain) => {
    expect(parentChain(p)).toEqual(chain)
  })

  it.each([
    ['C:\\Users\\u\\repo', 'C:\\Users\\u\\repo'],
    ['C:/Users', 'Users'],
    ['/a/b/', 'b'],
    ['/tmp/we\\ird', 'we\\ird'],
  ])('crumbLabel(%s) is %s', (p, label) => {
    expect(crumbLabel(p)).toBe(label)
  })

  it('PathBar labels crumbs with crumbLabel, not the separator-aware basename', () => {
    const s = src('PathBar.tsx')
    expect(s).toContain('crumbLabel(s)')
    expect(s).not.toMatch(/\bbasename\(s\)/)
  })
})

// The navigator sat at a fixed width beside the viewer, with nothing gating it
// on viewport width: at 390px that left the viewer 106px inside an
// `overflow:hidden` split. The navigator becomes a drawer reached from a control
// at the TOP, so no horizontal space is reserved for it.
describe('the Files page at phone widths', () => {
  it('reaches the tree from a top bar instead of a side pane', () => {
    const s = src('FileExplorerPage.tsx')
    expect(s, 'expected a viewport hook').toContain('useIsMobile')
    expect(s, 'expected drawer state').toMatch(/const treeBar = isMobile && !treeOpen/)
    expect(s, 'expected a full-width expanded tree').toMatch(/const treeFull = isMobile && treeOpen/)
    expect(s, 'the bar must be a Btn primitive').toMatch(/<Btn[\s\S]{0,200}mc-fe-treebar/)
    expect(s, 'the bar must announce its disclosure state').toMatch(/aria-expanded=\{treeOpen\}/)
  })

  it('turns the split into a column and drops the pointer-only handle', () => {
    const s = src('FileExplorerPage.tsx')
    expect(s, 'expected the row to stack').toMatch(/mc-fe-split\$\{isMobile \? ' is-stacked' : ''\}/)
    expect(s, 'the resizer must not render while narrow').toMatch(/\{!isMobile && <div className="mc-fe-resizer"/)
    expect(s, 'the tree must take the whole width when open').toMatch(/width: treeFull \? '100%' : leftWidth/)
  })

  it('closes the drawer on pick, so the full-width tree is not a one-way door', () => {
    const s = src('FileExplorerPage.tsx')
    const fn = s.match(/const openFileInFolder = useCallback\([\s\S]*?\n  \}, \[[^\]]*\]\)/)
    expect(fn, 'expected openFileInFolder').not.toBeNull()
    expect(fn![0]).toContain('if (isMobile) setTreeOpen(false)')
    expect(fn![0], 'the callback must depend on isMobile').toContain('isMobile]')
    expect(s, 'openFile must route through the primitive').toMatch(/const openFile = useCallback\([\s\S]*?openFileInFolder\(activeFolder\.id, path\)/)
  })

  it('stacks the divider and hides panes without unmounting them', () => {
    const css = src('styles.ts')
    expect(css, 'expected a stacked modifier').toMatch(/\.mc-fe-split\.is-stacked \{ flex-direction:column; \}/)
    expect(css).toMatch(/is-stacked > \.mc-fe-left \{ border-right:none; border-bottom:/)
    expect(css, 'panes must be hidden, not removed').toMatch(/\.mc-fe-left\.is-hidden, \.mc-fe-right\.is-hidden \{ display:none; \}/)
    // styles.ts is a template literal: a backtick in the CSS ends it early.
    const body = css.split('`')[1] ?? ''
    expect(body.includes('`'), 'no backtick may appear inside the CSS template').toBe(false)
  })

  it('drops keyboard-only advice from what is now the mobile landing view', () => {
    const s = src('FileViewer.tsx')
    expect(s, 'expected the viewport hook').toContain('useIsMobile')
    expect(s).toMatch(/subtitle=\{isMobile \? undefined : i18nT\('fileViewer\.tip_ctrl_cmd_f_to_search'\)\}/)
  })
})

describe('PathBar: Tab accepts a suggestion INTO the draft, so it asks the IME guard first', () => {
  async function openEditor() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    render(
      <QueryClientProvider client={qc}>
        <PathBar rootPath="/home/user" gitInfo={null} onChangeRoot={vi.fn()} onNavigate={vi.fn()} onRefresh={vi.fn()} />
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByTitle('Click to edit path'))
    const input = screen.getByPlaceholderText('/path/to/folder') as HTMLInputElement
    fireEvent.change(input, { target: { value: '/home/user/s' } })
    // Wait for the DEBOUNCED key's fetch, then its row: a row seen after that
    // call can only be the settled list (the pre-debounce one empties for a tick).
    const complete = vi.mocked(fileExplorerApi.complete)
    await waitFor(() => expect(complete).toHaveBeenCalledWith('/home/user/s', 'dir', 30), { timeout: 5000 })
    await waitFor(() => expect(screen.getByText('/home/user/src')).toBeInTheDocument(), { timeout: 5000 })
    return input
  }

  /** The host guard declining the key: the post-composition window after an IME commit. */
  function latchGuard() {
    const real = sdk.useImeGuard
    return vi.spyOn(sdk, 'useImeGuard').mockImplementation(() => ({ ...real(), claimKey: () => false }))
  }

  it('does NOT replace the draft on a Tab the guard declines', async () => {
    latchGuard()
    const input = await openEditor()
    const defaultNotPrevented = fireEvent.keyDown(input, { key: 'Tab' })
    expect(input.value).toBe('/home/user/s')
    expect(defaultNotPrevented).toBe(true)
  })

  it('accepts the highlighted suggestion on a plain Tab (positive control)', async () => {
    const input = await openEditor()
    fireEvent.keyDown(input, { key: 'Tab' })
    expect(input.value).toBe('/home/user/src')
  })

  it('keeps arrow-key list navigation working while the guard declines', async () => {
    latchGuard()
    const input = await openEditor()
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(screen.getByRole('option')).toHaveAttribute('aria-selected', 'true')
  })
})
