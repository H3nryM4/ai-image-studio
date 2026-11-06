import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_IMAGES_MODEL,
  DEFAULT_OPENAI_PROFILE_ID,
  DEFAULT_SETTINGS,
  createDefaultOpenAIProfile,
  getApiConnectionLabel,
  getActiveApiProfile,
  getCustomConnectionDefinition,
  findEquivalentApiProfile,
  importCustomConnectionDefinitionFromJson,
  importCustomConnectionSettingsFromJson,
  getDefaultApiProfileId,
  mergePresetImportedSettings as mergeDefaultImportedSettings,
  mergeImportedSettings,
  normalizeApiProfile,
  normalizeSettings,
  resolveApiProfileModel,
  splitModelList,
  switchApiProfileConnection,
  validateApiProfile,
} from './apiProfiles'
import { CUSTOM_CONNECTION_LLM_PROMPT, DEFAULT_CUSTOM_CONNECTION_JSON } from './settingsCustomConnection'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('validateApiProfile', () => {
  it.each(['missing-connection', 'custom:missing'])('retains unavailable connection details for %s while disabling requests and rejecting imports', (connection) => {
    const saved = createDefaultOpenAIProfile({ connectionId: connection, baseUrl: 'https://old.example.com/', apiKey: 'old-key', model: 'old-model' })
    const settings = normalizeSettings({ profiles: [saved], activeProfileId: saved.id })

    expect(settings.profiles[0]).toMatchObject({ connectionId: connection, baseUrl: saved.baseUrl, apiKey: saved.apiKey, model: saved.model })
    expect(getApiConnectionLabel(settings, connection)).toBe('接入已失效')
    expect(getCustomConnectionDefinition(settings, connection)).toBeNull()
    expect(validateApiProfile(settings.profiles[0], settings)).toBe('接入方式已不可用，请重新选择')
    expect(() => importCustomConnectionSettingsFromJson(JSON.stringify({ profiles: [saved] }))).toThrow('不存在的自定义服务商')
  })

  it('allows empty API URL when API proxy is enabled and available', () => {
    vi.stubEnv('VITE_API_PROXY_AVAILABLE', 'true')

    expect(validateApiProfile(createDefaultOpenAIProfile({
      baseUrl: '',
      apiKey: 'test-key',
      apiProxy: true,
    }))).toBeNull()
  })

  it('still requires API URL when API proxy is unavailable', () => {
    expect(validateApiProfile(createDefaultOpenAIProfile({
      baseUrl: '',
      apiKey: 'test-key',
      apiProxy: true,
    }))).toBe('缺少 API URL')
  })
})

describe('normalizeApiProfile', () => {
  it('uses the default image model and preserves the external model field', () => {
    expect(normalizeApiProfile({ connectionId: 'openai-images' }).model).toBe(DEFAULT_IMAGES_MODEL)
    expect(normalizeSettings({ profiles: [{ connectionId: 'openai-images' }] }).profiles[0].model).toBe(DEFAULT_IMAGES_MODEL)
    expect(normalizeApiProfile({ connectionId: 'openai-images', model: 'vendor/image' }).model).toBe('vendor/image')
    expect(normalizeApiProfile({ model: 'legacy' }).model).toBe('legacy')
  })

  it('uses connection defaults and preserves explicit transparent background methods', () => {
    expect(normalizeApiProfile({}).transparentBackgroundMethod).toBe('api')
    expect(normalizeApiProfile({ transparentBackgroundMethod: 'local' }).transparentBackgroundMethod).toBe('local')
    expect(normalizeApiProfile({}, { transparentBackgroundMethod: 'local' }).transparentBackgroundMethod).toBe('local')
    expect(normalizeApiProfile({ transparentBackgroundMethod: 'invalid' }).transparentBackgroundMethod).toBe('api')
    expect(normalizeApiProfile({ connectionId: 'openai-images' }).transparentBackgroundMethod).toBe('api')
    expect(normalizeApiProfile({ connectionId: 'openai-images', transparentBackgroundMethod: 'api' }).transparentBackgroundMethod).toBe('api')
    expect(normalizeApiProfile({ connectionId: 'openai-images', transparentBackgroundMethod: 'invalid' }).transparentBackgroundMethod).toBe('api')
  })
})

describe('normalizeSettings', () => {
  it('falls back to creating a new task for unknown retry modes', () => {
    expect(normalizeSettings({}).retryMode).toBe('new')
    expect(normalizeSettings({ retryMode: 'bogus' }).retryMode).toBe('new')
    expect(normalizeSettings({ retryMode: 'overwriteFailed' }).retryMode).toBe('overwriteFailed')
  })

  it('only keeps overwriting any task while successful tasks show the retry button', () => {
    expect(normalizeSettings({ retryMode: 'overwriteAll' }).retryMode).toBe('overwriteFailed')
    expect(normalizeSettings({ retryMode: 'overwriteAll', alwaysShowRetryButton: true }).retryMode).toBe('overwriteAll')
  })

  it('preserves a non-empty profile description and removes an empty one', () => {
    const settings = normalizeSettings({
      profiles: [
        createDefaultOpenAIProfile({ id: 'described', description: '支持 **Markdown**' }),
        createDefaultOpenAIProfile({ id: 'empty', description: '   ' }),
      ],
    })

    expect(settings.profiles[0].description).toBe('支持 **Markdown**')
    expect(settings.profiles[1].description).toBeUndefined()
  })
})

describe('default API URL env', () => {
  it('applies shared URL params from VITE_DEFAULT_API_URL to the default profile', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_DEFAULT_API_URL', 'https://app.example.com/?apiUrl=https%3A%2F%2Fapi.example.com&connectionId=openai-images&model=test-image-model&profileName=URL%20Profile&codexCli=true&streamImages=true&streamPartialImages=3&transparentBackgroundMethod=local')

    const { DEFAULT_SETTINGS, createDefaultOpenAIProfile } = await import('./apiProfiles')

    expect(createDefaultOpenAIProfile()).toMatchObject({
      id: DEFAULT_OPENAI_PROFILE_ID,
      name: 'URL Profile',
      baseUrl: 'https://api.example.com',
      model: 'test-image-model',
      connectionId: 'openai-images',
      codexCli: true,
      streamImages: true,
      streamPartialImages: 3,
      transparentBackgroundMethod: 'local',
    })
    expect(DEFAULT_SETTINGS.profiles[0]).toMatchObject({
      id: DEFAULT_OPENAI_PROFILE_ID,
      name: 'URL Profile',
      baseUrl: 'https://api.example.com',
      model: 'test-image-model',
      connectionId: 'openai-images',
      codexCli: true,
      streamImages: true,
      streamPartialImages: 3,
      transparentBackgroundMethod: 'local',
    })
  })

  it('keeps settings URLs out of the default API base URL', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_DEFAULT_API_URL', 'https://example.com/?settings={}')

    const { DEFAULT_SETTINGS } = await import('./apiProfiles')

    expect(DEFAULT_SETTINGS.profiles[0].baseUrl).toBe('')
    expect(DEFAULT_SETTINGS.profiles[0].baseUrl).toBe('')
  })

  it('enables preset-only mode for an embedded config', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_DEFAULT_API_URL', 'embedded-config:e30=')
    vi.stubEnv('VITE_SHOW_PRESET_CONFIG_ONLY', 'true')

    const { createDefaultOpenAIProfile } = await import('./apiProfiles')
    const { isPresetConfigOnlyEnabled, setPresetConfig } = await import('./presetConfig')
    setPresetConfig({ customConnections: [], profiles: [createDefaultOpenAIProfile()] })

    expect(isPresetConfigOnlyEnabled()).toBe(true)
  })
})

describe('mergeImportedSettings', () => {
  it('replaces the default OpenAI profile with an imported profile when current settings are untouched', () => {
    const merged = mergeImportedSettings(DEFAULT_SETTINGS, { profiles: [createDefaultOpenAIProfile({ baseUrl: 'https://api.example.com/v1', apiKey: 'imported-key', model: 'imported-model', timeout: 120, connectionId: 'openai-images', codexCli: true, apiProxy: true })] })

    expect(merged.profiles).toHaveLength(1)
    expect(merged.activeProfileId).toBe(DEFAULT_OPENAI_PROFILE_ID)
    expect(merged.profiles[0]).toMatchObject({
      id: DEFAULT_OPENAI_PROFILE_ID,
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'imported-key',
      model: 'imported-model',
      timeout: 120,
      connectionId: 'openai-images',
      codexCli: true,
      apiProxy: true,
    })
  })

  it('does not replace a default profile whose transparent background method was changed', () => {
    const current = normalizeSettings({
      ...DEFAULT_SETTINGS,
      profiles: DEFAULT_SETTINGS.profiles.map((profile) => ({ ...profile, transparentBackgroundMethod: 'local' })),
    })

    const merged = mergeImportedSettings(current, { profiles: [createDefaultOpenAIProfile({ id: 'imported-profile', baseUrl: 'https://api.example.com/v1', apiKey: 'imported-key', model: 'imported-model' })] })

    expect(merged.profiles.find((profile) => profile.id === DEFAULT_OPENAI_PROFILE_ID)?.transparentBackgroundMethod).toBe('local')
  })

  it('replaces the default connection list with imported profiles when current settings are untouched', () => {
    const merged = mergeImportedSettings(DEFAULT_SETTINGS, {
      profiles: [
        {
          id: 'imported-openai',
          name: 'Imported OpenAI',
          baseUrl: 'https://api.example.com/v1',
          apiKey: 'openai-key',
          model: DEFAULT_IMAGES_MODEL,
          timeout: 300,
          connectionId: 'openai-images',
          codexCli: false,
          apiProxy: false,
        },
        {
          id: 'imported-alternate',
          name: 'Imported alternate',
          baseUrl: 'https://alternate.example.com/v1',
          apiKey: 'alternate-key',
          model: DEFAULT_IMAGES_MODEL,
          timeout: 300,
          connectionId: 'openai-images',
          codexCli: false,
          apiProxy: false,
        },
      ],
      activeProfileId: 'imported-alternate',
    })

    expect(merged.profiles.map((profile) => profile.id)).toEqual(['imported-openai', 'imported-alternate'])
    expect(merged.activeProfileId).toBe('imported-alternate')
  })

  it('preserves different imported profile IDs with matching connections', () => {
    const merged = mergeImportedSettings(DEFAULT_SETTINGS, {
      profiles: [
        {
          id: 'imported-openai-a',
          name: 'Imported OpenAI A',
          baseUrl: 'https://api.example.com/v1',
          apiKey: 'openai-key',
          model: DEFAULT_IMAGES_MODEL,
          timeout: 300,
          connectionId: 'openai-images',
          codexCli: false,
          apiProxy: false,
        },
        {
          id: 'imported-openai-b',
          name: 'Imported OpenAI B',
          baseUrl: 'https://api.example.com/v1/',
          apiKey: 'openai-key',
          model: DEFAULT_IMAGES_MODEL,
          timeout: 600,
          connectionId: 'openai-images',
          codexCli: true,
          apiProxy: true,
        },
      ],
      activeProfileId: 'imported-openai-b',
    })

    expect(merged.profiles.map((profile) => profile.id)).toEqual(['imported-openai-a', 'imported-openai-b'])
    expect(merged.activeProfileId).toBe('imported-openai-b')
  })

  it('appends an imported profile as a new profile when current settings are customized', () => {
    const current = mergeImportedSettings(DEFAULT_SETTINGS, { profiles: [createDefaultOpenAIProfile({ baseUrl: 'https://current.example.com/v1', apiKey: 'current-key', model: 'current-model' })] })
    const merged = mergeImportedSettings(current, { profiles: [createDefaultOpenAIProfile({ id: 'imported-profile', baseUrl: 'https://imported.example.com/v1', apiKey: 'imported-key', model: 'imported-model' })] })

    expect(merged.profiles).toHaveLength(2)
    expect(merged.activeProfileId).toBe(DEFAULT_OPENAI_PROFILE_ID)
    expect(merged.profiles[0]).toMatchObject({ apiKey: 'current-key', model: 'current-model' })
    expect(merged.profiles[1]).toMatchObject({
      connectionId: 'openai-images',
      baseUrl: 'https://imported.example.com/v1',
      apiKey: 'imported-key',
      model: 'imported-model',
    })
    expect(merged.profiles[1].id).not.toBe(DEFAULT_OPENAI_PROFILE_ID)
  })

  it('appends imported profiles as new profiles when current settings are customized', () => {
    const current = mergeImportedSettings(DEFAULT_SETTINGS, { profiles: [createDefaultOpenAIProfile({ baseUrl: 'https://current.example.com/v1', apiKey: 'current-key', model: 'current-model' })] })
    const merged = mergeImportedSettings(current, {
      profiles: [
        {
          id: 'imported-openai',
          name: 'Imported OpenAI',
          baseUrl: 'https://imported.example.com/v1',
          apiKey: 'imported-key',
          model: DEFAULT_IMAGES_MODEL,
          timeout: 300,
          connectionId: 'openai-images',
          codexCli: false,
          apiProxy: false,
        },
        {
          id: 'imported-alternate',
          name: 'Imported alternate',
          baseUrl: 'https://alternate.example.com/v1',
          apiKey: 'alternate-key',
          model: DEFAULT_IMAGES_MODEL,
          timeout: 300,
          connectionId: 'openai-images',
          codexCli: false,
          apiProxy: false,
        },
      ],
      activeProfileId: 'imported-alternate',
    })

    expect(merged.profiles).toHaveLength(3)
    expect(merged.activeProfileId).toBe(DEFAULT_OPENAI_PROFILE_ID)
    expect(merged.profiles[0]).toMatchObject({ apiKey: 'current-key', model: 'current-model' })
    expect(merged.profiles[1]).toMatchObject({ name: 'Imported OpenAI', connectionId: 'openai-images', apiKey: 'imported-key' })
    expect(merged.profiles[2]).toMatchObject({ name: 'Imported alternate', connectionId: 'openai-images', apiKey: 'alternate-key' })
    expect(new Set(merged.profiles.map((profile) => profile.id)).size).toBe(3)
  })

  it('preserves a new ID even when its connection matches an existing profile', () => {
    const current = mergeImportedSettings(DEFAULT_SETTINGS, { profiles: [createDefaultOpenAIProfile({ baseUrl: 'https://current.example.com/v1', apiKey: 'current-key', model: 'current-model' })] })
    const merged = mergeImportedSettings(current, {
      profiles: [
        {
          id: 'duplicate-openai',
          name: 'Duplicate OpenAI',
          baseUrl: 'https://current.example.com/v1/',
          apiKey: 'current-key',
          model: 'current-model',
          timeout: 600,
          connectionId: 'openai-images',
          codexCli: true,
          apiProxy: true,
        },
        {
          id: 'new-alternate',
          name: 'New alternate',
          baseUrl: 'https://alternate.example.com/v1',
          apiKey: 'alternate-key',
          model: DEFAULT_IMAGES_MODEL,
          timeout: 300,
          connectionId: 'openai-images',
          codexCli: false,
          apiProxy: false,
        },
      ],
    })

    expect(merged.profiles).toHaveLength(3)
    expect(merged.profiles[0]).toMatchObject({ apiKey: 'current-key', model: 'current-model' })
    expect(merged.profiles[1]).toMatchObject({ id: 'duplicate-openai', apiKey: 'current-key', model: 'current-model' })
    expect(merged.profiles[2]).toMatchObject({ connectionId: 'openai-images', apiKey: 'alternate-key', model: DEFAULT_IMAGES_MODEL })
  })

  it('preserves an imported custom profile ID when its connection matches an existing profile', () => {
    const current = mergeImportedSettings(DEFAULT_SETTINGS, {
      customConnections: [{
        id: 'custom-json',
        name: 'Custom JSON',
        submit: {
          path: 'images/generations',
          method: 'POST',
          contentType: 'json',
          body: { model: '$profile.model', prompt: '$prompt' },
          result: { imageUrlPaths: ['data.*.url'], b64JsonPaths: [] },
        },
      }],
      profiles: [{
        id: 'existing-custom',
        name: 'Existing Custom',
        connectionId: 'custom-json',
        baseUrl: 'https://custom.example.com/v1',
        apiKey: 'existing-key',
        model: 'custom-model',
        timeout: 300,
        codexCli: false,
        apiProxy: false,
      }],
      activeProfileId: 'existing-custom',
    })
    const imported = normalizeSettings({
      customConnections: [{
        id: 'custom-json',
        name: 'Custom JSON',
        submit: {
          path: 'images/generations',
          method: 'POST',
          contentType: 'json',
          body: { model: '$profile.model', prompt: '$prompt' },
          result: { imageUrlPaths: ['data.*.url'], b64JsonPaths: [] },
        },
      }],
      profiles: [{
        id: 'imported-custom',
        name: 'Imported Custom',
        connectionId: 'custom-json',
        baseUrl: 'https://custom.example.com/v1',
        apiKey: '',
        model: 'custom-model',
        timeout: 300,
        codexCli: false,
        apiProxy: false,
      }],
    })
    const merged = mergeImportedSettings(current, imported)
    const match = findEquivalentApiProfile(merged, imported.profiles[0], imported.customConnections)

    expect(merged.profiles).toHaveLength(2)
    expect(match?.id).toBe('imported-custom')
  })

  it('does not replace existing custom connections when only the default profile remains', () => {
    const current = normalizeSettings({
      ...DEFAULT_SETTINGS,
      customConnections: [{
        id: 'custom-existing',
        name: 'Existing Connection',
        submit: { path: 'images/generations' },
      }],
    })
    const merged = mergeImportedSettings(current, {
      customConnections: [{
        id: 'custom-imported',
        name: 'Imported Connection',
        submit: { path: 'images/generations' },
      }],
      profiles: [{
        id: 'imported-custom',
        name: 'Imported Custom',
        connectionId: 'custom-imported',
        baseUrl: 'https://custom.example.com/v1',
        apiKey: '',
        model: 'custom-model',
        timeout: 300,
        codexCli: false,
        apiProxy: false,
      }],
    })

    expect(merged.customConnections.map((connection) => connection.id)).toEqual(['custom-existing', 'custom-imported'])
    expect(merged.profiles).toHaveLength(2)
  })

  it('appends imported custom connections and keeps imported custom profile references', () => {
    const current = mergeImportedSettings(DEFAULT_SETTINGS, { profiles: [createDefaultOpenAIProfile({ baseUrl: 'https://current.example.com/v1', apiKey: 'current-key', model: 'current-model' })] })
    const merged = mergeImportedSettings(current, {
      customConnections: [{
        id: 'custom-json',
        name: 'Custom JSON',
        submit: {
          path: 'images/generations',
          method: 'POST',
          contentType: 'json',
          body: { model: '$profile.model', prompt: '$prompt' },
          result: { imageUrlPaths: ['data.*.url'], b64JsonPaths: [] },
        },
      }],
      profiles: [{
        id: 'imported-custom',
        name: 'Imported Custom',
        connectionId: 'custom-json',
        baseUrl: 'https://custom.example.com/v1',
        apiKey: 'custom-key',
        model: 'custom-model',
        timeout: 300,
        codexCli: false,
        apiProxy: false,
      }],
    })

    expect(merged.customConnections).toHaveLength(1)
    expect(merged.customConnections[0]).toMatchObject({ id: 'custom-json', name: 'Custom JSON' })
    expect(merged.profiles).toHaveLength(2)
    expect(merged.profiles[1]).toMatchObject({
      name: 'Imported Custom',
      connectionId: 'custom-json',
      apiKey: 'custom-key',
      model: 'custom-model',
    })
  })

  it('strips the default preset marker from ordinary imports', () => {
    const merged = mergeImportedSettings(DEFAULT_SETTINGS, {
      customConnections: [{
        id: 'import-connection',
        name: 'Imported Connection',
        submit: { path: 'generate' },
      }],
      profiles: [{
        ...createDefaultOpenAIProfile(),
        id: 'import-profile',
        isDefault: true,
        connectionId: 'import-connection',
      }],
      activeProfileId: 'import-profile',
    })

    expect(merged.profiles[0].isDefault).toBeUndefined()
  })

  it('preserves distinct profile IDs in trusted backup imports', () => {
    const profileA = createDefaultOpenAIProfile({ id: 'backup-profile-a', apiKey: 'same-key' })
    const profileB = createDefaultOpenAIProfile({ id: 'backup-profile-b', apiKey: 'same-key' })
    const merged = mergeImportedSettings(DEFAULT_SETTINGS, {
      ...DEFAULT_SETTINGS,
      profiles: [profileA, profileB],
      activeProfileId: profileA.id,
    }, { preserveInternalIds: true })

    expect(merged.profiles.map((profile) => profile.id)).toEqual([profileA.id, profileB.id])
  })

  it('strips the default preset marker from trusted backup imports', () => {
    const profile = createDefaultOpenAIProfile({ id: 'backup-profile', isDefault: true })
    const merged = mergeImportedSettings(DEFAULT_SETTINGS, {
      ...DEFAULT_SETTINGS,
      profiles: [profile],
      activeProfileId: profile.id,
    }, { preserveInternalIds: true })

    expect(merged.profiles[0]).toMatchObject({ id: profile.id, isDefault: undefined })
  })

  it('preserves distinct connection and profile IDs with identical content', () => {
    const connectionA = { id: 'connection-a', name: 'Same Connection', submit: { path: 'generate' } }
    const connectionB = { id: 'connection-b', name: 'Same Connection', submit: { path: 'generate' } }
    const profileA = createDefaultOpenAIProfile({ id: 'profile-a', connectionId: connectionA.id, apiKey: 'same-key' })
    const profileB = createDefaultOpenAIProfile({ id: 'profile-b', connectionId: connectionB.id, apiKey: 'same-key' })
    const merged = mergeImportedSettings(DEFAULT_SETTINGS, {
      customConnections: [connectionA, connectionB],
      profiles: [profileA, profileB],
      activeProfileId: profileA.id,
    })

    expect(merged.customConnections.map((connection) => connection.id)).toEqual([connectionA.id, connectionB.id])
    expect(merged.profiles.map((profile) => profile.id)).toEqual([profileA.id, profileB.id])
    expect(merged.profiles.map((profile) => profile.connectionId)).toEqual([connectionA.id, connectionB.id])
  })
})

describe('mergePresetImportedSettings', () => {
  const createConfig = (model: string, path: string) => ({
    customConnections: [{
      id: 'source-connection',
      name: 'Deployed Connection',
      submit: { path },
    }],
    profiles: [{
      id: 'source-profile',
      name: 'Deployed Profile',
      connectionId: 'source-connection',
      baseUrl: 'https://api.example.com/v1',
      apiKey: '',
      model,
      timeout: 300,
      codexCli: false,
      apiProxy: false,
    }],
  })

  it('applies each deployment change once and then keeps later local edits', () => {
    const initial = mergeDefaultImportedSettings(DEFAULT_SETTINGS, createConfig('model-v1', 'old/generate'))
    const previous = initial.settings
    previous.profiles[0].baseUrl = 'https://local.example.com/v1'
    previous.profiles[0].model = 'local-model'
    previous.profiles[0].timeout = 900
    const current = normalizeSettings({
      ...previous,
      profiles: [
        ...previous.profiles,
        createDefaultOpenAIProfile({ id: 'user-profile', name: 'User Profile' }),
      ],
    })
    const nextConfig = createConfig('model-v2', 'v2/generate')
    nextConfig.profiles[0].baseUrl = 'https://new.example.com/v1'
    nextConfig.profiles[0].timeout = 600
    const result = mergeDefaultImportedSettings(current, nextConfig, { previousPresetConfig: initial.presetConfig })
    const merged = result.settings

    expect(merged.profiles[0]).toMatchObject({
      baseUrl: 'https://new.example.com/v1',
      model: 'model-v2',
      timeout: 600,
    })
    expect(merged.customConnections[0]).toMatchObject({ submit: { path: 'v2/generate' } })

    merged.profiles[0].baseUrl = 'https://later-local.example.com/v1'
    merged.profiles[0].model = 'later-local-model'
    merged.profiles[0].timeout = 1200
    merged.customConnections[0].submit.path = 'later-local/generate'
    const repeated = mergeDefaultImportedSettings(merged, nextConfig, { previousPresetConfig: result.presetConfig })
    const lastConfig = createConfig('model-v3', 'v2/generate')
    lastConfig.customConnections[0].name = 'Updated Connection'
    lastConfig.profiles[0].baseUrl = 'https://new.example.com/v1'
    lastConfig.profiles[0].timeout = 600
    const changedAgain = mergeDefaultImportedSettings(repeated.settings, lastConfig, { previousPresetConfig: repeated.presetConfig })

    expect(merged.activeProfileId).toBe('source-profile')
    expect(merged.profiles.map((profile) => profile.model)).toEqual(['later-local-model', DEFAULT_IMAGES_MODEL])
    expect(merged.profiles[0]).toMatchObject({
      id: 'source-profile',
      baseUrl: 'https://later-local.example.com/v1',
      timeout: 1200,
      isDefault: true,
    })
    expect(merged.customConnections).toHaveLength(1)
    expect(repeated.settings.profiles[0]).toMatchObject({
      baseUrl: 'https://later-local.example.com/v1',
      model: 'later-local-model',
      timeout: 1200,
    })
    expect(repeated.settings.customConnections[0]).toMatchObject({ id: 'source-connection', submit: { path: 'later-local/generate' } })
    expect(changedAgain.settings.profiles[0]).toMatchObject({
      baseUrl: 'https://later-local.example.com/v1',
      model: 'model-v3',
      timeout: 1200,
    })
    expect(changedAgain.settings.customConnections[0]).toMatchObject({
      name: 'Updated Connection',
      submit: { path: 'v2/generate' },
    })
  })

  it('updates matching preset parameters when parameters are locked', () => {
    const current = mergeDefaultImportedSettings(DEFAULT_SETTINGS, createConfig('model-v1', 'old/generate')).settings
    const merged = mergeDefaultImportedSettings(current, createConfig('model-v2', 'v2/generate'), {
      lockPresetParams: true,
    }).settings

    expect(merged.profiles[0]).toMatchObject({ id: 'source-profile', model: 'model-v2' })
    expect(merged.customConnections[0]).toMatchObject({ id: 'source-connection', submit: { path: 'v2/generate' } })
  })

  it('keeps the local API key while updating other locked preset parameters', () => {
    const initialConfig = createConfig('model-v1', 'old/generate')
    initialConfig.profiles[0].apiKey = 'deployed-key'
    const current = mergeDefaultImportedSettings(DEFAULT_SETTINGS, initialConfig, { lockPresetParams: true }).settings
    expect(current.profiles[0].apiKey).toBe('deployed-key')

    current.profiles[0].apiKey = 'user-key'
    const nextConfig = createConfig('model-v2', 'v2/generate')
    nextConfig.profiles[0].apiKey = 'new-deployed-key'
    const updated = mergeDefaultImportedSettings(current, nextConfig, { lockPresetParams: true }).settings
    nextConfig.profiles[0].apiKey = ''
    const cleared = mergeDefaultImportedSettings(updated, nextConfig, { lockPresetParams: true }).settings

    expect(updated.profiles[0]).toMatchObject({ apiKey: 'user-key', model: 'model-v2' })
    expect(cleared.profiles[0].apiKey).toBe('user-key')
  })

  it('preserves the saved profile order while updating locked presets by ID', () => {
    const previousConfig = {
      customConnections: [],
      profiles: [
        createDefaultOpenAIProfile({ id: 'preset-a', model: 'model-a', isDefault: true }),
        createDefaultOpenAIProfile({ id: 'preset-b', model: 'model-b' }),
      ],
    }
    const previous = mergeDefaultImportedSettings(DEFAULT_SETTINGS, previousConfig).settings
    const user = createDefaultOpenAIProfile({ id: 'user-profile' })
    const current = normalizeSettings({
      ...previous,
      profiles: [previous.profiles[0], user, previous.profiles[1]],
    })
    const nextConfig = {
      customConnections: [],
      profiles: [
        createDefaultOpenAIProfile({ id: 'preset-b', model: 'model-b-v2' }),
        createDefaultOpenAIProfile({ id: 'preset-a', model: 'model-a-v2', isDefault: true }),
      ],
    }

    const merged = mergeDefaultImportedSettings(current, nextConfig, { lockPresetParams: true }).settings

    expect(merged.profiles.map((profile) => profile.id)).toEqual(['preset-a', 'user-profile', 'preset-b'])
    expect(merged.profiles.find((profile) => profile.id === 'preset-a')?.model).toBe('model-a-v2')
    expect(merged.profiles.find((profile) => profile.id === 'preset-b')?.model).toBe('model-b-v2')
  })

  it('keeps a user API key without duplicating an unchanged deployed config', () => {
    const config = createConfig('model-v1', 'old/generate')
    const current = mergeDefaultImportedSettings(DEFAULT_SETTINGS, config).settings
    current.profiles[0].apiKey = 'user-key'
    const result = mergeDefaultImportedSettings(current, createConfig('model-v1', 'old/generate'))

    expect(result.settings.profiles).toHaveLength(1)
    expect(result.settings.profiles[0].apiKey).toBe('user-key')
    expect(result.settings.customConnections).toHaveLength(1)
    expect(result.settings.profiles[0].id).toBe('source-profile')
  })

  it('keeps omitted profile fields when the deployed connection type is unchanged', () => {
    const previousConfig = importCustomConnectionSettingsFromJson(JSON.stringify({
      customConnections: [{ id: 'source-connection', name: 'Deployed Connection', submit: { path: 'generate' } }],
      profiles: [{
        id: 'source-profile',
        name: 'Deployed Profile',
        connectionId: 'source-connection',
        baseUrl: 'https://old.example.com/v1',
        apiKey: '',
        model: 'model-v1',
        timeout: 300,
        apiProxy: false,
      }],
    }), [], { deploymentConfig: true })
    const initial = mergeDefaultImportedSettings(DEFAULT_SETTINGS, previousConfig)
    const current = initial.settings
    current.profiles[0] = {
      ...current.profiles[0],
      name: '本地名称',
      baseUrl: 'https://local.example.com/v1',
      apiKey: 'user-key',
      timeout: 900,
      apiProxy: true,
    }
    const nextConfig = importCustomConnectionSettingsFromJson(JSON.stringify({
      customConnections: [{ id: 'source-connection', name: 'Renamed Connection', submit: { path: 'v2/generate' } }],
      profiles: [{
        id: 'source-profile',
        connectionId: 'source-connection',
        baseUrl: 'https://new.example.com/v1',
        model: 'model-v2',
      }],
    }), [], { deploymentConfig: true })

    const merged = mergeDefaultImportedSettings(current, nextConfig, {
      previousPresetConfig: initial.presetConfig,
    }).settings

    expect(merged.profiles[0]).toMatchObject({
      name: '本地名称',
      baseUrl: 'https://new.example.com/v1',
      apiKey: 'user-key',
      model: 'model-v2',
      timeout: 900,
      apiProxy: true,
    })
  })

  it('uses new connection defaults when a deployment changes the connection type', () => {
    const initialConfig = importCustomConnectionSettingsFromJson(JSON.stringify({
      customConnections: [{ id: 'source-connection', name: 'Connection', submit: { path: 'generate' } }],
      profiles: [{
        id: 'source-profile',
        connectionId: 'source-connection',
        baseUrl: 'https://custom.example.com/v1',
        model: 'custom-model',
      }],
    }), [], { deploymentConfig: true })
    const initial = mergeDefaultImportedSettings(DEFAULT_SETTINGS, initialConfig)
    const nextConfig = importCustomConnectionSettingsFromJson(JSON.stringify({
      customConnections: [],
      profiles: [{ id: 'source-profile', connectionId: 'openai-images' }],
    }), [], { deploymentConfig: true })

    const merged = mergeDefaultImportedSettings(initial.settings, nextConfig, {
      previousPresetConfig: initial.presetConfig,
    }).settings

    expect(merged.profiles[0]).toMatchObject({
      connectionId: 'openai-images',
      baseUrl: DEFAULT_SETTINGS.profiles[0].baseUrl,
      model: DEFAULT_IMAGES_MODEL,
    })
  })

  it('does not restore an explicitly empty API key while parameters are unlocked', () => {
    const previousConfig = importCustomConnectionSettingsFromJson(JSON.stringify({
      customConnections: [{ id: 'connectionId', name: 'Connection', submit: { path: 'generate' } }],
      profiles: [{ id: 'profile', connectionId: 'connectionId', apiKey: 'deployed-key', model: 'model-v1' }],
    }))
    const current = mergeDefaultImportedSettings(DEFAULT_SETTINGS, previousConfig).settings
    current.profiles[0].apiKey = 'user-key'
    const nextConfig = importCustomConnectionSettingsFromJson(JSON.stringify({
      customConnections: [{ id: 'connectionId', name: 'Connection', submit: { path: 'generate' } }],
      profiles: [{ id: 'profile', connectionId: 'connectionId', apiKey: '', model: 'model-v1' }],
    }))

    const merged = mergeDefaultImportedSettings(current, nextConfig).settings

    expect(merged.profiles[0].apiKey).toBe('user-key')
  })

  it('updates every deployed entry by ID regardless of array order', () => {
    const previousConfig = importCustomConnectionSettingsFromJson(JSON.stringify({
      customConnections: [
        { id: 'connection-a', name: 'Connection A', submit: { path: 'a' } },
        { id: 'connection-b', name: 'Connection B', submit: { path: 'b' } },
      ],
      profiles: [
        { id: 'profile-a', connectionId: 'connection-a', model: 'model-a', timeout: 111, isDefault: true },
        { id: 'profile-b', connectionId: 'connection-b', model: 'model-b', timeout: 222 },
      ],
    }))
    const current = mergeDefaultImportedSettings(DEFAULT_SETTINGS, previousConfig).settings
    const nextConfig = importCustomConnectionSettingsFromJson(JSON.stringify({
      customConnections: [
        { id: 'connection-b', name: 'Connection B2', submit: { path: 'b-v2' } },
        { id: 'connection-a', name: 'Connection A2', submit: { path: 'a-v2' } },
      ],
      profiles: [
        { id: 'profile-b', connectionId: 'connection-b', model: 'model-b-v2', timeout: 333, isDefault: true },
        { id: 'profile-a', connectionId: 'connection-a', model: 'model-a-v2', timeout: 444 },
      ],
    }))

    const merged = mergeDefaultImportedSettings(current, nextConfig, { lockPresetParams: true }).settings

    expect(merged.profiles.map((profile) => ({ id: profile.id, model: profile.model, timeout: profile.timeout }))).toEqual([
      { id: 'profile-a', model: 'model-a-v2', timeout: 444 },
      { id: 'profile-b', model: 'model-b-v2', timeout: 333 },
    ])
    expect(merged.customConnections.map((connection) => ({ id: connection.id, name: connection.name }))).toEqual([
      { id: 'connection-b', name: 'Connection B2' },
      { id: 'connection-a', name: 'Connection A2' },
    ])
  })

  it('treats changed IDs as removed and newly added entries', () => {
    const current = mergeDefaultImportedSettings(DEFAULT_SETTINGS, createConfig('model-v1', 'v1')).settings
    const merged = mergeDefaultImportedSettings(current, {
      customConnections: [{ id: 'connection-v2', name: 'Connection V2', submit: { path: 'v2' } }],
      profiles: [{ id: 'profile-v2', connectionId: 'connection-v2', model: 'model-v2' }],
    }).settings

    expect(merged.profiles).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'profile-v2' }),
      expect.objectContaining({ id: 'source-profile' }),
    ]))
    expect(merged.customConnections).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'connection-v2' }),
      expect.objectContaining({ id: 'source-connection' }),
    ]))
  })

  it('generates profile IDs when creating settings from ordinary JSON', () => {
    const imported = importCustomConnectionSettingsFromJson(JSON.stringify({
      customConnections: [{ id: 'connection-a', name: 'Connection A', submit: { path: 'a' } }],
      profiles: [
        { connectionId: 'connection-a', model: 'model-a' },
        { connectionId: 'connection-a', model: 'model-b' },
      ],
    }))

    expect(imported.profiles.map((profile) => profile.id)).toEqual([
      expect.stringMatching(/^connection-a-imported-/),
      expect.stringMatching(/^connection-a-imported-/),
    ])
    expect(new Set(imported.profiles.map((profile) => profile.id)).size).toBe(2)
  })

  it('generates stable content-based IDs for ID-less preset profiles', () => {
    const config = {
      customConnections: [{ id: 'connection-a', name: 'Connection A', submit: { path: 'a' } }],
      profiles: [{ connectionId: 'connection-a', model: 'model-a' }],
    }
    const first = mergeDefaultImportedSettings(DEFAULT_SETTINGS, config).settings
    const second = mergeDefaultImportedSettings(first, config).settings
    const changed = mergeDefaultImportedSettings(second, {
      ...config,
      profiles: [{ connectionId: 'connection-a', model: 'model-b' }],
    }).settings

    expect(first.profiles[0].id).toMatch(/^connection-a-preset-/)
    expect(second.profiles).toHaveLength(1)
    expect(second.profiles[0].id).toBe(first.profiles[0].id)
    expect(changed.profiles).toHaveLength(2)
  })

  it('rejects duplicate profile IDs', () => {
    expect(() => importCustomConnectionSettingsFromJson(JSON.stringify({
      customConnections: [{ id: 'connection-a', name: 'Connection A', submit: { path: 'a' } }],
      profiles: [
        { id: 'profile-a', connectionId: 'connection-a', model: 'model-a' },
        { id: 'profile-a', connectionId: 'connection-a', model: 'model-b' },
      ],
    }))).toThrow('API 配置的 id「profile-a」重复')
  })

  it('rejects profiles that reference an unknown connection', () => {
    expect(() => importCustomConnectionSettingsFromJson(JSON.stringify({
      customConnections: [{ id: 'connection-a', name: 'Connection A', submit: { path: 'a' } }],
      profiles: [{ id: 'profile-a', connectionId: 'connection-missing', model: 'model-a' }],
    }))).toThrow('API 配置「profile-a」引用了不存在的自定义服务商')
  })

  it('rejects duplicate connection IDs before normalization', () => {
    expect(() => importCustomConnectionSettingsFromJson(JSON.stringify({
      customConnections: [
        { id: 'connection-a', name: 'Connection A', submit: { path: 'a' } },
        { id: 'connection-a', name: 'Connection B', submit: { path: 'b' } },
      ],
      profiles: [],
    }), [], { deploymentConfig: true })).toThrow('部署服务商「Connection B」的 id「connection-a」重复')
  })

  it('keeps the active user profile when updating the deployed config', () => {
    const previous = mergeDefaultImportedSettings(DEFAULT_SETTINGS, createConfig('model-v1', 'old/generate')).settings
    const userProfile = createDefaultOpenAIProfile({ id: 'user-profile', name: 'User Profile' })
    const current = normalizeSettings({
      ...previous,
      profiles: [...previous.profiles, userProfile],
      activeProfileId: userProfile.id,
    })
    const merged = mergeDefaultImportedSettings(current, createConfig('model-v2', 'v2/generate')).settings

    expect(merged.activeProfileId).toBe(userProfile.id)
  })

  it('uses matching IDs without overwriting local parameters when unlocked', () => {
    const config = createConfig('model-v2', 'v2/generate')
    const current = normalizeSettings({
      ...DEFAULT_SETTINGS,
      customConnections: config.customConnections,
      profiles: [{ ...config.profiles[0], apiKey: 'user-key' }],
      activeProfileId: config.profiles[0].id,
    })

    const merged = mergeDefaultImportedSettings(current, config).settings

    expect(merged.profiles[0].apiKey).toBe('user-key')
  })

  it('keeps removed preset entries and reuses the same IDs when they return', () => {
    const first = mergeDefaultImportedSettings(DEFAULT_SETTINGS, {
      customConnections: [
        { id: 'connection-a', name: 'Connection A', submit: { path: 'a' } },
        { id: 'connection-b', name: 'Connection B', submit: { path: 'b' } },
      ],
      profiles: [
        { id: 'profile-a', connectionId: 'connection-a', model: 'model-a', isDefault: true },
        { id: 'profile-b', connectionId: 'connection-b', model: 'model-b' },
      ],
    }).settings
    const removed = mergeDefaultImportedSettings(first, {
      customConnections: [{ id: 'connection-a', name: 'Connection A', submit: { path: 'a-v2' } }],
      profiles: [{ id: 'profile-a', connectionId: 'connection-a', model: 'model-a-v2' }],
    }).settings

    expect(removed.profiles[1]).toMatchObject({ id: 'profile-b', model: 'model-b' })
    expect(removed.customConnections[1]).toMatchObject({ id: 'connection-b', submit: { path: 'b' } })

    const restored = mergeDefaultImportedSettings(removed, {
      customConnections: [
        { id: 'connection-a', name: 'Connection A', submit: { path: 'a-v3' } },
        { id: 'connection-b', name: 'Connection B', submit: { path: 'b-v2' } },
      ],
      profiles: [
        { id: 'profile-a', connectionId: 'connection-a', model: 'model-a-v3', isDefault: true },
        { id: 'profile-b', connectionId: 'connection-b', model: 'model-b-v2' },
      ],
    }, { lockPresetParams: true }).settings

    expect(restored.profiles[1]).toMatchObject({ id: 'profile-b', model: 'model-b-v2' })
    expect(restored.customConnections[1]).toMatchObject({ id: 'connection-b', submit: { path: 'b-v2' } })
  })

  it('removes an unchanged deployed preset without history when it disappears from deployment', () => {
    const previousConfig = {
      customConnections: [
        { id: 'connection-a', name: 'Connection A', submit: { path: 'a' } },
        { id: 'connection-b', name: 'Connection B', submit: { path: 'b' } },
      ],
      profiles: [
        createDefaultOpenAIProfile({ id: 'profile-a', connectionId: 'connection-a', isDefault: true }),
        createDefaultOpenAIProfile({ id: 'profile-b', connectionId: 'connection-b' }),
      ],
    }
    const initial = mergeDefaultImportedSettings(DEFAULT_SETTINGS, previousConfig)
    const current = initial.settings
    const previousPresetConfig = initial.presetConfig
    const nextConfig = {
      customConnections: [previousConfig.customConnections[0]],
      profiles: [previousConfig.profiles[0]],
    }

    const removed = mergeDefaultImportedSettings(current, nextConfig, {
      previousPresetConfig,
    }).settings
    const retainedForHistory = mergeDefaultImportedSettings(current, nextConfig, {
      previousPresetConfig,
      usedPresetProfileIds: ['profile-b'],
    })
    const removedAfterHistoryCleared = mergeDefaultImportedSettings(retainedForHistory.settings, nextConfig, {
      previousPresetConfig: retainedForHistory.presetConfig,
    }).settings
    const modified = mergeDefaultImportedSettings(normalizeSettings({
      ...current,
      profiles: current.profiles.map((profile) => profile.id === 'profile-b' ? { ...profile, model: 'user-model' } : profile),
    }), nextConfig, {
      previousPresetConfig,
    }).settings
    const modifiedConnection = mergeDefaultImportedSettings(normalizeSettings({
      ...current,
      customConnections: current.customConnections.map((connection) =>
        connection.id === 'connection-b' ? { ...connection, submit: { ...connection.submit, path: 'user-b' } } : connection,
      ),
    }), nextConfig, {
      previousPresetConfig,
    }).settings

    expect(removed.profiles.map((profile) => profile.id)).toEqual(['profile-a'])
    expect(removed.customConnections.map((connection) => connection.id)).toEqual(['connection-a'])
    expect(retainedForHistory.settings.profiles.map((profile) => profile.id)).toEqual(['profile-a', 'profile-b'])
    expect(retainedForHistory.settings.customConnections.map((connection) => connection.id)).toEqual(['connection-a', 'connection-b'])
    expect(removedAfterHistoryCleared.profiles.map((profile) => profile.id)).toEqual(['profile-a'])
    expect(removedAfterHistoryCleared.customConnections.map((connection) => connection.id)).toEqual(['connection-a'])
    expect(modified.profiles[1]).toMatchObject({ id: 'profile-b', model: 'user-model' })
    expect(modified.customConnections.map((connection) => connection.id)).toEqual(['connection-a', 'connection-b'])
    expect(modifiedConnection.profiles.map((profile) => profile.id)).toEqual(['profile-a', 'profile-b'])
    expect(modifiedConnection.customConnections[1]).toMatchObject({ id: 'connection-b', submit: { path: 'user-b' } })
  })

  it('removes an untouched unlocked preset after applying a deployment update', () => {
    const initialConfig = {
      customConnections: [
        { id: 'connection-a', name: 'Connection A', submit: { path: 'a-v1' } },
        { id: 'connection-b', name: 'Connection B', submit: { path: 'b-v1' } },
      ],
      profiles: [
        createDefaultOpenAIProfile({ id: 'profile-a', connectionId: 'connection-a', isDefault: true }),
        createDefaultOpenAIProfile({ id: 'profile-b', connectionId: 'connection-b', model: 'model-v1' }),
      ],
    }
    const initial = mergeDefaultImportedSettings(DEFAULT_SETTINGS, initialConfig)
    const updatedConfig = {
      customConnections: [
        initialConfig.customConnections[0],
        { ...initialConfig.customConnections[1], submit: { path: 'b-v2' } },
      ],
      profiles: [
        initialConfig.profiles[0],
        { ...initialConfig.profiles[1], model: 'model-v2' },
      ],
    }
    const updated = mergeDefaultImportedSettings(initial.settings, updatedConfig, {
      previousPresetConfig: initial.presetConfig,
    })
    const removed = mergeDefaultImportedSettings(updated.settings, {
      customConnections: [updatedConfig.customConnections[0]],
      profiles: [updatedConfig.profiles[0]],
    }, {
      previousPresetConfig: updated.presetConfig,
    }).settings

    expect(updated.settings.profiles[1].model).toBe('model-v2')
    expect(updated.settings.customConnections[1].submit.path).toBe('b-v2')
    expect(removed.profiles.map((profile) => profile.id)).toEqual(['profile-a'])
    expect(removed.customConnections.map((connection) => connection.id)).toEqual(['connection-a'])
  })

  it('does not import preset profiles dismissed by the user', () => {
    const current = normalizeSettings({
      ...DEFAULT_SETTINGS,
      profiles: [createDefaultOpenAIProfile({ id: 'user-profile' })],
      activeProfileId: 'user-profile',
    })
    const merged = mergeDefaultImportedSettings(current, {
      customConnections: [],
      profiles: [createDefaultOpenAIProfile({ id: 'preset-a', isDefault: true })],
    }, { dismissedPresetProfileIds: ['preset-a'] }).settings

    expect(merged.profiles.map((profile) => profile.id)).toEqual(['user-profile'])
    expect(merged.activeProfileId).toBe('user-profile')
  })

  it('keeps a dismissed preset connection deleted while preset parameters are unlocked', () => {
    const config = createConfig('preset-model', 'generate')
    const current = mergeDefaultImportedSettings(DEFAULT_SETTINGS, config).settings
    const switched = switchApiProfileConnection(current.profiles[0], 'openai-images')
    const deleted = normalizeSettings({
      ...current,
      customConnections: [],
      profiles: [{ ...switched, model: 'local-openai-model' }],
    })

    const merged = mergeDefaultImportedSettings(deleted, config, {
      dismissedPresetConnectionIds: ['source-connection'],
    }).settings

    expect(merged.customConnections).toEqual([])
    expect(merged.profiles[0]).toMatchObject({
      id: 'source-profile',
      connectionId: 'openai-images',
      model: 'local-openai-model',
    })
  })

  it('respects a filtered preset connection dismissal when locking is enabled', () => {
    const config = createConfig('preset-model', 'generate')
    const current = mergeDefaultImportedSettings(DEFAULT_SETTINGS, config).settings
    const user = createDefaultOpenAIProfile({ id: 'user-profile' })
    const deleted = normalizeSettings({
      ...current,
      customConnections: [],
      profiles: [user],
      activeProfileId: user.id,
    })

    const merged = mergeDefaultImportedSettings(deleted, config, {
      lockPresetParams: true,
      dismissedPresetProfileIds: ['source-profile'],
      dismissedPresetConnectionIds: ['source-connection'],
    }).settings

    expect(merged.customConnections).toEqual([])
    expect(merged.profiles).toEqual([user])
  })

  it('requires exactly one default when deploying multiple profiles', () => {
    const connections = [
      { id: 'connection-a', name: 'Connection A', submit: { path: 'a' } },
      { id: 'connection-b', name: 'Connection B', submit: { path: 'b' } },
    ]

    expect(() => mergeDefaultImportedSettings(DEFAULT_SETTINGS, {
      customConnections: connections,
      profiles: [
        { id: 'profile-a', connectionId: 'connection-a', isDefault: false },
        { id: 'profile-b', connectionId: 'connection-b', isDefault: false },
      ],
    })).toThrow('部署文件包含多个 API 配置时，必须且只能有一项设置 isDefault: true')

    expect(() => mergeDefaultImportedSettings(DEFAULT_SETTINGS, {
      customConnections: connections,
      profiles: [
        { id: 'profile-a', connectionId: 'connection-a', isDefault: true },
        { id: 'profile-b', connectionId: 'connection-b', isDefault: true },
      ],
    })).toThrow('部署文件包含多个 API 配置时，必须且只能有一项设置 isDefault: true')
  })

  it('uses isDefault instead of array position for multiple deployed profiles', () => {
    const merged = mergeDefaultImportedSettings(DEFAULT_SETTINGS, {
      customConnections: [
        { id: 'connection-a', name: 'Connection A', submit: { path: 'a' } },
        { id: 'connection-b', name: 'Connection B', submit: { path: 'b' } },
      ],
      profiles: [
        { id: 'profile-a', connectionId: 'connection-a' },
        { id: 'profile-b', connectionId: 'connection-b', isDefault: true },
      ],
    }).settings

    expect(merged.profiles.map((profile) => ({ id: profile.id, isDefault: profile.isDefault }))).toEqual([
      { id: 'profile-a', isDefault: undefined },
      { id: 'profile-b', isDefault: true },
    ])
  })

  it('keeps legacy fixed slots without matching them by array position', () => {
    const legacyConnection = { id: 'deployed-default-connection-0', name: 'Legacy Connection', submit: { path: 'old' } }
    const legacyProfile = createDefaultOpenAIProfile({
      id: 'deployed-default-profile-0',
      connectionId: legacyConnection.id,
      model: 'legacy-model',
    })
    const current = normalizeSettings({ ...DEFAULT_SETTINGS, customConnections: [legacyConnection], profiles: [legacyProfile] })
    const merged = mergeDefaultImportedSettings(current, createConfig('model-v2', 'v2')).settings

    expect(merged.profiles).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'source-profile', model: 'model-v2' }),
      expect.objectContaining({ id: legacyProfile.id, model: 'legacy-model' }),
    ]))
    expect(merged.customConnections).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'source-connection' }),
      expect.objectContaining({ id: legacyConnection.id }),
    ]))
  })

  it('keeps every existing profile when the new preset list is empty', () => {
    const current = mergeDefaultImportedSettings(DEFAULT_SETTINGS, createConfig('model-v1', 'generate')).settings
    const merged = mergeDefaultImportedSettings(current, {
      customConnections: current.customConnections.map((connection) => ({ ...connection, submit: { path: 'v2/generate' } })),
      profiles: [],
    }).settings

    expect(merged.profiles).toHaveLength(1)
    expect(merged.profiles[0]).toMatchObject({ id: 'source-profile', isDefault: undefined })
  })
})

describe('default API profile marker', () => {
  it('only recognizes the explicit default preset marker', () => {
    expect(getDefaultApiProfileId(normalizeSettings({ profiles: [{ id: DEFAULT_OPENAI_PROFILE_ID }] }))).toBeNull()
    expect(getDefaultApiProfileId({ profiles: [
      { id: DEFAULT_OPENAI_PROFILE_ID },
      { id: 'deployment-profile', isDefault: true },
    ] })).toBe('deployment-profile')
    expect(getDefaultApiProfileId(normalizeSettings({ profiles: [{ id: 'deployed-default-profile-0' }] }))).toBeNull()
    expect(getDefaultApiProfileId({ profiles: [{ id: 'deployed-default-profile-0-previous-1' }] })).toBeNull()
  })

  it('preserves profile order when marking the deployment default', () => {
    const userProfile = createDefaultOpenAIProfile({ id: 'user-profile' })
    const builtIn = createDefaultOpenAIProfile()
    const deployed = createDefaultOpenAIProfile({ id: 'deployment-profile', isDefault: true })

    expect(normalizeSettings({ profiles: [userProfile, builtIn] }).profiles.map((profile) => profile.id)).toEqual([
      userProfile.id,
      DEFAULT_OPENAI_PROFILE_ID,
    ])
    expect(normalizeSettings({ profiles: [builtIn, userProfile, deployed] }).profiles.map((profile) => profile.id)).toEqual([
      builtIn.id,
      userProfile.id,
      deployed.id,
    ])
    expect(normalizeSettings({ profiles: [builtIn, userProfile, deployed] }).profiles[2].isDefault).toBe(true)
  })
})

describe('custom connections', () => {

  it('includes native transparent backgrounds in the default custom connection templates', () => {
    const connection = JSON.parse(DEFAULT_CUSTOM_CONNECTION_JSON)

    expect(connection.submit.body.background).toBe('$params.background')
    expect(connection.editSubmit.body.background).toBe('$params.background')
    expect(CUSTOM_CONNECTION_LLM_PROMPT).toContain('$params.background')
  })

  it('defaults custom profiles based on their native transparent background mapping', () => {
    const settings = normalizeSettings({
      customConnections: [
        { id: 'custom-local', name: 'Custom Local', submit: { path: 'generate', body: { prompt: '$prompt' } } },
        { id: 'custom-native', name: 'Custom Native', submit: { path: 'generate', body: { background: '$params.background' } } },
        {
          id: 'custom-partial',
          name: 'Custom Partial',
          submit: { path: 'generate', body: { background: '$params.background' } },
          editSubmit: { path: 'edit', body: { prompt: '$prompt' } },
        },
      ],
      profiles: [
        { ...createDefaultOpenAIProfile({ id: 'local-profile' }), connectionId: 'custom-local', transparentBackgroundMethod: 'api' },
        { ...createDefaultOpenAIProfile({ id: 'native-profile' }), connectionId: 'custom-native', transparentBackgroundMethod: undefined },
        { ...createDefaultOpenAIProfile({ id: 'partial-profile' }), connectionId: 'custom-partial', transparentBackgroundMethod: undefined },
        {
          ...createDefaultOpenAIProfile({ id: 'draft-profile' }),
          connectionDrafts: {
            'custom-local': { transparentBackgroundMethod: 'api' },
            'custom-native': {},
          },
        },
      ],
    })

    expect(settings.profiles.find((profile) => profile.id === 'local-profile')?.transparentBackgroundMethod).toBe('local')
    expect(settings.profiles.find((profile) => profile.id === 'native-profile')?.transparentBackgroundMethod).toBe('api')
    expect(settings.profiles.find((profile) => profile.id === 'partial-profile')?.transparentBackgroundMethod).toBe('local')
    expect(settings.profiles.find((profile) => profile.id === 'draft-profile')?.connectionDrafts?.['custom-local']?.transparentBackgroundMethod).toBe('local')
    expect(settings.profiles.find((profile) => profile.id === 'draft-profile')?.connectionDrafts?.['custom-native']?.transparentBackgroundMethod).toBe('api')
  })

  it('normalizes custom connection definitions and keeps custom profiles', () => {
    const settings = normalizeSettings({
      customConnections: [{
        id: 'custom-async',
        name: 'Custom Async',
        submit: { path: '/v1/images/generations', query: { async: 'true' }, taskIdPath: 'data' },
        editSubmit: { path: '/v1/images/edits', query: { async: 'true' }, taskIdPath: 'data' },
        poll: { path: '/v1/images/tasks/{task_id}', statusPath: 'data.status', successValues: ['done'], failureValues: ['error'], result: {} },
      }],
      profiles: [{
        id: 'profile-custom',
        name: 'Custom Profile',
        connectionId: 'custom-async',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'key',
        model: 'model',
        timeout: 60,
        codexCli: false,
        apiProxy: false,
      }],
      activeProfileId: 'profile-custom',
    })

    expect(settings.customConnections[0]).toMatchObject({
      id: 'custom-async',
      template: 'http-image',
      submit: {
        path: 'images/generations',
        query: { async: 'true' },
        taskIdPath: 'data',
      },
      editSubmit: {
        path: 'images/edits',
        query: { async: 'true' },
        taskIdPath: 'data',
      },
      poll: {
        path: 'images/tasks/{task_id}',
      },
    })
    expect(settings.profiles[0].connectionId).toBe('custom-async')
  })

  it('normalizes an Apimart-style task manifest', () => {
    const connection = importCustomConnectionDefinitionFromJson(JSON.stringify({
      name: 'Apimart GPT-Image-2',
      template: 'http-image',
      submit: {
        path: '/v1/images/generations',
        method: 'POST',
        contentType: 'json',
        body: {
          model: '$profile.model',
          prompt: '$prompt',
          n: '$params.n',
          size: '$params.size',
          resolution: '2k',
          image_urls: '$inputImages.dataUrls',
        },
        taskIdPath: 'data.0.task_id',
      },
      poll: {
        path: '/v1/tasks/{task_id}',
        method: 'GET',
        query: { language: 'zh' },
        statusPath: 'data.status',
        successValues: ['completed'],
        failureValues: ['failed', 'cancelled'],
        result: {
          imageUrlPaths: ['data.result.images.*.url.*'],
        },
      },
    }))

    expect(connection).toMatchObject({
      template: 'http-image',
      submit: {
        path: 'images/generations',
        taskIdPath: 'data.0.task_id',
      },
      poll: {
        path: 'tasks/{task_id}',
        query: { language: 'zh' },
        successValues: ['completed'],
        result: {
          imageUrlPaths: ['data.result.images.*.url.*'],
        },
      },
    })
  })

  it('imports wrapped custom connection settings with profiles', () => {
    const imported = importCustomConnectionSettingsFromJson(JSON.stringify({
      customConnections: [{
        id: 'custom-json',
        name: 'Custom JSON',
        submit: {
          path: 'images/generations',
          method: 'POST',
          contentType: 'json',
          body: { model: '$profile.model', prompt: '$prompt' },
          result: { imageUrlPaths: ['data.*.url'], b64JsonPaths: [] },
        },
      }],
      profiles: [{
        name: 'Custom JSON',
        connectionId: 'custom-json',
        baseUrl: 'https://custom.example.com/v1',
        model: 'custom-model',
      }],
    }))

    expect(imported.customConnections[0]).toMatchObject({ id: 'custom-json', name: 'Custom JSON' })
    expect(imported.profiles[0]).toMatchObject({
      name: 'Custom JSON',
      connectionId: 'custom-json',
      baseUrl: 'https://custom.example.com/v1',
      apiKey: '',
      model: 'custom-model',
    })
  })

  it('imports wrapped custom connection settings from a json code block', () => {
    const imported = importCustomConnectionSettingsFromJson(`\`\`\`json
{"customConnections":[{"id":"custom-json","name":"Custom JSON","submit":{"path":"images/generations","method":"POST","contentType":"json","body":{"model":"$profile.model","prompt":"$prompt"},"result":{"imageUrlPaths":["data.result.images.*.url.*"],"b64JsonPaths":[]}}}],"profiles":[{"name":"Custom JSON","connectionId":"custom-json","baseUrl":"https://custom.example.com/v1","model":"custom-model"}]}
\`\`\``)

    expect(imported.customConnections[0]).toMatchObject({ id: 'custom-json' })
    expect(imported.customConnections[0].submit.result).toMatchObject({
      imageUrlPaths: ['data.result.images.*.url.*'],
    })
    expect(imported.profiles[0]).toMatchObject({
      connectionId: 'custom-json',
      baseUrl: 'https://custom.example.com/v1',
    })
  })

  it('rejects markdown-corrupted profile fields when importing wrapped settings', () => {
    expect(() => importCustomConnectionSettingsFromJson(JSON.stringify({
      customConnections: [{
        id: 'custom-apimart',
        name: 'APIMart',
        submit: { path: 'images/generations' },
      }],
      profiles: [{
        name: 'APIMart',
        connectionId: 'custom-apimart',
        baseUrl: '[https://api.apimart.ai/v1',
        model: 'gpt-image-2-official',

      }],
    }))).toThrow('JSON 包含 Markdown 链接')
  })

  it('rejects task mappings without poll configuration', () => {
    expect(() => importCustomConnectionDefinitionFromJson(JSON.stringify({
      name: 'Invalid Async',
      submit: {
        path: 'images/generations',
        taskIdPath: 'task_id',
      },
    }))).toThrow('配置了 taskIdPath，但缺少 poll')
  })

  it('restores custom connection draft settings', () => {
    const connection = importCustomConnectionDefinitionFromJson(JSON.stringify({
      name: 'Custom Connection',
      submit: { path: 'images/generations' },
    }))
    const customProfile = switchApiProfileConnection(createDefaultOpenAIProfile(), connection.id, connection)
    const openAIProfile = switchApiProfileConnection({ ...customProfile, codexCli: true, transparentBackgroundMethod: 'local' }, 'openai-images')
    const restoredProfile = switchApiProfileConnection(openAIProfile, connection.id, connection)

    expect(restoredProfile.codexCli).toBe(true)
    expect(restoredProfile.transparentBackgroundMethod).toBe('local')
    expect(openAIProfile.transparentBackgroundMethod).toBe('api')
  })

  it('uses connection-specific streaming defaults and preserves partial image count', () => {
    expect(createDefaultOpenAIProfile().streamImages).toBe(false)
    expect(createDefaultOpenAIProfile().streamPartialImages).toBe(0)
    expect(DEFAULT_SETTINGS.profiles[0].streamImages).toBe(false)
    expect(DEFAULT_SETTINGS.profiles[0].streamPartialImages).toBe(0)

    const normalized = normalizeSettings({
      profiles: [
        createDefaultOpenAIProfile({ streamImages: false, streamPartialImages: 3 }),
      ],
    })

    expect(normalized.profiles[0].streamImages).toBe(false)
    expect(normalized.profiles[0].streamPartialImages).toBe(3)

    const clamped = normalizeSettings({
      profiles: [
        createDefaultOpenAIProfile({ streamPartialImages: 8 }),
      ],
    })

    expect(clamped.profiles[0].streamPartialImages).toBe(3)
  })

  it('disables unsupported streaming for custom connections', () => {
    const settings = normalizeSettings({
      customConnections: [{ id: 'custom-json', name: 'Custom JSON', submit: { path: 'images/generations' } }],
      profiles: [{
        id: 'custom-profile',
        name: 'Custom Profile',
        connectionId: 'custom-json',
        baseUrl: 'https://custom.example.com/v1',
        apiKey: 'custom-key',
        model: 'custom-model',
        streamImages: true,
      }],
    })

    expect(settings.profiles[0]).toMatchObject({
      connectionId: 'custom-json',
      streamImages: false,
    })
  })

  it('keeps connection order usable when custom connections are added after manual sorting', () => {
    const settings = normalizeSettings({
      connectionOrder: ['custom-beta', 'openai-images', 'missing-connection'],
      customConnections: [
        { id: 'custom-alpha', name: '示例服务商 A', submit: { path: 'images/generations' } },
        { id: 'custom-beta', name: '示例服务商 B', submit: { path: 'images/generations' } },
      ],
    })

    expect(settings.connectionOrder).toEqual(['custom-beta', 'openai-images', 'gemini-generate-content', 'custom-alpha'])
  })

  it('reads the active connection from its profile', () => {
    const settings = normalizeSettings({
      customConnections: [{ id: 'custom-json', name: 'Custom JSON', submit: { path: 'images/generations' } }],
      activeProfileId: 'custom-profile',
      profiles: [{
        id: 'custom-profile',
        name: 'Custom Profile',
        connectionId: 'custom-json',
        baseUrl: 'https://custom.example.com/v1',
        apiKey: 'custom-key',
        model: 'custom-model',
      }],
    })

    const activeProfile = getActiveApiProfile(settings)
    expect(activeProfile.connectionId).toBe('custom-json')
    expect(activeProfile.streamImages).toBe(false)
  })

  it('switches to a custom connection without inheriting native streaming', () => {
    const connection = { id: 'custom-json', name: 'Custom JSON', submit: { path: 'images/generations' } }
    const openaiProfile = createDefaultOpenAIProfile({ connectionId: 'openai-images', streamImages: true })

    const customProfile = switchApiProfileConnection(openaiProfile, connection.id, connection)

    expect(customProfile).toMatchObject({ connectionId: connection.id, streamImages: false })
  })

  it('disables prompt rewrite allowance by default', () => {
    expect(DEFAULT_SETTINGS.allowPromptRewrite).toBe(false)
    expect(normalizeSettings({}).allowPromptRewrite).toBe(false)
    expect(normalizeSettings({ allowPromptRewrite: true }).allowPromptRewrite).toBe(true)
  })
})

describe('model list', () => {
  it('normalizes comma separated models', () => {
    expect(splitModelList('a,b ，c, a,')).toEqual(['a', 'b', 'c'])
    expect(normalizeApiProfile({ model: 'a,b ，c' }).model).toBe('a, b, c')
  })

  it('resolves selected model and falls back to the first one', () => {
    const profile = normalizeApiProfile({ model: 'a, b', selectedModel: 'b' })
    expect(resolveApiProfileModel(profile).model).toBe('b')
    expect(resolveApiProfileModel(profile, 'a').model).toBe('a')
    expect(resolveApiProfileModel({ ...profile, selectedModel: 'x' }).model).toBe('a')
  })

  it('returns the selected model for the active profile', () => {
    const profile = normalizeApiProfile({ id: 'p1', model: 'a,b', selectedModel: 'b' })
    expect(getActiveApiProfile({ profiles: [profile], activeProfileId: 'p1' }).model).toBe('b')
  })
})

describe('unified API connections', () => {
  it('restores independent Images and custom connection settings after persistence', () => {
    const connection = { id: 'custom-image', name: '自定义图片接口', submit: { path: 'generate' } }
    const images = createDefaultOpenAIProfile({ model: 'vendor/image', streamImages: true, streamPartialImages: 3 })
    const custom = {
      ...switchApiProfileConnection(images, connection.id, connection),
      model: 'custom/model',
      baseUrl: 'https://custom.example.com/',
      homeParams: [],
      paramDefaults: { quality: 'high' as const },
    }
    const restoredImages = switchApiProfileConnection(custom, 'openai-images')
    const settings = normalizeSettings(JSON.parse(JSON.stringify({ customConnections: [connection], profiles: [restoredImages] })))

    expect(settings.profiles[0]).toMatchObject({ model: images.model, streamImages: true, streamPartialImages: 3 })
    expect(switchApiProfileConnection(settings.profiles[0], connection.id, connection)).toMatchObject({
      connectionId: connection.id,
      model: custom.model,
      baseUrl: custom.baseUrl,
      streamImages: false,
      homeParams: [],
      paramDefaults: custom.paramDefaults,
    })
  })

  it.each(['openai-images'])('reserves the built-in connection ID %s in all imports', (id) => {
    for (const deploymentConfig of [false, true]) {
      expect(() => importCustomConnectionSettingsFromJson(JSON.stringify({
        customConnections: [{ id, name: 'Custom', submit: { path: 'generate' } }],
        profiles: [],
      }), [], { deploymentConfig })).toThrow('与内置接入冲突')
    }
  })

  it('rejects profiles without a connection ID rather than selecting a protocol', () => {
    expect(() => importCustomConnectionSettingsFromJson(JSON.stringify({
      profiles: [{ name: 'Missing connection', baseUrl: 'https://vendor.example/', model: 'vendor/model' }],
    }))).toThrow('connectionId')
    const profile = normalizeApiProfile({ name: 'Missing connection' })
    expect(validateApiProfile(profile)).toBe('接入方式已不可用，请重新选择')
  })
})
