/**
 * The File Explorer API client, over the host's permission-scoped client
 * (`useAppApi()`), so every request is confined to the `permissions.api` prefix
 * in app.json (`/apps/file-explorer/api`): the gateway's reverse proxy to this
 * app's own backend.
 *
 * The root component binds the client once (`bindAppApi`) before any child
 * renders; the request functions read it at call time. That keeps
 * `fileExplorerApi` a plain object the page's queries call, as the built-in's
 * was, and one a test can replace wholesale.
 *
 * A refusal throws a `FileExplorerApiError` whose message is the backend's own
 * sentence ("path not allowed: ..."), the reason a user needs, and whose `code`
 * is the gateway's machine-readable code when there is one (`app_not_enabled`).
 */

import type { AppApi } from '@kirocrew/app-sdk'
import { API_BASE } from './constants'
import type { TreeEntry, FileMeta, SearchResult } from './types'

let bound: AppApi | null = null

/** Called by the root component with `useAppApi()`. */
export function bindAppApi(api: AppApi): void {
  bound = api
}

export class FileExplorerApiError extends Error {
  readonly status: number
  readonly code: string | undefined
  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'FileExplorerApiError'
    this.status = status
    this.code = code
  }
}

function isScopedFailure(e: unknown): e is { status: number; body: string } {
  return typeof e === 'object' && e !== null && typeof (e as { status?: unknown }).status === 'number'
}

/** The backend's sentence and code from a refusal body, or the status alone. */
export function toFileExplorerError(status: number, body: unknown): FileExplorerApiError {
  const text = typeof body === 'string' ? body.trim() : ''
  if (text) {
    try {
      const parsed = JSON.parse(text) as { error?: unknown; code?: unknown }
      const message = typeof parsed.error === 'string' && parsed.error ? parsed.error : `HTTP ${status}`
      return new FileExplorerApiError(status, message, typeof parsed.code === 'string' ? parsed.code : undefined)
    } catch {
      return new FileExplorerApiError(status, text.slice(0, 300))
    }
  }
  return new FileExplorerApiError(status, `HTTP ${status}`)
}

/** The machine-readable code of a refusal, if the gateway sent one. */
export function apiErrorCode(e: unknown): string | undefined {
  return e instanceof FileExplorerApiError ? e.code : undefined
}

async function get<T>(path: string): Promise<T> {
  if (!bound) throw new Error('file-explorer: the host API client is not bound')
  try {
    return await bound.get<T>(path)
  } catch (e) {
    if (isScopedFailure(e)) {
      let body: unknown = ''
      try {
        body = typeof e.body === 'string' ? e.body : ''
      } catch {
        body = ''
      }
      throw toFileExplorerError(e.status, body)
    }
    throw e
  }
}

export const fileExplorerApi = {
  health: () => get<{ allowedRoots: string[]; home?: string }>(`${API_BASE}/health`),

  tree: (path: string, depth = 1) =>
    get<{ entries: TreeEntry[] }>(`${API_BASE}/tree?path=${encodeURIComponent(path)}&depth=${depth}`),

  read: (path: string, maxBytes?: number) => {
    const q = new URLSearchParams({ path })
    if (maxBytes) q.set('max_bytes', String(maxBytes))
    return get<FileMeta>(`${API_BASE}/read?${q.toString()}`)
  },

  search: (path: string, q: string, include = '', exclude = '') => {
    const params = new URLSearchParams({ path, q })
    if (include) params.set('include', include)
    if (exclude) params.set('exclude', exclude)
    return get<{ results: SearchResult[]; engine?: string; truncated?: boolean }>(`${API_BASE}/search?${params.toString()}`)
  },

  gitStatus: (path: string) =>
    get<{ repoRoot: string; branch?: string; statuses: Record<string, string> } | null>(`${API_BASE}/git-status?path=${encodeURIComponent(path)}`),

  // `path` is the backend's RESOLVED spelling (symlinks followed, `~` expanded):
  // the one its tree nodes carry, so a caller that keys state by path must use
  // it rather than the string it asked about.
  resolve: (path: string) =>
    get<{ exists: boolean; type: string; path?: string }>(`${API_BASE}/resolve?path=${encodeURIComponent(path)}`),

  complete: (path: string, kind = 'dir', limit = 30) => {
    const q = new URLSearchParams({ path, kind, limit: String(limit) })
    return get<{ entries: TreeEntry[] }>(`${API_BASE}/complete?${q.toString()}`)
  },
}
