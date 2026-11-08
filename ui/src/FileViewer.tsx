import { useCallback, useState } from 'react'
import { FileText, FileQuestion, RefreshCw, Download, Copy, MoreHorizontal, ShieldAlert } from 'lucide-react'
import { EmptyState, ErrorNotice, MarkdownRenderer, Skeleton } from '@kirocrew/app-sdk/ui'
import { useIsMobile } from './lib/useIsMobile'
import { Menu, MenuItem, type MenuPosition } from './lib/Menu'
import { IMAGE_EXTS, LANG_BY_EXT } from './constants'
import { extOf, basename, formatBytes, formatTime, isSensitivePath } from './utils'
import { copyToClipboard } from './lib/platform'
import type { FileMeta } from './types'

import { i18nT } from './i18n'
interface FileViewerProps {
  filePath: string | null
  fileMeta: FileMeta | null
  content: string
  loading: boolean
  error: string | null
  onReload: () => void
  onDownload: () => void
}

function renderViewerBody({ ext, fileMeta, content, openFile }: { ext: string; fileMeta: FileMeta; content: string; openFile: string }) {
  if (fileMeta.binary && fileMeta.encoding !== 'base64') {
    return <EmptyState icon={<FileQuestion size={22} />} title={i18nT('fileViewer.binary_file')} subtitle={`${formatBytes(fileMeta.size)} · ${fileMeta.mime || 'unknown'}`} />
  }
  if (IMAGE_EXTS.has(ext) && fileMeta.encoding === 'base64') {
    const src = `data:${fileMeta.mime || 'image/png'};base64,${content}`
    return <div className="mc-fe-img-wrap"><img src={src} alt={openFile} style={{ maxWidth: '100%', maxHeight: '100%' }} /></div>
  }
  if (ext === '.md' || ext === '.markdown') {
    // The built-in also told the renderer the file's own path, so a bare
    // relative image (`![](diagram.png)`) loaded from beside the file. The App
    // SDK does not export that context yet (PORTING.md), so such an image shows
    // its fallback instead.
    void openFile
    return <MarkdownRenderer content={content || ''} />
  }
  const lang = LANG_BY_EXT[ext] || 'plaintext'
  const maxRun = (content || '').match(/`{3,}/g)?.reduce((max, s) => Math.max(max, s.length), 0) ?? 0
  const fence = '`'.repeat(Math.max(3, maxRun + 1))
  const wrapped = fence + lang + '\n' + (content || '') + '\n' + fence
  // A code file is one fence, so its Edit view is the host's chat code editor,
  // which caps itself at 480px. `.mc-fe-code-file` (FE_CSS) lifts that cap here
  // so the editor keeps the read view's height and the panel scrolls it.
  return <div className="mc-fe-code-file"><MarkdownRenderer content={wrapped} /></div>
}

export default function FileViewer({ filePath, fileMeta, content, loading, error, onReload, onDownload }: FileViewerProps) {
  const isMobile = useIsMobile()
  // Before the early returns: a hook cannot sit behind a conditional.
  const [menuAt, setMenuAt] = useState<MenuPosition | null>(null)
  const closeMenu = useCallback(() => setMenuAt(null), [])
  if (!filePath) {
    return <EmptyState icon={<FileText size={28} />} title={i18nT('fileViewer.select_a_file_to_view')} subtitle={isMobile ? undefined : i18nT('fileViewer.tip_ctrl_cmd_f_to_search')} />
  }
  if (loading) return <Skeleton className="h-full w-full" />
  if (error) {
    // A read failure, not an empty state: the viewer holds nothing to lose.
    return (
      <div className="p-4">
        <ErrorNotice message={error} askAgent />
      </div>
    )
  }
  if (!fileMeta) return null

  const ext = extOf(filePath)
  const fileName = basename(filePath)
  const copyPath = () => { copyToClipboard(filePath) }

  return (
    <>
      <div className="mc-fe-viewer-bar">
        <div className="mc-fe-viewer-title">
          <FileText size={14} style={{ marginRight: 6, opacity: 0.6 }} />
          <span className="mc-fe-viewer-filename">{fileName}</span>
          <button className="mc-fe-iconbtn" title={i18nT('fileViewer.copy_path_2', { path: filePath })} onClick={copyPath} aria-label={i18nT('fileViewer.copy_path')}>
            <Copy size={11} />
          </button>
        </div>
        <div className="mc-fe-viewer-actions">
          <span className="mc-fe-viewer-meta">{formatBytes(fileMeta.size)}</span>
          {fileMeta.mtime && <span className="mc-fe-viewer-meta"> · {formatTime(fileMeta.mtime)}</span>}
          {fileMeta.truncated && <span style={{ color: 'var(--warn)', fontSize: 11 }}> {i18nT('fileViewer.truncated')}</span>}
          <button className="mc-fe-iconbtn" title={i18nT('fileViewer.reload')} onClick={onReload} aria-label={i18nT('fileViewer.reload')}><RefreshCw size={12} /></button>
          {/* Overflow, not a third peer button: the row caps at two controls.
              The built-in also offered "open with the default app" and
              "reveal in the file manager" here; those call a Kiro Crew route
              outside this app's permissions, so this copy offers Download
              only (PORTING.md). */}
          <button
            className="mc-fe-iconbtn"
            title={i18nT('fileViewer.more_options')}
            aria-label={i18nT('fileViewer.more_options')}
            aria-haspopup="menu"
            data-fe-menu-trigger=""
            aria-expanded={menuAt !== null}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              setMenuAt(menuAt ? null : { x: r.right, y: r.bottom + 4, alignEnd: true })
            }}
          >
            <MoreHorizontal size={12} />
          </button>
          <Menu at={menuAt} onClose={closeMenu} label={i18nT('fileViewer.more_options')} testId="file-viewer-menu">
            <MenuItem onClose={closeMenu} onSelect={onDownload}>
              <Download size={13} className="shrink-0 text-muted" />
              <span>{i18nT('fileViewer.download')}</span>
            </MenuItem>
          </Menu>
        </div>
      </div>
      {isSensitivePath(filePath) && (
        <div style={{ padding: '6px 12px', background: 'color-mix(in srgb, var(--warn) 12%, transparent)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--warn)' }}>
          <ShieldAlert size={13} /> {i18nT('fileViewer.sensitive_file_avoid_sharing_your_screen_while_v')}
        </div>
      )}
      <div className="mc-fe-viewer-body">
        {renderViewerBody({ ext, fileMeta, content, openFile: filePath })}
      </div>
    </>
  )
}
