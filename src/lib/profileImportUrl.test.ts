import { describe, expect, it } from 'vitest'
import { createDefaultOpenAIProfile, DEFAULT_SETTINGS, importCustomConnectionSettingsFromJson, normalizeSettings } from './apiProfiles'
import { createCustomProfileImportUrl } from './profileImportUrl'
import { buildSettingsFromUrlParams } from './urlSettings'

describe('createCustomProfileImportUrl', () => {
  it('omits unused connections from built-in profile links and imports them normally', () => {
    const profile = createDefaultOpenAIProfile({ id: 'built-in', apiKey: 'key' })
    const url = new URL(createCustomProfileImportUrl('https://playground.example.com', profile, undefined, {
      includeApiKey: true, useNewApiAddress: false, useNewApiKey: false, useNewApiModel: false,
    }))
    const json = url.searchParams.get('settings')!
    expect(JSON.parse(json)).not.toHaveProperty('customConnections')
    expect(importCustomConnectionSettingsFromJson(json).profiles).toHaveLength(1)
    expect(buildSettingsFromUrlParams(DEFAULT_SETTINGS, url.searchParams).profiles).toHaveLength(1)

    const legacy = JSON.stringify({ customConnections: [], profiles: JSON.parse(json).profiles })
    expect(importCustomConnectionSettingsFromJson(legacy).profiles).toHaveLength(1)
    expect(buildSettingsFromUrlParams(DEFAULT_SETTINGS, new URLSearchParams({ settings: legacy })).profiles).toHaveLength(1)
  })

  it('does not include the source profile ID in the shared URL', () => {
    const connection = { id: 'custom-connection', name: 'Custom Connection', submit: { path: 'generate' } }
    const profile = createDefaultOpenAIProfile({
      id: 'custom-profile',
      connectionId: connection.id,
      apiKey: 'secret-key',
      model: 'custom-model',
    })

    const result = createCustomProfileImportUrl(
      'https://playground.example.com/app?old=value#section',
      profile,
      connection,
      { includeApiKey: false, useNewApiAddress: false, useNewApiKey: true, useNewApiModel: false },
    )
    const url = new URL(result.replace('{key}', '%7Bkey%7D'))
    const settings = JSON.parse(url.searchParams.get('settings')!)

    expect(url.origin + url.pathname).toBe('https://playground.example.com/app')
    expect(url.hash).toBe('')
    expect(url.searchParams.has('profileId')).toBe(false)
    expect(settings.customConnections).toEqual([connection])
    expect(settings.profiles).toEqual([expect.objectContaining({
      connectionId: connection.id,
      apiKey: '{key}',
      model: 'custom-model',
    })])
    expect(settings.profiles[0]).not.toHaveProperty('id')
  })

  it('imports the shared custom profile without converting it to OpenAI', () => {
    const connection = { id: 'custom-connection', name: 'Custom Connection', submit: { path: 'generate' } }
    const profile = createDefaultOpenAIProfile({
      id: 'custom-profile',
      connectionId: connection.id,
      apiKey: 'secret-key',
      model: 'custom-model',
    })
    const url = new URL(createCustomProfileImportUrl(
      'https://playground.example.com',
      profile,
      connection,
      { includeApiKey: true, useNewApiAddress: false, useNewApiKey: false, useNewApiModel: false },
    ))
    const next = normalizeSettings({
      ...DEFAULT_SETTINGS,
      ...buildSettingsFromUrlParams(DEFAULT_SETTINGS, url.searchParams),
    })

    expect(next.activeProfileId).not.toBe(profile.id)
    expect(next.customConnections).toEqual([expect.objectContaining({
      id: connection.id,
      submit: expect.objectContaining({ path: 'generate' }),
    })])
    expect(next.profiles[0]).toMatchObject({
      connectionId: connection.id,
      apiKey: 'secret-key',
      model: 'custom-model',
    })
  })
})
