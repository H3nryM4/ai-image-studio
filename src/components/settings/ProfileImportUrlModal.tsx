import { useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { ApiProfile } from '../../types'
import { useCloseOnEscape } from '../../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../../hooks/usePreventBackgroundScroll'
import { Checkbox } from '../Checkbox'
import { CloseIcon, LinkIcon } from '../icons'

interface ProfileImportUrlModalProps {
  profile: ApiProfile
  onCopy: (includeApiKey: boolean, format: 'link' | 'json' | 'file') => void
  onClose: () => void
  scrollBoundaryRef: RefObject<HTMLDivElement | null>
}

export default function ProfileImportUrlModal({ profile, onCopy, onClose, scrollBoundaryRef }: ProfileImportUrlModalProps) {
  const [includeKey, setIncludeKey] = useState(false)
  useCloseOnEscape(true, onClose)
  usePreventBackgroundScroll(true, scrollBoundaryRef)

  return createPortal(
    <div data-no-drag-select className="fixed inset-0 z-[110] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20 backdrop-blur-md dark:bg-black/40 animate-overlay-in" />
      <div ref={scrollBoundaryRef} role="dialog" aria-modal="true" aria-labelledby="profile-share-title" className="relative max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-3xl border border-white/50 bg-white p-6 shadow-2xl dark:border-white/[0.08] dark:bg-gray-900 custom-scrollbar" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 id="profile-share-title" className="flex min-w-0 items-start gap-2 text-base font-bold text-gray-800 dark:text-gray-100"><LinkIcon className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" /><span className="break-all">分享「{profile.name}」</span></h3>
          <button type="button" onClick={onClose} aria-label="关闭分享" className="shrink-0 rounded-full p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06]"><CloseIcon className="h-5 w-5" /></button>
        </div>
        <p className="mb-5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">接收方预览确认后，添加到自己的配置中。</p>
        <Checkbox checked={includeKey} onChange={setIncludeKey} label="包含 API Key" />
        {includeKey && <p className="mt-2 text-xs text-orange-600 dark:text-orange-400">接收方可查看并使用此密钥，请仅分享给可信的人。</p>}
        <button type="button" onClick={() => onCopy(includeKey, 'link')} className="mt-5 w-full rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-600">复制分享链接</button>
        <details className="mt-5 border-t border-gray-100 pt-4 dark:border-white/[0.08]">
          <summary className="cursor-pointer text-xs text-gray-400">其他方式</summary>
          <p className="mt-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">聊天软件发长链接容易被截断，可以复制文本；部署预置或存档可以下载 JSON 文件。</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => onCopy(includeKey, 'json')} className="flex-1 rounded-xl px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/[0.06]">复制为文本</button>
            <button type="button" onClick={() => onCopy(includeKey, 'file')} className="flex-1 rounded-xl px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/[0.06]">下载 JSON 文件</button>
          </div>
        </details>
      </div>
    </div>,
    document.body,
  )
}
