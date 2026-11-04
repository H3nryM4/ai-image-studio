import { describe, expect, it } from 'vitest'
import {
  getCustomConnectionConfigUrl,
  hasEmbeddedDefaultConfig,
  isImportableConfigUrl,
  loadCustomConnectionSettingsFromUrl,
  loadEmbeddedDefaultConfig,
} from './customConnectionConfigUrl'

describe('custom connection config URL', () => {
  it('does not expose a JSON config URL to the browser loader', () => {
    expect(getCustomConnectionConfigUrl('https://example.com/custom-connection.json'))
      .toBe('')
  })

  it('returns empty when default API URL is a normal API endpoint', () => {
    expect(getCustomConnectionConfigUrl('https://api.example.com/v1'))
      .toBe('')
  })

  it('detects importable URL values', () => {
    expect(isImportableConfigUrl('https://example.com/connection.json')).toBe(true)
    expect(isImportableConfigUrl('https://example.com/?settings={}')).toBe(true)
    expect(isImportableConfigUrl('https://api.openai.com/v1')).toBe(false)
  })

  it('returns null for empty URL', async () => {
    const result = await loadCustomConnectionSettingsFromUrl('')

    expect(result).toBeNull()
  })

  it('loads an embedded default config without fetching a URL', () => {
    const payload = JSON.stringify({
      customConnections: [{ id: 'embedded', name: '内嵌服务商', submit: { path: 'generate' } }],
      profiles: [],
    })
    const bytes = new TextEncoder().encode(payload)
    const base64 = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))

    expect(hasEmbeddedDefaultConfig(`embedded-config:${base64}`)).toBe(true)
    expect(loadEmbeddedDefaultConfig(`embedded-config:${base64}`)?.customConnections[0]).toMatchObject({
      id: 'embedded',
      name: '内嵌服务商',
    })
  })

  it('accepts an empty embedded deployment snapshot', () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ customConnections: [], profiles: [] }))
    const base64 = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))

    expect(loadEmbeddedDefaultConfig(`embedded-config:${base64}`)).toEqual({
      customConnections: [],
      profiles: [],
    })
  })

  it('accepts a deployment file with profiles and no customConnections', async () => {
    const config = { profiles: [{ id: 'builtin',  connectionId: 'openai-images', model: 'image-model' }] }
    const json = JSON.stringify(config)
    const bytes = new TextEncoder().encode(json)
    const base64 = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
    expect(loadEmbeddedDefaultConfig(`embedded-config:${base64}`)).toMatchObject({ customConnections: [], profiles: [expect.objectContaining({ id: 'builtin' })] })
    expect((await loadCustomConnectionSettingsFromUrl(`https://example.com/?settings=${encodeURIComponent(json)}`))?.profiles[0].id).toBe('builtin')

    const legacy = JSON.stringify({ customConnections: [], ...config })
    const legacyBytes = new TextEncoder().encode(legacy)
    const legacyBase64 = btoa(Array.from(legacyBytes, (byte) => String.fromCharCode(byte)).join(''))
    expect(loadEmbeddedDefaultConfig(`embedded-config:${legacyBase64}`)?.profiles[0].id).toBe('builtin')
    expect((await loadCustomConnectionSettingsFromUrl(`https://example.com/?settings=${encodeURIComponent(legacy)}`))?.profiles[0].id).toBe('builtin')
  })

  it('imports settings directly from URL settings param', async () => {
    const settings = {
      customConnections: [{
        id: 'custom-share-url',
        name: 'Share URL Custom',
        submit: {
          path: 'images/generations',
          method: 'POST',
          contentType: 'json',
          body: { model: '$profile.model', prompt: '$prompt' },
          result: { imageUrlPaths: ['data.*.url'], b64JsonPaths: [] },
        },
      }],
      profiles: [{
        id: 'share-url-profile',
        name: 'Share URL Profile',
        connectionId: 'custom-share-url',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'share-url-key',
        model: 'share-url-model',
        timeout: 300,
        codexCli: false,
        apiProxy: false,
      }],
    }
    const url = `https://example.com/?settings=${encodeURIComponent(JSON.stringify({ version: 1, settings }))}`

    const result = await loadCustomConnectionSettingsFromUrl(url)

    expect(result?.customConnections[0]).toMatchObject({ id: 'custom-share-url', name: 'Share URL Custom' })
    expect(result?.profiles[0]).toMatchObject({ id: 'share-url-profile', connectionId: 'custom-share-url' })
  })
})
