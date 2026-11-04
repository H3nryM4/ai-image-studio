import { createDefaultOpenAIProfile } from './apiProfiles'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('preset config policy', () => {
  it('exposes every current preset profile in preset-only mode', async () => {
    vi.stubEnv('VITE_SHOW_PRESET_CONFIG_ONLY', 'true')
    const { createDefaultOpenAIProfile } = await import('./apiProfiles')
    const policy = await import('./presetConfig')
    policy.setPresetConfig({
      customConnections: [],
      profiles: [
        createDefaultOpenAIProfile({ id: 'preset-a', isDefault: true }),
        createDefaultOpenAIProfile({ id: 'preset-b' }),
      ],
    })

    expect(policy.isPresetConfigOnlyEnabled()).toBe(true)
    expect(policy.getPresetProfileIds()).toEqual(new Set(['preset-a', 'preset-b']))
    expect(policy.getDefaultPresetProfileId()).toBe('preset-a')
  })

  it('exposes an optional Markdown description for preset profiles', async () => {
    const { createDefaultOpenAIProfile } = await import('./apiProfiles')
    const policy = await import('./presetConfig')
    policy.setPresetConfig({
      customConnections: [],
      profiles: [createDefaultOpenAIProfile({ id: 'preset-a', description: '使用 [说明](https://example.com)' })],
    })

    expect(policy.getPresetProfileDescription('preset-a')).toBe('使用 [说明](https://example.com)')
    expect(policy.getPresetProfileDescription('missing')).toBeUndefined()
  })

  it('accepts the legacy preset-only environment variable', async () => {
    vi.stubEnv('VITE_SHOW_DEFAULT_CONFIG_ONLY', 'true')
    const { createDefaultOpenAIProfile } = await import('./apiProfiles')
    const policy = await import('./presetConfig')
    policy.setPresetConfig({ customConnections: [], profiles: [createDefaultOpenAIProfile()] })

    expect(policy.isPresetConfigOnlyEnabled()).toBe(true)
  })

  it('locks preset parameters and connections except API keys without preventing profile deletion', async () => {
    vi.stubEnv('VITE_LOCK_PRESET_CONFIG_PARAMS', 'true')
    const { createDefaultOpenAIProfile, normalizeSettings } = await import('./apiProfiles')
    const policy = await import('./presetConfig')
    const source = createDefaultOpenAIProfile({
      id: 'preset-a',
      isDefault: true,
      connectionId: 'preset-connection',
      baseUrl: 'https://preset.example.com/v1',
      apiKey: 'deployed-key',
      model: 'preset-model',
    })
    const user = createDefaultOpenAIProfile({ id: 'user-profile', model: 'user-model' })
    const connection = { id: 'preset-connection', name: 'Preset Connection', submit: { path: 'generate' } }
    const removed = createDefaultOpenAIProfile({ id: 'preset-removed', connectionId: connection.id })
    policy.setPresetConfig({ customConnections: [connection], profiles: [source, removed] })

    const enforced = policy.enforcePresetConfigPolicy(normalizeSettings({
      customConnections: [{ ...connection, submit: { path: 'local/generate' } }],
      profiles: [{ ...source, baseUrl: 'https://local.example.com/v1', apiKey: 'user-key', model: 'local-model' }, user],
      activeProfileId: user.id,
    }))

    expect(enforced.profiles[0]).toMatchObject({
      id: source.id,
      baseUrl: 'https://preset.example.com/v1',
      apiKey: 'user-key',
      model: 'preset-model',
    })
    expect(enforced.profiles[1]).toMatchObject({ id: user.id, model: 'user-model' })
    expect(enforced.profiles.some((profile) => profile.id === removed.id)).toBe(false)
    expect(enforced.customConnections[0]).toEqual(connection)
    expect(enforced.activeProfileId).toBe(user.id)
    expect(policy.isPresetConfigDeletionPrevented()).toBe(false)
    expect(policy.isPresetConnectionLocked(connection.id)).toBe(true)
    expect(policy.isPresetConnectionDeletionPrevented(connection.id, enforced.profiles)).toBe(true)
    expect(policy.isPresetConnectionDeletionPrevented('user-connection', enforced.profiles)).toBe(false)
  })

  it('allows removed presets to stay deleted by default', async () => {
    const { createDefaultOpenAIProfile, normalizeSettings } = await import('./apiProfiles')
    const policy = await import('./presetConfig')
    const presetA = createDefaultOpenAIProfile({ id: 'preset-a', isDefault: true })
    const presetB = createDefaultOpenAIProfile({ id: 'preset-b' })
    const user = createDefaultOpenAIProfile({ id: 'user-profile' })
    policy.setPresetConfig({ customConnections: [], profiles: [presetA, presetB] })

    const enforced = policy.enforcePresetConfigPolicy(normalizeSettings({
      profiles: [presetA, user],
      activeProfileId: user.id,
    }))

    expect(policy.isPresetProfile(presetA.id)).toBe(true)
    expect(policy.isPresetProfile(presetB.id)).toBe(true)
    expect(enforced.profiles.map((profile) => profile.id)).toEqual(['preset-a', 'user-profile'])
  })

  it('preserves the user order when the default preset is not first', async () => {
    const { createDefaultOpenAIProfile, normalizeSettings } = await import('./apiProfiles')
    const policy = await import('./presetConfig')
    const presetA = createDefaultOpenAIProfile({ id: 'preset-a', isDefault: true })
    const presetB = createDefaultOpenAIProfile({ id: 'preset-b' })
    const user = createDefaultOpenAIProfile({ id: 'user-profile' })
    policy.setPresetConfig({ customConnections: [], profiles: [presetA, presetB] })

    const enforced = policy.enforcePresetConfigPolicy(normalizeSettings({
      profiles: [presetB, user, presetA],
      activeProfileId: user.id,
    }))

    expect(enforced.profiles.map((profile) => profile.id)).toEqual(['preset-b', 'user-profile', 'preset-a'])
    expect(enforced.profiles[2].isDefault).toBe(true)
  })

  it('restores removed presets when deletion is prevented', async () => {
    vi.stubEnv('VITE_PREVENT_PRESET_CONFIG_DELETION', 'true')
    const { createDefaultOpenAIProfile, normalizeSettings } = await import('./apiProfiles')
    const policy = await import('./presetConfig')
    const connection = { id: 'preset-connection', name: 'Preset Connection', submit: { path: 'generate' } }
    const presetA = createDefaultOpenAIProfile({ id: 'preset-a', isDefault: true })
    const presetB = createDefaultOpenAIProfile({ id: 'preset-b' })
    const user = createDefaultOpenAIProfile({ id: 'user-profile' })
    policy.setPresetConfig({ customConnections: [connection], profiles: [presetA, presetB] })

    const enforced = policy.enforcePresetConfigPolicy(normalizeSettings({
      customConnections: [{ ...connection, submit: { path: 'local/generate' } }],
      profiles: [presetA, user],
      activeProfileId: user.id,
    }))

    expect(policy.isPresetConfigDeletionPrevented()).toBe(true)
    expect(policy.isPresetConfigParamsLocked()).toBe(false)
    expect(policy.isPresetConnectionLocked(connection.id)).toBe(false)
    expect(policy.isPresetConnectionDeletionPrevented(connection.id, enforced.profiles)).toBe(true)
    expect(enforced.customConnections[0].submit.path).toBe('local/generate')
    expect(enforced.profiles.map((profile) => profile.id)).toEqual(['preset-a', 'user-profile', 'preset-b'])
  })

  it('preserves dismissed connection IDs while deletion is prevented', async () => {
    vi.stubEnv('VITE_PREVENT_PRESET_CONFIG_DELETION', 'true')
    const { createDefaultOpenAIProfile, DEFAULT_SETTINGS, normalizeSettings } = await import('./apiProfiles')
    const policy = await import('./presetConfig')
    const { useStore } = await import('../store')
    const connection = { id: 'preset-connection', name: 'Preset Connection', submit: { path: 'generate' } }
    const profile = createDefaultOpenAIProfile({ id: 'preset-profile', connectionId: connection.id })
    const preset = { customConnections: [connection], profiles: [profile] }
    policy.setPresetConfig(preset)
    useStore.setState({
      settings: normalizeSettings({ ...DEFAULT_SETTINGS, customConnections: [], profiles: [] }),
      dismissedPresetConnectionIds: [connection.id],
    })

    await useStore.getState().setPresetImportedSettings(preset)
    useStore.getState().setSettings({ profiles: [profile] })

    const state = useStore.getState()
    expect(state.settings.customConnections).toEqual([expect.objectContaining({ id: connection.id })])
    expect(state.dismissedPresetConnectionIds).toEqual([connection.id])
  })

  it('always prevents preset connection deletion in preset-only mode', async () => {
    vi.stubEnv('VITE_SHOW_PRESET_CONFIG_ONLY', 'true')
    const { createDefaultOpenAIProfile } = await import('./apiProfiles')
    const policy = await import('./presetConfig')
    const connection = { id: 'preset-connection', name: 'Preset Connection', submit: { path: 'generate' } }
    const profile = createDefaultOpenAIProfile({ id: 'preset-profile', connectionId: 'openai-images' })
    policy.setPresetConfig({ customConnections: [connection], profiles: [profile] })

    expect(policy.isPresetConnectionDeletionPrevented(connection.id, [])).toBe(true)
  })

  it('locks preset parameters without restoring their deployment order', async () => {
    vi.stubEnv('VITE_LOCK_PRESET_CONFIG_PARAMS', 'true')
    const { createDefaultOpenAIProfile, normalizeSettings } = await import('./apiProfiles')
    const policy = await import('./presetConfig')
    const presetA = createDefaultOpenAIProfile({ id: 'preset-a', isDefault: true, model: 'preset-a-model' })
    const presetB = createDefaultOpenAIProfile({ id: 'preset-b', model: 'preset-b-model' })
    const user = createDefaultOpenAIProfile({ id: 'user-profile' })
    policy.setPresetConfig({ customConnections: [], profiles: [presetA, presetB] })

    const enforced = policy.enforcePresetConfigPolicy(normalizeSettings({
      profiles: [presetA, user, { ...presetB, model: 'local-model' }],
      activeProfileId: user.id,
    }))

    expect(enforced.profiles.map((profile) => profile.id)).toEqual(['preset-a', 'user-profile', 'preset-b'])
    expect(enforced.profiles[2].model).toBe('preset-b-model')
  })

  it('restores a dismissed connection while a current locked preset profile references it', async () => {
    vi.stubEnv('VITE_LOCK_PRESET_CONFIG_PARAMS', 'true')
    const { createDefaultOpenAIProfile, normalizeSettings } = await import('./apiProfiles')
    const policy = await import('./presetConfig')
    const connection = { id: 'preset-connection', name: 'Preset Connection', submit: { path: 'generate' } }
    const source = createDefaultOpenAIProfile({
      id: 'preset-profile',
      connectionId: connection.id,
      model: 'preset-model',
    })
    policy.setPresetConfig({ customConnections: [connection], profiles: [source] })
    const deleted = normalizeSettings({
      customConnections: [],
      profiles: [{ ...source, connectionId: 'openai-images', model: 'local-openai-model' }],
    })

    expect(policy.isPresetConnectionDeletionPrevented(connection.id, [source])).toBe(true)

    const enforced = policy.enforcePresetConfigPolicy(deleted, { dismissedPresetConnectionIds: [] })

    expect(enforced.customConnections).toEqual([connection])
    expect(enforced.profiles[0]).toMatchObject({
      id: source.id,
      connectionId: connection.id,
      model: 'preset-model',
    })
  })

  it('allows a dismissed connection to stay deleted after its only preset profile is deleted', async () => {
    vi.stubEnv('VITE_LOCK_PRESET_CONFIG_PARAMS', 'true')
    const { createDefaultOpenAIProfile } = await import('./apiProfiles')
    const policy = await import('./presetConfig')
    const connection = { id: 'preset-connection', name: 'Preset Connection', submit: { path: 'generate' } }
    const source = createDefaultOpenAIProfile({ id: 'preset-profile', connectionId: connection.id })
    const user = createDefaultOpenAIProfile({ id: 'user-profile' })
    policy.setPresetConfig({ customConnections: [connection], profiles: [source] })

    expect(policy.isPresetConnectionDeletionPrevented(connection.id, [])).toBe(false)

    const merged = (await import('./apiProfiles')).mergePresetImportedSettings({
      customConnections: [],
      profiles: [user],
      activeProfileId: user.id,
    }, { customConnections: [connection], profiles: [source] }, {
      lockPresetParams: true,
      dismissedPresetProfileIds: [source.id],
      dismissedPresetConnectionIds: [connection.id],
    }).settings
    const reloaded = policy.enforcePresetConfigPolicy(merged, {
      dismissedPresetConnectionIds: [connection.id],
    })

    expect(reloaded.customConnections).toEqual([])
    expect(reloaded.profiles.map((profile) => profile.id)).toEqual([user.id])
  })

  it('keeps a shared connection protected while another current locked preset profile references it', async () => {
    vi.stubEnv('VITE_LOCK_PRESET_CONFIG_PARAMS', 'true')
    const { createDefaultOpenAIProfile } = await import('./apiProfiles')
    const policy = await import('./presetConfig')
    const connection = { id: 'preset-connection', name: 'Preset Connection', submit: { path: 'generate' } }
    const profiles = [
      createDefaultOpenAIProfile({ id: 'preset-a', connectionId: connection.id, isDefault: true }),
      createDefaultOpenAIProfile({ id: 'preset-b', connectionId: connection.id }),
    ]
    policy.setPresetConfig({ customConnections: [connection], profiles })

    expect(policy.isPresetConnectionDeletionPrevented(connection.id, [profiles[1]])).toBe(true)
  })

  it('uses the default preset URL and leaves the fallback empty when no preset exists', async () => {
    const { createDefaultOpenAIProfile } = await import('./apiProfiles')
    const policy = await import('./presetConfig')
    policy.setPresetConfig({
      customConnections: [],
      profiles: [createDefaultOpenAIProfile({ id: 'openai-preset', baseUrl: 'https://preset.example.com/v1' })],
    })
    expect(policy.getDefaultPresetBaseUrl()).toBe('https://preset.example.com/v1')

    policy.setPresetConfig({
      customConnections: [],
      profiles: [],
    })
    expect(policy.getDefaultPresetBaseUrl()).toBe('')
  })
})
