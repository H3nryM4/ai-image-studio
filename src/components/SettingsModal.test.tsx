// @vitest-environment jsdom
import { act, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../store'
import { createDefaultOpenAIProfile, DEFAULT_IMAGES_MODEL, DEFAULT_SETTINGS, normalizeSettings } from '../lib/apiProfiles'
import * as presetConfig from '../lib/presetConfig'
import type Select from './Select'
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
    dismissPresetConnection: vi.fn(),
    restorePresetConnection: vi.fn(),
    setReusedTaskApiProfile: vi.fn(),
    setConfirmDialog: vi.fn(),
    showToast: vi.fn(),
  }))
  return { useStore, exportData: vi.fn(), importData: vi.fn(), clearData: vi.fn() }
})

vi.mock('./Select', () => ({
  default: (props: ComponentProps<typeof Select>) => (
    <select value={props.value} disabled={props.disabled} onChange={(e) => props.onChange(e.target.value)}>
      {props.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  ),
}))

let el: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() })
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  useStore.setState({ showSettings: false, settings: normalizeSettings(DEFAULT_SETTINGS) })
  el = document.createElement('div')
  document.body.appendChild(el)
  root = createRoot(el)
})

afterEach(async () => {
  await act(async () => root.unmount())
  el.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function openSettings(settings = normalizeSettings(DEFAULT_SETTINGS)) {
  await act(async () => root.render(<SettingsModal onImportProfile={vi.fn()} />))
  await act(async () => useStore.setState({ settings, showSettings: true }))
}

async function selectConnection(value: string) {
  const select = el.querySelector('select')!
  await act(async () => {
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

describe('settings modal', () => {
  it('saves home visibility separately from the profile default value', async () => {
    await openSettings()
    const toggle = el.querySelector<HTMLButtonElement>('button[aria-label="首页显示图片格式"]')!
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    await act(async () => toggle.click())
    expect(useStore.getState().settings.profiles[0].homeParams).toContain('output_format')
    const select = toggle.parentElement!.querySelector('select')!
    await act(async () => {
      select.value = 'webp'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await act(async () => toggle.click())
    expect(useStore.getState().settings.profiles[0].homeParams).not.toContain('output_format')
    expect(useStore.getState().settings.profiles[0].paramDefaults?.output_format).toBe('webp')
  })

  it('shares, copies and deletes the chosen dropdown entry without acting on another profile', async () => {
    const primary = createDefaultOpenAIProfile({ isDefault: true })
    const source = createDefaultOpenAIProfile({ id: 'secondary', name: '备用配置', baseUrl: 'https://secondary.example/v1', model: 'vendor-image' })
    await openSettings(normalizeSettings({ profiles: [primary, source], activeProfileId: primary.id }))
    await act(async () => el.querySelector<HTMLButtonElement>('button[aria-label="选择配置"]')!.click())
    expect(el.querySelector<HTMLButtonElement>(`button[aria-label="删除配置「${primary.name}」"]`)!.disabled).toBe(true)
    await act(async () => el.querySelector<HTMLButtonElement>('button[aria-label="分享配置「备用配置」"]')!.click())
    expect(document.getElementById('profile-share-title')?.textContent).toContain('备用配置')
    expect(useStore.getState().settings.activeProfileId).toBe(primary.id)

    await act(async () => document.querySelector<HTMLButtonElement>('button[aria-label="关闭分享"]')!.click())
    await act(async () => el.querySelector<HTMLButtonElement>('button[aria-label="选择配置"]')!.click())
    await act(async () => el.querySelector<HTMLButtonElement>('button[aria-label="复制配置「备用配置」"]')!.click())
    const settings = useStore.getState().settings
    const copy = settings.profiles.find((profile) => profile.id === settings.activeProfileId)!
    expect(copy).toMatchObject({ name: '备用配置（副本）', baseUrl: source.baseUrl, model: source.model })
    expect(copy.id).not.toBe(source.id)
    expect(useStore.getState().showToast).toHaveBeenCalledWith('已创建副本「备用配置（副本）」', 'success')
    const nameInput = el.querySelector<HTMLInputElement>('input[aria-label="配置名称"]')!
    expect(document.activeElement).toBe(nameInput)
    expect(nameInput.selectionStart).toBe(0)
    expect(nameInput.selectionEnd).toBe(copy.name.length)

    await act(async () => el.querySelector<HTMLButtonElement>('button[aria-label="选择配置"]')!.click())
    await act(async () => el.querySelector<HTMLButtonElement>('button[aria-label="删除配置「备用配置」"]')!.click())
    const calls = vi.mocked(useStore.getState().setConfirmDialog).mock.calls
    const confirm = calls[calls.length - 1][0]!
    expect(confirm.message).toContain('备用配置')
    await act(async () => confirm.action!())
    expect(useStore.getState().settings.profiles.map((profile) => profile.id)).toEqual([primary.id, copy.id])
    expect(useStore.getState().settings.activeProfileId).toBe(copy.id)
  })

  it('gives repeated copies distinct names and keeps the original unchanged', async () => {
    const source = createDefaultOpenAIProfile({ isDefault: true, name: '工作配置' })
    await openSettings(normalizeSettings({ profiles: [source], activeProfileId: source.id }))
    for (let idx = 0; idx < 2; idx++) {
      await act(async () => el.querySelector<HTMLButtonElement>('button[aria-label="选择配置"]')!.click())
      await act(async () => el.querySelector<HTMLButtonElement>('button[aria-label="复制配置「工作配置」"]')!.click())
    }
    await act(async () => el.querySelector<HTMLButtonElement>('button[aria-label="选择配置"]')!.click())
    await act(async () => el.querySelector<HTMLButtonElement>('button[aria-label="复制配置「工作配置（副本）」"]')!.click())
    const settings = useStore.getState().settings
    expect(settings.profiles.map((profile) => profile.name)).toEqual(['工作配置', '工作配置（副本）', '工作配置（副本 2）', '工作配置（副本 3）'])
    expect(settings.activeProfileId).toBe(settings.profiles[3].id)
    expect(settings.profiles[0]).toEqual(source)
  })

  it('reopens with imported settings and clears a previously open share dialog', async () => {
    await openSettings()
    await act(async () => el.querySelector<HTMLButtonElement>('button[aria-label="选择配置"]')!.click())
    const share = el.querySelector<HTMLButtonElement>('button[aria-label^="分享配置"]')!
    await act(async () => share.click())
    expect(document.getElementById('profile-share-title')).not.toBeNull()

    // 外部分享链接会先关闭设置，确认导入后再打开，不能带回旧草稿和弹窗。
    await act(async () => useStore.setState({ showSettings: false }))
    const profile = createDefaultOpenAIProfile({ id: 'imported', name: '新导入的配置', baseUrl: 'https://imported.example/v1' })
    await act(async () => useStore.setState({ settings: normalizeSettings({ ...DEFAULT_SETTINGS, profiles: [profile], activeProfileId: profile.id }), showSettings: true }))
    expect(document.getElementById('profile-share-title')).toBeNull()
    expect(el.querySelector<HTMLInputElement>('input[aria-label="配置名称"]')?.value).toBe(profile.name)
    expect(el.querySelector<HTMLInputElement>('input[aria-label="API 地址"]')?.value).toBe(profile.baseUrl)
  })

  it('switches connections while preserving credentials, models and connection drafts', async () => {
    const connection = { id: 'vendor:images', name: '自定义接入', submit: { path: '/generate' } }
    const profile = createDefaultOpenAIProfile({ id: 'saved', apiKey: 'local-key', baseUrl: 'https://vendor.example/v1', model: DEFAULT_IMAGES_MODEL, streamImages: true })
    const settings = normalizeSettings({ ...DEFAULT_SETTINGS, customConnections: [connection], profiles: [profile], activeProfileId: profile.id })
    await openSettings(settings)
    expect(Array.from(el.querySelector('select')!.options).map((option) => option.value)).toEqual([
      '__add_custom_connection__', 'openai-images', 'vendor:images',
    ])
    expect(el.querySelector('input[aria-label="模型 ID"]')).not.toBeNull()

    await selectConnection(connection.id)
    expect(useStore.getState().settings.profiles[0]).toMatchObject({ connectionId: connection.id, model: DEFAULT_IMAGES_MODEL, apiKey: profile.apiKey, baseUrl: profile.baseUrl, streamImages: false })
    const input = el.querySelector<HTMLInputElement>('input[aria-label="模型 ID"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'vendor/model')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
    await selectConnection('openai-images')
    expect(useStore.getState().settings.profiles[0]).toMatchObject({ connectionId: 'openai-images', model: DEFAULT_IMAGES_MODEL, apiKey: profile.apiKey, baseUrl: profile.baseUrl, streamImages: true })
    await selectConnection(connection.id)
    expect(useStore.getState().settings.profiles[0]).toMatchObject({ connectionId: connection.id, model: 'vendor/model', apiKey: profile.apiKey, streamImages: false })
  })

  it('keeps the connection fixed in preset-only mode', async () => {
    vi.spyOn(presetConfig, 'isPresetConfigOnlyEnabled').mockReturnValue(true)
    await openSettings()
    expect(Array.from(el.querySelector('select')!.options).map((option) => option.value)).toEqual(['openai-images'])
    expect(el.querySelector('select')!.disabled).toBe(true)
    await selectConnection('custom-connection')
    expect(useStore.getState().settings.profiles[0].connectionId).toBe('openai-images')
  })
})
