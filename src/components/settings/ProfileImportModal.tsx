import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { restoreExplicitPresetConfig, useStore } from '../../store'
import { getApiConnectionLabel, type ImportedConnectionSettings } from '../../lib/apiProfiles'
import { applyProfileImport, findSharedProfile, readProfileImport } from '../../lib/profileSharing'
import { isPresetConfigOnlyEnabled, isPresetProfileLocked } from '../../lib/presetConfig'
import { buildSettingsFromUrlParams, getExplicitUrlSettingsIds } from '../../lib/urlSettings'
import { useCloseOnEscape } from '../../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../../hooks/usePreventBackgroundScroll'
import { CloseIcon, ImportIcon } from '../icons'

interface ProfileImportModalProps {
  source: string
  onClose: () => void
}

export default function ProfileImportModal({ source, onClose }: ProfileImportModalProps) {
  const settings = useStore((s) => s.settings)
  const [text, setText] = useState(source)
  const [preview, setPreview] = useState<(ImportedConnectionSettings & { params: URLSearchParams }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'add' | 'reuse' | 'replace'>('add')
  const [targetId, setTargetId] = useState(settings.activeProfileId)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const presetOnly = isPresetConfigOnlyEnabled()
  const existing = preview ? findSharedProfile(settings, preview) : null
  const targets = settings.profiles.filter((profile) => !isPresetProfileLocked(profile.id))

  const showPreview = (value: string) => {
    try {
      setPreview(readProfileImport(value, useStore.getState().settings))
      setMode('add')
      setError(null)
    } catch (err) {
      setPreview(null)
      setError(err instanceof SyntaxError ? '配置 JSON 格式无效' : err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    if (source) showPreview(source)
  }, [source])

  useCloseOnEscape(!busy, onClose)
  usePreventBackgroundScroll(true, scrollRef)

  const handleImport = async () => {
    if (!preview || busy) return
    setBusy(true)
    try {
      if (presetOnly) await restoreExplicitPresetConfig(getExplicitUrlSettingsIds(preview.params))
      const current = useStore.getState()
      const params = new URLSearchParams(preview.params)
      if (presetOnly) params.set('apiKey', preview.profiles[0].apiKey)
      const next = presetOnly
        ? buildSettingsFromUrlParams(current.settings, params)
        : applyProfileImport(current.settings, preview, mode, targetId)
      if (!next.profiles?.length) throw new Error('无法导入此配置，请重新预览')
      current.setReusedTaskApiProfile(null)
      current.setSettings(next)
      current.showToast(mode === 'reuse' && !presetOnly ? '已切换到已有配置' : '配置已导入', 'success')
      onClose()
      current.setShowSettings(true, 'api')
    } catch (err) {
      console.warn('导入 API 配置失败', err)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div data-no-drag-select className="fixed inset-0 z-[115] flex items-center justify-center p-4" onClick={() => { if (!busy) onClose() }}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-overlay-in" />
      <div ref={scrollRef} role="dialog" aria-modal="true" aria-labelledby="profile-import-title" className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/50 bg-white p-6 shadow-2xl dark:border-white/[0.08] dark:bg-gray-900 custom-scrollbar" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between gap-3">
          <h3 id="profile-import-title" className="flex items-center gap-2 text-base font-bold text-gray-800 dark:text-gray-100"><ImportIcon className="h-5 w-5 text-blue-500" />{preview ? '预览 API 配置' : '导入 API 配置'}</h3>
          <button type="button" aria-label="关闭导入" disabled={busy} onClick={onClose} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06]"><CloseIcon className="h-5 w-5" /></button>
        </div>

        {!preview ? (
          <div className="space-y-4">
            <label className="block text-sm text-gray-600 dark:text-gray-300">
              分享链接或配置 JSON
              <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={7} placeholder="在此粘贴…" className="mt-2 w-full resize-y rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm outline-none focus:border-blue-400 dark:border-white/10 dark:bg-white/[0.04]" />
            </label>
            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={() => fileRef.current?.click()} className="text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400">选择 JSON 文件</button>
              <button type="button" disabled={!text.trim()} onClick={() => showPreview(text)} className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50">预览配置</button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {preview.profiles.map((profile, idx) => (
              <div key={profile.id} className="space-y-3 rounded-2xl bg-gray-50 p-4 dark:bg-white/[0.04]">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="break-all text-sm font-semibold text-gray-800 dark:text-gray-100">{profile.name}</h4>
                  <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">{getApiConnectionLabel({ ...settings, customConnections: preview.customConnections }, profile.connectionId)}</span>
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs">
                  <dt className="text-gray-400">API 地址</dt><dd className="break-all text-gray-600 dark:text-gray-300">{profile.baseUrl || '使用部署代理'}</dd>
                  <dt className="text-gray-400">{profile.connectionId === 'openai-responses' ? '请求模型' : '模型 ID'}</dt><dd className="break-all text-gray-600 dark:text-gray-300">{profile.model}</dd>
                  {profile.connectionId === 'openai-responses' && <><dt className="text-gray-400">图像生成模型</dt><dd className="break-all text-gray-600 dark:text-gray-300">{profile.imageGenerationModel || 'API 默认'}</dd></>}
                </dl>
                {mode !== 'reuse' && <label className="block text-xs text-gray-500 dark:text-gray-400">
                  API Key
                  <input type="password" autoComplete="off" value={profile.apiKey} disabled={busy} placeholder="可稍后填写" onChange={(e) => setPreview({ ...preview, profiles: preview.profiles.map((item, i) => i === idx ? { ...item, apiKey: e.target.value } : item) })} className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-400 dark:border-white/10 dark:bg-gray-900 dark:text-gray-200" />
                </label>}
              </div>
            ))}

            {presetOnly ? <p className="text-xs text-gray-500">将更新匹配的预置配置，仅导入此部署允许修改的字段。</p> : (
              <fieldset disabled={busy} className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                <legend className="mb-2 text-xs text-gray-400">导入方式</legend>
                <label className="flex items-center gap-2"><input type="radio" name="profile-import-mode" checked={mode === 'add'} onChange={() => setMode('add')} className="accent-blue-500" />添加为新配置{preview.profiles.length > 1 ? `（${preview.profiles.length} 项）` : ''}</label>
                {existing && <label className="flex items-center gap-2"><input type="radio" name="profile-import-mode" checked={mode === 'reuse'} onChange={() => setMode('reuse')} className="accent-blue-500" /><span>使用已有配置「{existing.name}」</span></label>}
                {preview.profiles.length === 1 && targets.length > 0 && <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2"><input type="radio" name="profile-import-mode" checked={mode === 'replace'} onChange={() => { setMode('replace'); if (!targets.some((profile) => profile.id === targetId)) setTargetId(targets[0].id) }} className="accent-blue-500" />覆盖已有配置</label>
                  {mode === 'replace' && <select aria-label="要覆盖的配置" value={targetId} onChange={(e) => setTargetId(e.target.value)} className="min-w-0 max-w-full rounded-lg border border-gray-200 bg-transparent px-2 py-1 dark:border-white/10 dark:bg-gray-900">{targets.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select>}
                </div>}
                {mode === 'replace' && <p className="text-xs text-orange-600 dark:text-orange-400">将替换所选配置的连接信息和选项。</p>}
              </fieldset>
            )}
            <div className="flex items-center justify-between gap-3 pt-1">
              <button type="button" disabled={busy} onClick={() => { setPreview(null); setError(null) }} className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">修改导入内容</button>
              <button type="button" disabled={busy || (mode === 'reuse' && !existing)} onClick={() => void handleImport()} className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50">{busy ? '正在导入…' : presetOnly ? '更新并使用' : mode === 'reuse' ? '使用此配置' : mode === 'replace' ? '覆盖并使用' : '添加并使用'}</button>
            </div>
          </div>
        )}
        {error && <p role="alert" className="mt-4 text-sm text-red-500">{error}</p>}
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          try {
            const value = await file.text()
            setText(value)
            showPreview(value)
          } catch (err) {
            console.warn('读取 API 配置文件失败', err)
            setError('读取文件失败，请重试')
          }
        }} />
      </div>
    </div>,
    document.body,
  )
}
