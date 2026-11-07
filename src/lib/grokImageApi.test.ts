import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PARAMS } from '../types'
import { callImageApi } from './api'
import { createDefaultOpenAIProfile, getActiveApiProfile, normalizeSettings, switchApiProfileConnection } from './apiProfiles'
import { buildApiUrl } from './devProxy'
import { parseDefaultApiUrl } from './defaultApiUrl'
import { DEFAULT_GROK_BASE_URL, DEFAULT_GROK_MODEL, getGrokImageOptions, GROK_CONNECTION_ID } from './grok'
import { callGrokImageApi } from './grokImageApi'
import { createProfileShareJson, readProfileImport } from './profileSharing'
import { buildSettingsFromUrlParams } from './urlSettings'

const profile = createDefaultOpenAIProfile({ connectionId: GROK_CONNECTION_ID, apiKey: 'test-key', baseUrl: 'https://grok.example/v1' })
const settings = normalizeSettings({ profiles: [profile], activeProfileId: profile.id })
const opts = { settings, prompt: '画一只猫', params: DEFAULT_PARAMS, inputImageDataUrls: [] as string[] }
const PNG = 'data:image/png;base64,aW5wdXQ='
const response = () => new Response(JSON.stringify({ data: [{ b64_json: '/9j/aW1hZ2U=' }] }))

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Grok Images API', () => {
  it('routes the Grok connection to its native request without sending unrelated parameters', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => response())
    const result = await callImageApi({ ...opts, params: { ...DEFAULT_PARAMS, n: 3, aspect_ratio: '16:9', image_size: '2K', quality: 'medium', output_format: 'webp', moderation: 'low', thinking_level: 'high', complexity: 'high' } })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][0]).toBe('https://grok.example/v1/images/generations')
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer test-key' })
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ model: DEFAULT_GROK_MODEL, prompt: opts.prompt, n: 3, aspect_ratio: '16:9', resolution: '2k', quality: 'medium' })
    expect(result.images).toEqual(['data:image/jpeg;base64,/9j/aW1hZ2U='])
    await callImageApi(opts)
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ model: DEFAULT_GROK_MODEL, prompt: opts.prompt })
  })

  it('uses JSON image objects for single and multiple reference images', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => response())
    await callGrokImageApi({ ...opts, inputImageDataUrls: [PNG] }, profile)
    expect(fetchMock.mock.calls[0][0]).toBe('https://grok.example/v1/images/edits')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ model: DEFAULT_GROK_MODEL, prompt: opts.prompt, image: { type: 'image_url', url: PNG } })
    await callGrokImageApi({ ...opts, inputImageDataUrls: [PNG, PNG] }, { ...profile, responseFormatB64Json: true })
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ model: DEFAULT_GROK_MODEL, prompt: opts.prompt, images: [{ type: 'image_url', url: PNG }, { type: 'image_url', url: PNG }], response_format: 'b64_json' })
  })

  it('rejects masks and too many references before making a request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    await expect(callGrokImageApi({ ...opts, maskDataUrl: PNG }, profile)).rejects.toThrow('蒙版')
    await expect(callGrokImageApi({ ...opts, inputImageDataUrls: Array(6).fill(PNG) }, profile)).rejects.toThrow('5')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('omits quality for models without the quality parameter and caps the image count', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response())
    await callGrokImageApi({ ...opts, params: { ...DEFAULT_PARAMS, n: 30, quality: 'medium' } }, { ...profile, model: 'grok-imagine-image' })
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ model: 'grok-imagine-image', prompt: opts.prompt, n: 10 })
    expect(getGrokImageOptions('grok-imagine-image-2.0').supportsQuality).toBe(true)
  })

  it('uses the deployment proxy for the same native request body', async () => {
    vi.stubGlobal('__DEV_PROXY_CONFIG__', { enabled: true, prefix: '/grok-proxy', target: DEFAULT_GROK_BASE_URL, changeOrigin: true, secure: true })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response())
    await callGrokImageApi(opts, { ...profile, apiProxy: true })
    expect(fetchMock.mock.calls[0][0]).toBe('/grok-proxy/images/generations')
  })

  it('retains the provider error and original response', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const payload = { error: { message: 'quota exceeded' } }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(payload), { status: 429 }))
    await expect(callGrokImageApi(opts, profile)).rejects.toMatchObject({ message: 'quota exceeded', rawResponsePayload: JSON.stringify(payload) })
  })

  it('keeps the timeout active while reading the response body', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_, init) => ({
      ok: true,
      json: () => new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))),
    } as Response))
    await expect(callGrokImageApi(opts, { ...profile, timeout: 0.02 })).rejects.toThrow('Grok 请求超时')
  })
})

describe('Grok configuration', () => {
  it('switches connections and restores per-connection settings including the SVG model', () => {
    const original = createDefaultOpenAIProfile({ model: 'custom-gpt', svgModel: 'custom-svg', streamImages: true })
    const grok = switchApiProfileConnection(original, GROK_CONNECTION_ID)
    expect(grok).toMatchObject({ baseUrl: DEFAULT_GROK_BASE_URL, model: DEFAULT_GROK_MODEL, codexCli: false, streamImages: false, transparentBackgroundMethod: 'local' })
    expect(grok.svgModel).toBeUndefined()
    const restored = normalizeSettings({ profiles: [grok], activeProfileId: grok.id }).profiles[0]
    expect(switchApiProfileConnection(restored, 'openai-images')).toMatchObject({ model: original.model, svgModel: original.svgModel, streamImages: true })
    const imported = readProfileImport(createProfileShareJson({ ...profile, codexCli: true, streamImages: true, transparentBackgroundMethod: 'api' }), settings).profiles[0]
    expect(imported).toMatchObject({ connectionId: GROK_CONNECTION_ID, codexCli: false, streamImages: false, transparentBackgroundMethod: 'local' })
  })

  it('recognizes Grok deployment and query-string configuration', () => {
    const patch = parseDefaultApiUrl('https://api.x.ai/v1?connectionId=xai-images')
    expect(patch).toMatchObject({ connectionId: GROK_CONNECTION_ID, baseUrl: DEFAULT_GROK_BASE_URL })
    const next = buildSettingsFromUrlParams(settings, new URLSearchParams('connectionId=xai-images&apiKey=new-key'))
    expect(getActiveApiProfile(next)).toMatchObject({ connectionId: GROK_CONNECTION_ID, baseUrl: DEFAULT_GROK_BASE_URL, model: DEFAULT_GROK_MODEL, apiKey: 'new-key' })
    expect(buildApiUrl('https://grok.example/proxy/', 'images/edits')).toBe('https://grok.example/proxy/images/edits')
  })
})
