// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../store'
import { createDefaultOpenAIProfile, DEFAULT_SETTINGS, normalizeSettings } from '../lib/apiProfiles'
import SettingsModal from './SettingsModal'

vi.mock('../store', async () => {
  const { create } = await import('zustand')
  const { DEFAULT_SETTINGS, normalizeSettings } = await import('../lib/apiProfiles')
  const useStore = create((set) => ({
    settings: normalizeSettings(DEFAULT_SETTINGS),
    showSettings: false,
    settingsTabRequest: null,
    tasks: [],
    setSettings: (settings: typeof DEFAULT_SETTINGS) => set({ settings: normalizeSettings(settings) }),
    setShowSettings: (showSettings: boolean) => set({ showSettings }),
    dismissPresetProfile: vi.fn(),
    dismissPresetProvider: vi.fn(),
    restorePresetProvider: vi.fn(),
    setReusedTaskApiProfile: vi.fn(),
    setConfirmDialog: vi.fn(),
    showToast: vi.fn(),
  }))
  return { useStore, exportData: vi.fn(), importData: vi.fn(), clearData: vi.fn() }
})

afterEach(() => vi.unstubAllGlobals())

describe('settings modal lifecycle', () => {
  it('reopens with imported settings and clears a previously open share dialog', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() })
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
    useStore.setState({ showSettings: false, settings: normalizeSettings(DEFAULT_SETTINGS) })
    const el = document.createElement('div')
    document.body.appendChild(el)
    const root = createRoot(el)
    try {
      await act(async () => root.render(<SettingsModal onImportProfile={() => {}} />))
      await act(async () => useStore.setState({ showSettings: true }))
      const share = Array.from(el.querySelectorAll('button')).find((button) => button.textContent === '分享')!
      await act(async () => share.click())
      expect(document.getElementById('profile-share-title')).not.toBeNull()

      // 外部分享链接会先关闭设置，确认导入后再打开，不能带回旧草稿和弹窗。
      await act(async () => useStore.setState({ showSettings: false }))
      const profile = createDefaultOpenAIProfile({ id: 'imported', name: '新导入的配置', baseUrl: 'https://imported.example/v1' })
      await act(async () => useStore.setState({ settings: normalizeSettings({ ...DEFAULT_SETTINGS, profiles: [profile], activeProfileId: profile.id }), showSettings: true }))
      expect(document.getElementById('profile-share-title')).toBeNull()
      expect(el.querySelector<HTMLInputElement>('input[aria-label="配置名称"]')?.value).toBe(profile.name)
      expect(el.querySelector<HTMLInputElement>('input[aria-label="API 地址"]')?.value).toBe(profile.baseUrl)
    } finally {
      await act(async () => root.unmount())
      el.remove()
    }
  })
})
