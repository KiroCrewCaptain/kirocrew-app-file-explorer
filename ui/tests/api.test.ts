import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiErrorCode, bindAppApi, fileExplorerApi, FileExplorerApiError } from '../src/api'
import { stubApi } from './stubs/app-sdk'

/**
 * The File Explorer HTTP seam, ported from Kiro Crew's `FileExplorerApiCov80`
 * and `fileExplorer.test.tsx` API cases. The built-in called `fetch` itself; this
 * copy calls the host's permission-scoped client, so the assertions read the
 * path that client was handed. Every path a user can type travels through these
 * query strings, so encoding is the whole job: a path with a space, a `#`, or a
 * `&` must survive as ONE parameter. The error path matters too: the backend's
 * own message is what tells the user "outside the allowed roots" instead of a
 * bare 403.
 */
const BASE = '/apps/file-explorer/api'

let get: ReturnType<typeof vi.fn>

/** What the scoped client throws for a non-2xx: the status and the raw body text. */
function refusal(status: number, body: string) {
  return Object.assign(new Error(`API ${status}: ${body}`), { name: 'AppApiError', status, body })
}

const calledPath = () => String(get.mock.calls[0][0])

beforeEach(() => {
  get = vi.fn(async () => ({ zzz: true }))
  stubApi.get = get as unknown as typeof stubApi.get
  bindAppApi(stubApi)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fileExplorerApi requests', () => {
  it('goes through the scoped client under the declared prefix and returns its JSON', async () => {
    get.mockResolvedValue({ allowedRoots: ['/zzz'], home: '/zzz' })
    await expect(fileExplorerApi.health()).resolves.toEqual({ allowedRoots: ['/zzz'], home: '/zzz' })
    expect(calledPath()).toBe(`${BASE}/health`)
  })

  it('encodes the tree path and defaults the depth to 1', async () => {
    await fileExplorerApi.tree('/zzz dir/&sub')
    expect(calledPath()).toBe(`${BASE}/tree?path=%2Fzzz%20dir%2F%26sub&depth=1`)
  })

  it('carries an explicit tree depth', async () => {
    await fileExplorerApi.tree('/zzz', 3)
    expect(calledPath()).toBe(`${BASE}/tree?path=%2Fzzz&depth=3`)
  })

  it('omits max_bytes when not asked for, and sends it when it is', async () => {
    await fileExplorerApi.read('/zzz/file #1.txt')
    expect(calledPath()).toContain('path=%2Fzzz%2Ffile+%231.txt')
    expect(calledPath()).not.toContain('max_bytes')

    get.mockClear()
    await fileExplorerApi.read('/zzz/file.txt', 4096)
    expect(calledPath()).toContain('max_bytes=4096')
  })

  it('treats a zero max_bytes as "no cap" rather than a zero-byte read', async () => {
    await fileExplorerApi.read('/zzz/file.txt', 0)
    expect(calledPath()).not.toContain('max_bytes')
  })

  it('sends the search query, adding include/exclude only when non-empty', async () => {
    await fileExplorerApi.search('/zzz', 'needle & thread')
    expect(calledPath()).toContain('q=needle+%26+thread')
    expect(calledPath()).not.toContain('include=')
    expect(calledPath()).not.toContain('exclude=')

    get.mockClear()
    await fileExplorerApi.search('/zzz', 'needle', '*.ts', 'node_modules')
    expect(calledPath()).toContain('include=*.ts')
    expect(calledPath()).toContain('exclude=node_modules')
  })

  it('encodes the path for git-status and resolve', async () => {
    await fileExplorerApi.gitStatus('/zzz repo')
    expect(calledPath()).toBe(`${BASE}/git-status?path=%2Fzzz%20repo`)

    get.mockClear()
    await fileExplorerApi.resolve('/zzz?x')
    expect(calledPath()).toBe(`${BASE}/resolve?path=%2Fzzz%3Fx`)
  })

  it('defaults completion to directories with a bounded limit', async () => {
    await fileExplorerApi.complete('/zzz/')
    expect(calledPath()).toContain('kind=dir')
    expect(calledPath()).toContain('limit=30')

    get.mockClear()
    await fileExplorerApi.complete('/zzz/', 'file', 5)
    expect(calledPath()).toContain('kind=file')
    expect(calledPath()).toContain('limit=5')
  })
})

describe('fileExplorerApi failures', () => {
  it("raises the backend's own sentence from its JSON body", async () => {
    get.mockRejectedValue(refusal(403, JSON.stringify({ error: 'path not allowed: /zzz' })))
    await expect(fileExplorerApi.tree('/zzz')).rejects.toThrow('path not allowed: /zzz')
  })

  it('keeps a plain-text body as the reason', async () => {
    get.mockRejectedValue(refusal(403, 'zzz outside the allowed roots'))
    await expect(fileExplorerApi.tree('/zzz')).rejects.toThrow('zzz outside the allowed roots')
  })

  it('falls back to the status code when the body is empty', async () => {
    get.mockRejectedValue(refusal(500, ''))
    await expect(fileExplorerApi.health()).rejects.toThrow('HTTP 500')
  })

  it('carries the status and the gateway code, so a disabled app reads as a setting', async () => {
    get.mockRejectedValue(refusal(403, JSON.stringify({ error: 'App is not enabled', code: 'app_not_enabled' })))
    const err = await fileExplorerApi.health().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(FileExplorerApiError)
    expect((err as FileExplorerApiError).status).toBe(403)
    expect(apiErrorCode(err)).toBe('app_not_enabled')
  })

  it('passes a non-HTTP failure through unchanged (the scoped client refusing a path)', async () => {
    const outOfScope = new Error('[app-sdk] App "file-explorer" not permitted to access /api/x')
    get.mockRejectedValue(outOfScope)
    await expect(fileExplorerApi.health()).rejects.toBe(outOfScope)
    expect(apiErrorCode(outOfScope)).toBeUndefined()
  })
})
