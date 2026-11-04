import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDefaultOpenAIProfile, normalizeSettings } from './apiProfiles'
import { applyProfileImport, createProfileShareJson, createProfileShareUrl, findSharedProfile, hasProfileImportUrl, readProfileImport } from './profileSharing'

const saved = createDefaultOpenAIProfile({ id: 'saved', name: '我的配置', apiKey: 'local-key', baseUrl: 'https://local.example/v1' })
const current = normalizeSettings({ profiles: [saved], activeProfileId: saved.id })

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('profile sharing', () => {
  it('round-trips a complete profile through a fragment without including credentials or local identity by default', () => {
    const profile = { ...saved, name: '中文 & + 配置', responseFormatB64Json: true, streamImages: true, streamPartialImages: 3 as const, timeout: 217, imageGenerationModel: '', connectionDrafts: { openai: { baseUrl: 'https://old.example' } } }
    const url = new URL(createProfileShareUrl('https://studio.example/app?old=1#section', profile))
    expect(url.search).toBe('')
    expect(url.hash).toMatch(/^#config=/)
    expect(url.toString()).not.toContain('local-key')
    expect(hasProfileImportUrl(url)).toBe(true)
    const raw = JSON.parse(new URLSearchParams(url.hash.slice(1)).get('config')!)
    expect(raw.profiles[0]).not.toHaveProperty('id')
    expect(raw.profiles[0]).not.toHaveProperty('isDefault')
    expect(raw.profiles[0]).not.toHaveProperty('connectionDrafts')
    const imported = readProfileImport(url.toString(), current)
    expect(imported.profiles[0]).toMatchObject({ name: profile.name, apiKey: '', responseFormatB64Json: true, streamImages: true, streamPartialImages: 3, timeout: 217, imageGenerationModel: '' })
  })

  it('includes the key only when explicitly requested and supports JSON file contents', () => {
    const imported = readProfileImport(createProfileShareJson(saved, undefined, true), current)
    expect(imported.profiles[0].apiKey).toBe('local-key')
    expect(readProfileImport(createProfileShareJson(saved), current).profiles[0].apiKey).toBe('')
  })

  it('previews legacy query updates without mutating or reusing a differently keyed local profile', () => {
    const before = structuredClone(current)
    const imported = readProfileImport('https://studio.example/?profileId=saved&apiKey=incoming-key&model=new-model', current)
    expect(current).toEqual(before)
    expect(imported.profiles[0]).toMatchObject({ apiKey: 'incoming-key', model: 'new-model', baseUrl: saved.baseUrl })
    expect(findSharedProfile(current, imported)).toBeNull()
    const next = applyProfileImport(current, imported, 'add')
    expect(next.profiles).toHaveLength(2)
    expect(next.profiles[0]).toEqual(saved)
    expect(next.activeProfileId).not.toBe(saved.id)
  })

  it('supports legacy JSON query links and unresolved New API keys', () => {
    const params = new URLSearchParams({ settings: JSON.stringify({ profiles: [{ ...saved, apiKey: '{key}' }] }) })
    const imported = readProfileImport(`https://studio.example/?${params}`, current)
    expect(imported.profiles).toHaveLength(1)
    expect(imported.profiles[0].apiKey).toBe('')
    const legacy = readProfileImport('https://studio.example/?apiUrl=https://other.example/v1&apiKey={key}&model=other', current)
    expect(legacy.profiles[0]).toMatchObject({ baseUrl: 'https://other.example/v1', apiKey: '', model: 'other' })
  })

  it('adds profiles with colliding source IDs and custom connection IDs without overwriting local data', () => {
    const connection = { id: 'custom', name: '本地服务', submit: { path: '/local' } }
    const base = normalizeSettings({ customConnections: [connection], profiles: [{ ...saved, connectionId: 'custom' }] })
    const incoming = readProfileImport(JSON.stringify({ customConnections: [{ ...connection, name: '传入服务', submit: { path: '/incoming' } }], profiles: [{ ...saved, connectionId: 'custom' }] }), base)
    const next = applyProfileImport(base, incoming, 'add')
    expect(next.customConnections[0]).toEqual(base.customConnections[0])
    expect(next.customConnections).toHaveLength(2)
    expect(next.profiles[0]).toEqual(base.profiles[0])
    expect(next.profiles[1].connectionId).toBe(next.customConnections[1].id)
    expect(next.profiles[1].id).not.toBe(saved.id)
    expect(findSharedProfile(base, incoming)).toBeNull()
  })

  it('offers reuse based on connection details and preserves the existing key and options', () => {
    const imported = readProfileImport(createProfileShareJson({ ...saved, streamImages: true }), current)
    expect(findSharedProfile(current, imported)?.id).toBe(saved.id)
    const next = applyProfileImport(current, imported, 'reuse')
    expect(next.profiles).toEqual(current.profiles)
    expect(next.activeProfileId).toBe(saved.id)
  })

  it('replaces only the explicitly selected profile', () => {
    const imported = readProfileImport(createProfileShareJson({ ...saved, baseUrl: 'https://incoming.example', model: 'incoming' }), current)
    const next = applyProfileImport(current, imported, 'replace', saved.id)
    expect(next.profiles).toHaveLength(1)
    expect(next.profiles[0]).toMatchObject({ id: saved.id, baseUrl: 'https://incoming.example', model: 'incoming', apiKey: '' })
    expect(() => applyProfileImport(current, imported, 'replace', 'missing')).toThrow('无法覆盖')
    expect(current.profiles[0].apiKey).toBe('local-key')
  })

  it('imports multiple profiles as new entries with distinct IDs', () => {
    const imported = readProfileImport(JSON.stringify({ profiles: [saved, { ...saved, id: 'another', model: 'another-model' }] }), current)
    const next = applyProfileImport(current, imported, 'add')
    expect(next.profiles).toHaveLength(3)
    expect(new Set(next.profiles.map((profile) => profile.id)).size).toBe(3)
    expect(next.activeProfileId).toBe(next.profiles[1].id)
  })

  it('rejects invalid or unsupported payloads instead of importing a default profile', () => {
    expect(() => readProfileImport('https://studio.example/?settings=broken', current)).toThrow('JSON 无效')
    expect(() => readProfileImport('https://studio.example/#config=%7B%7D', current)).toThrow()
    expect(() => readProfileImport('https://studio.example/?unrelated=1', current)).toThrow('没有 API 配置')
    expect(() => readProfileImport(JSON.stringify({ format: 'ai-image-studio-profile', version: 1, profiles: [saved] }), current)).toThrow('不支持此配置版本')
    expect(() => readProfileImport(JSON.stringify({ profiles: [{ connectionId: 'missing' }] }), current)).toThrow('不存在的自定义服务商')
  })

  it('previews only allowed fields in a locked preset deployment and rejects normal add/replace actions', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_SHOW_PRESET_CONFIG_ONLY', 'true')
    vi.stubEnv('VITE_LOCK_PRESET_CONFIG_PARAMS', 'true')
    const policy = await import('./presetConfig')
    policy.setPresetConfig({ customConnections: [], profiles: [saved] })
    const sharing = await import('./profileSharing')
    const imported = sharing.readProfileImport('https://studio.example/?profileId=saved&apiKey=new-key&model=untrusted-model', current)
    expect(imported.profiles[0]).toMatchObject({ id: saved.id, model: saved.model, apiKey: 'new-key' })
    expect(() => sharing.applyProfileImport(current, imported, 'add')).toThrow('仅支持更新预置配置')
    expect(current.profiles[0].apiKey).toBe('local-key')
  })
})
