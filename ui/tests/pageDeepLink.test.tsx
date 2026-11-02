/**
 * The Files page's `?path=` deep link (`FileExplorerPage` + `deepLink.ts`).
 *
 * Another surface — the chat side panel's file ⋯ menu — navigates here with a
 * path in the query string. These tests pin what the page does with it: it is
 * consumed once (history REPLACE, so a reload or Back cannot reopen it), it is
 * resolved through the app's own backend rather than trusted, a file lands in
 * the tab whose root already contains it with the folders between expanded,
 * anything outside every open tab gets a new tab rooted at its folder, a
 * path the backend refuses or cannot find is reported in place as an error,
 * and a relative path is declined before any request as a status, not an error.
 *
 * Same harness as `pageCoverage.test.tsx`: mock the api client, wrap in a
 * QueryClient. The built-in read the param through the dashboard router; this
 * copy reads `window.location`, so the tests set and read the real URL.
 * Ported from Kiro Crew's `FileExplorerPage.deepLink.test.tsx`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../src/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api')>()),
  fileExplorerApi: {
    health: vi.fn(),
    tree: vi.fn(),
    read: vi.fn(),
    search: vi.fn(),
    gitStatus: vi.fn(),
    resolve: vi.fn(),
    complete: vi.fn(),
  },
}))

import { fileExplorerApi } from '../src/api'
import { FileExplorerApiError } from '../src/api'
import { i18nT } from '../src/i18n'
import { STORAGE_KEY } from '../src/constants'
import FileExplorerPage from '../src/FileExplorerPage'
import type { TreeEntry, FileMeta } from '../src/types'

const ROOT = '/home/user'

/** `src` carries its children inline, so expanding it needs no second fetch. */
const ENTRIES: TreeEntry[] = [
  { name: 'src', path: '/home/user/src', type: 'dir', children: [
    { name: 'lib', path: '/home/user/src/lib', type: 'dir', children: [
      { name: 'deep.ts', path: '/home/user/src/lib/deep.ts', type: 'file' },
    ] },
    { name: 'index.ts', path: '/home/user/src/index.ts', type: 'file' },
  ] },
  { name: 'notes.txt', path: '/home/user/notes.txt', type: 'file', size: 12, mtime: 1700000000 },
]

const ELSEWHERE_ENTRIES: TreeEntry[] = [
  { name: 'report.md', path: '/tmp/elsewhere/report.md', type: 'file', size: 5, mtime: 1700000000 },
]

const base = (p: string): FileMeta => ({
  size: 12, mtime: 1700000000, mime: 'text/plain', encoding: 'utf-8',
  content: `body of ${p}`,
})

function stubApi() {
  vi.mocked(fileExplorerApi.health).mockResolvedValue({ allowedRoots: [ROOT, '/tmp'], home: ROOT })
  vi.mocked(fileExplorerApi.tree).mockImplementation((p: string) =>
    Promise.resolve({ entries: p.startsWith('/tmp/elsewhere') ? ELSEWHERE_ENTRIES : ENTRIES }))
  vi.mocked(fileExplorerApi.read).mockImplementation((p: string) => Promise.resolve(base(p)))
  vi.mocked(fileExplorerApi.search).mockResolvedValue({ results: [], engine: 'rg', truncated: false })
  vi.mocked(fileExplorerApi.gitStatus).mockResolvedValue(null)
  vi.mocked(fileExplorerApi.complete).mockResolvedValue({ entries: [] })
  // The backend answers with its own spelling of the path; by default the one asked.
  vi.mocked(fileExplorerApi.resolve).mockImplementation((p: string) =>
    Promise.resolve({ exists: true, type: p.endsWith('.ts') || p.endsWith('.txt') || p.endsWith('.md') ? 'file' : 'dir', path: p }))
}

/** The page's own route for a fresh install; an adopted record keeps the built-in's. */
const PAGE = '/apps/file-explorer'

/** The link Kiro Crew's file viewer builds: the page route with `?path=`. */
const fileExplorerDeepLink = (path: string) => `${PAGE}?path=${encodeURIComponent(path)}`

/** Lets a test re-issue a deep link the way a second click in the chat panel would. */
function Relink({ to }: { to: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        window.history.pushState(null, '', to)
        window.dispatchEvent(new PopStateEvent('popstate'))
      }}
    >
      relink
    </button>
  )
}

function renderAt(entry: string, extra?: React.ReactNode) {
  window.history.replaceState(null, '', entry)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })
  const utils = render(
    <QueryClientProvider client={qc}>
      <FileExplorerPage />
      {extra}
    </QueryClientProvider>,
  )
  return { ...utils, qc }
}

function seedSaved(state: Record<string, unknown>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

// Ceiling for health -> init -> deep-link consume -> resolve -> open/reveal ->
// read/tree; this bounds chained async work under coverage, not a sleep.
const LINK_CHAIN_TIMEOUT_MS = 5_000

const treeBox = () => within(document.querySelector('.mc-fe-tree') as HTMLElement)
const viewerName = () => document.querySelector('.mc-fe-viewer-filename')?.textContent
const folderTabs = () => document.querySelectorAll('.mc-fe-tab-folder')
const fileTabs = () => document.querySelectorAll('.mc-fe-tab-file')
const url = () => window.location.pathname + window.location.search

async function ready() {
  // Chain: health query -> init effect -> tree query.
  await waitFor(
    () => expect(document.querySelector('.mc-fe-tree')).toBeInTheDocument(),
    { timeout: LINK_CHAIN_TIMEOUT_MS },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  stubApi()
})

describe('FileExplorerPage ?path= deep link', () => {
  it('consumes the param with a history replace, before the backend has even answered', async () => {
    renderAt(fileExplorerDeepLink('/home/user/notes.txt'))
    // Stripped on the first capture-effect pass, before health/init/resolve: no
    // async query chain exists here, so this wait needs no chain ceiling.
    await waitFor(() => expect(url()).toBe(PAGE))
  })

  it('opens a file under the active root in that tab and expands the folders down to it', async () => {
    renderAt(fileExplorerDeepLink('/home/user/src/lib/deep.ts'))
    await ready()
    // Chain: health query -> init effect -> link consume -> resolve -> open -> read query.
    await waitFor(() => expect(viewerName()).toBe('deep.ts'), { timeout: LINK_CHAIN_TIMEOUT_MS })
    // Resolved through the backend, never trusted: exactly one probe for the path asked.
    expect(fileExplorerApi.resolve).toHaveBeenCalledTimes(1)
    expect(fileExplorerApi.resolve).toHaveBeenCalledWith('/home/user/src/lib/deep.ts')
    // The tree reveals it: `src` and `src/lib` are expanded, so the leaf is a visible row.
    expect(treeBox().getByText('deep.ts')).toBeInTheDocument()
    // One tab, the one that was already there — a link never re-roots or duplicates it.
    expect(folderTabs()).toHaveLength(1)
    expect(fileTabs()).toHaveLength(1)
    expect(fileExplorerApi.read).toHaveBeenCalledWith('/home/user/src/lib/deep.ts')
  })

  it('opens a file no open tab contains in a NEW tab rooted at its folder', async () => {
    renderAt(fileExplorerDeepLink('/tmp/elsewhere/report.md'))
    await ready()
    // Chain: health query -> init effect -> link consume -> resolve -> open -> read query.
    await waitFor(() => expect(viewerName()).toBe('report.md'), { timeout: LINK_CHAIN_TIMEOUT_MS })
    expect(folderTabs()).toHaveLength(2)
    // The new tab's tree is the file's folder, and the original tab is untouched.
    expect(fileExplorerApi.tree).toHaveBeenCalledWith('/tmp/elsewhere', 2)
    expect(fileExplorerApi.tree).toHaveBeenCalledWith(ROOT, 2)
  })

  it('prefers an existing tab whose root contains the file over opening a new one', async () => {
    seedSaved({
      folderTabs: [
        { id: 'ft-home', rootPath: ROOT, label: '', expanded: { [ROOT]: true } },
        { id: 'ft-tmp', rootPath: '/tmp/elsewhere', label: 'scratch', expanded: { '/tmp/elsewhere': true } },
      ],
      fileTabs: [],
      activeFolderId: 'ft-home',
      activeFileId: null,
      leftWidth: 280,
    })
    renderAt(fileExplorerDeepLink('/tmp/elsewhere/report.md'))
    await ready()
    // Chain: health query -> init effect -> link consume -> resolve -> open -> read query.
    await waitFor(() => expect(viewerName()).toBe('report.md'), { timeout: LINK_CHAIN_TIMEOUT_MS })
    // Switched to the tab that already had it; nothing new was opened.
    expect(folderTabs()).toHaveLength(2)
    expect(screen.getByText('scratch').closest('.mc-fe-tab-folder')).toHaveClass('is-current-folder')
  })

  it('opens a folder by expanding it in the tab that contains it, without opening a file', async () => {
    renderAt(fileExplorerDeepLink('/home/user/src/lib'))
    await ready()
    // Chain: health query -> init effect -> link consume -> resolve -> expand -> tree render.
    await waitFor(
      () => expect(treeBox().getByText('deep.ts')).toBeInTheDocument(),
      { timeout: LINK_CHAIN_TIMEOUT_MS },
    )
    expect(fileTabs()).toHaveLength(0)
    expect(folderTabs()).toHaveLength(1)
    expect(fileExplorerApi.read).not.toHaveBeenCalled()
  })

  it('keys tab state by the backend spelling of the path, not the one the link asked about', async () => {
    // A `~` or symlinked link resolves to the real path; the tree carries that one.
    vi.mocked(fileExplorerApi.resolve).mockResolvedValue({ exists: true, type: 'file', path: '/home/user/notes.txt' })
    renderAt(fileExplorerDeepLink('~/notes.txt'))
    await ready()
    // Chain: health query -> init effect -> link consume -> resolve -> open -> read query.
    await waitFor(() => expect(viewerName()).toBe('notes.txt'), { timeout: LINK_CHAIN_TIMEOUT_MS })
    expect(fileExplorerApi.resolve).toHaveBeenCalledWith('~/notes.txt')
    expect(fileExplorerApi.read).toHaveBeenCalledWith('/home/user/notes.txt')
  })

  it('reuses the open tab when the same file is linked again', async () => {
    const link = fileExplorerDeepLink('/home/user/notes.txt')
    renderAt(link, <Relink to={link} />)
    await ready()
    // Chain: health query -> init effect -> link consume -> resolve -> open -> read query.
    await waitFor(() => expect(viewerName()).toBe('notes.txt'), { timeout: LINK_CHAIN_TIMEOUT_MS })
    await userEvent.click(screen.getByText('relink'))
    // Chain: relink click -> capture effect -> consume effect -> resolve.
    await waitFor(
      () => expect(fileExplorerApi.resolve).toHaveBeenCalledTimes(2),
      { timeout: LINK_CHAIN_TIMEOUT_MS },
    )
    // Chain: relink click -> capture effect -> URL replace.
    await waitFor(() => expect(url()).toBe(PAGE), { timeout: LINK_CHAIN_TIMEOUT_MS })
    expect(fileTabs()).toHaveLength(1)
    expect(folderTabs()).toHaveLength(1)
  })

  it('reports a backend refusal in place and still clears the param', async () => {
    vi.mocked(fileExplorerApi.resolve).mockRejectedValue(new FileExplorerApiError(403, 'access denied: sensitive path'))
    renderAt(fileExplorerDeepLink('/home/user/.ssh/id_ed25519'))
    await ready()
    // Chain: health query -> init effect -> link consume -> resolve rejection -> link error.
    const notice = await screen.findByTestId(
      'file-explorer-link-error',
      undefined,
      { timeout: LINK_CHAIN_TIMEOUT_MS },
    )
    expect(notice).toHaveTextContent(
      i18nT('fileExplorerPage.link_open_failed', { path: '/home/user/.ssh/id_ed25519' }),
    )
    // The literal too: a key filed under the wrong namespace would make the
    // `i18nT` assertion above match its own raw key.
    expect(notice).toHaveTextContent('Couldn’t open /home/user/.ssh/id_ed25519.')
    expect(notice).toHaveTextContent('access denied: sensitive path')
    expect(url()).toBe(PAGE)
    expect(fileTabs()).toHaveLength(0)
    // Dismissable: the tree underneath is still the page.
    await userEvent.click(within(notice).getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByTestId('file-explorer-link-error')).not.toBeInTheDocument()
  })

  it('reports a path that no longer exists', async () => {
    vi.mocked(fileExplorerApi.resolve).mockResolvedValue({ exists: false, type: 'missing', path: '/home/user/gone.txt' })
    renderAt(fileExplorerDeepLink('/home/user/gone.txt'))
    await ready()
    // Chain: health query -> init effect -> link consume -> resolve missing -> link error.
    const notice = await screen.findByTestId(
      'file-explorer-link-error',
      undefined,
      { timeout: LINK_CHAIN_TIMEOUT_MS },
    )
    expect(notice).toHaveTextContent(i18nT('fileExplorerPage.link_target_missing'))
    expect(fileTabs()).toHaveLength(0)
  })

  it('refuses a relative path without asking the backend, as a status rather than an error', async () => {
    renderAt(fileExplorerDeepLink('src/index.ts'))
    await ready()
    // Chain: health query -> init effect -> link consume -> client-side refusal.
    const notice = await screen.findByTestId(
      'file-explorer-link-refused',
      undefined,
      { timeout: LINK_CHAIN_TIMEOUT_MS },
    )
    expect(notice).toHaveTextContent(i18nT('fileExplorerPage.link_target_relative', { path: 'src/index.ts' }))
    expect(notice).toHaveTextContent('src/index.ts')
    expect(fileExplorerApi.resolve).not.toHaveBeenCalled()
    expect(url()).toBe(PAGE)
    expect(fileTabs()).toHaveLength(0)
    // Nothing failed: no request was sent, so there is no error journal entry
    // for a hand-off to recover. The refusal is a status, not an alert, and
    // offers no "Ask the agent" — only the backend outcomes above do.
    expect(notice).toHaveAttribute('role', 'status')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByTestId('file-explorer-link-error')).not.toBeInTheDocument()
    expect(within(notice).queryByRole('button', { name: /ask the agent/i })).not.toBeInTheDocument()
    // Dismissable: the tree underneath is still the page.
    await userEvent.click(within(notice).getByRole('button', { name: i18nT('common.dismiss') }))
    expect(screen.queryByTestId('file-explorer-link-refused')).not.toBeInTheDocument()
  })

  it('renders nothing new and probes nothing when the URL carries no param', async () => {
    renderAt(PAGE)
    await ready()
    expect(fileExplorerApi.resolve).not.toHaveBeenCalled()
    expect(screen.queryByTestId('file-explorer-link-error')).not.toBeInTheDocument()
    expect(screen.queryByTestId('file-explorer-link-refused')).not.toBeInTheDocument()
    expect(fileTabs()).toHaveLength(0)
  })
})
