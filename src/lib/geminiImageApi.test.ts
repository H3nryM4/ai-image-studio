import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PARAMS } from '../types'
import { callImageApi } from './api'
import { createDefaultOpenAIProfile, getActiveApiProfile, normalizeSettings, switchApiProfileConnection } from './apiProfiles'
import { buildGeminiApiUrl, DEFAULT_GEMINI_MODEL, GEMINI_CONNECTION_ID, getGeminiImageOptions, normalizeGeminiBaseUrl, normalizeGeminiParams } from './gemini'
import { getHomeParamState, normalizeHomeParams, switchHomeParams } from './homeParams'
import { createProfileShareJson, readProfileImport } from './profileSharing'
import { normalizeParamsForSettings } from './paramCompatibility'
import { normalizeDevProxyConfig } from './devProxy'
import { parseDefaultApiUrl } from './defaultApiUrl'

const profile = createDefaultOpenAIProfile({ connectionId: GEMINI_CONNECTION_ID, apiKey: 'test-key', baseUrl: 'https://gemini.example/v1beta' })
const settings = normalizeSettings({ profiles: [profile], activeProfileId: profile.id })
const image = { inlineData: { data: 'aW1hZ2U=', mimeType: 'image/jpeg' } }
const response = (parts = [image]) => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts } }] }))
const opts = { settings, params: DEFAULT_PARAMS, prompt: '画一只猫', inputImageDataUrls: [] as string[] }

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Gemini generateContent', () => {
  it('sends an explicit supported thinking level and omits the interface default', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => response())
    await callImageApi({ ...opts, params: { ...DEFAULT_PARAMS, thinking_level: 'high' } })
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'HIGH' })
    await callImageApi(opts)
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).generationConfig).not.toHaveProperty('thinkingConfig')
    const unsupported = normalizeSettings({ profiles: [{ ...profile, model: 'gemini-2.5-flash-image' }], activeProfileId: profile.id })
    await callImageApi({ ...opts, settings: unsupported, params: { ...DEFAULT_PARAMS, thinking_level: 'high' } })
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body)).generationConfig).not.toHaveProperty('thinkingConfig')
  })
  it('uses the official header, path and image config without leaking Images parameters', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response())
    const result = await callImageApi({ ...opts, params: { ...DEFAULT_PARAMS, quality: 'high', moderation: 'low', output_format: 'webp', output_compression: 70, aspect_ratio: '16:9', image_size: '2K' }, inputImageDataUrls: ['data:image/png;base64,aW5wdXQ='] })
    expect(fetchMock.mock.calls[0][0]).toBe(`https://gemini.example/v1beta/models/${DEFAULT_GEMINI_MODEL}:generateContent`)
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({ 'Content-Type': 'application/json', 'x-goog-api-key': 'test-key' })
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      contents: [{ role: 'user', parts: [{ text: '画一只猫' }, { inlineData: { mimeType: 'image/png', data: 'aW5wdXQ=' } }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '16:9', imageSize: '2K' } },
    })
    expect(result.images).toEqual(['data:image/jpeg;base64,aW1hZ2U='])
    expect(result.actualParamsList).toEqual([{ output_format: 'jpeg' }])
  })

  it('omits automatic dimensions and ignores thought images while accepting mixed output', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ ...image, thought: true }, { text: '完成' }, image] } }] })))
    expect((await callImageApi(opts)).images).toHaveLength(1)
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).generationConfig).toEqual({ responseModalities: ['TEXT', 'IMAGE'] })
  })

  it.each(['gemini-2.5-flash-image', 'gemini-2.5-flash-image-preview', 'nano-banana', 'google/nano-banana-preview', 'gemini-nano-banana-image'])('omits unsupported imageSize for first-generation model %s', async (model) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response())
    const firstGeneration = normalizeSettings({ profiles: [{ ...profile, model }], activeProfileId: profile.id })
    await callImageApi({ ...opts, settings: firstGeneration, params: { ...DEFAULT_PARAMS, aspect_ratio: '16:9', image_size: '1K' } })
    expect(getGeminiImageOptions(model)).toMatchObject({ resolutions: [], maxInputImages: 3, thinkingLevels: [] })
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).generationConfig).toEqual({ responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '16:9' } })
  })

  it.each([
    [{ promptFeedback: { blockReason: 'SAFETY' } }, 'SAFETY'],
    [{ candidates: [{ finishReason: 'IMAGE_SAFETY', content: { parts: [image] } }] }, 'IMAGE_SAFETY'],
    [{ candidates: [{ content: { parts: [{ text: '当前模型不支持生图' }] } }] }, '当前模型不支持生图'],
    [null, '未返回成品图片'],
  ])('rejects successful HTTP responses that do not contain a usable final image', async (payload, message) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(payload)))
    await expect(callImageApi(opts)).rejects.toMatchObject({ message: expect.stringContaining(message), rawResponsePayload: JSON.stringify(payload) })
  })

  it.each([200, 502])('retains unparseable response bodies for HTTP %s', async (status) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>upstream error</html>', { status }))
    await expect(callImageApi(opts)).rejects.toMatchObject({ rawResponsePayload: '<html>upstream error</html>' })
  })

  it('retains each original response when every request fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const payload = JSON.stringify({ error: { message: 'quota exceeded' } })
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(payload, { status: 429 }))
    const err = await callImageApi({ ...opts, params: { ...DEFAULT_PARAMS, n: 2 } }).catch((err: unknown) => err) as Error & { rawResponsePayload: string }
    expect(err.message).toContain('quota exceeded')
    expect(JSON.parse(err.rawResponsePayload)).toEqual([
      { requestIndex: 0, error: 'quota exceeded', rawResponsePayload: payload },
      { requestIndex: 1, error: 'quota exceeded', rawResponsePayload: payload },
    ])
  })

  it('keeps successes after a failed request and limits concurrency to two', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    let active = 0
    let maximum = 0
    let calls = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      const idx = calls++
      active++
      maximum = Math.max(maximum, active)
      await new Promise((resolve) => setTimeout(resolve, 10))
      active--
      return idx === 1 ? new Response(JSON.stringify({ error: { message: 'quota exceeded' } }), { status: 429 }) : response()
    })
    const result = await callImageApi({ ...opts, params: { ...DEFAULT_PARAMS, n: 4 } })
    expect(calls).toBe(4)
    expect(maximum).toBe(2)
    expect(result.images).toHaveLength(3)
    expect(result.failedRequests).toEqual([{ requestIndex: 1, error: 'quota exceeded', rawResponsePayload: JSON.stringify({ error: { message: 'quota exceeded' } }) }])
  })

  it('keeps the timeout active while reading the response body', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_, init) => ({
      ok: true,
      text: () => new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))),
    } as Response))
    const shortSettings = normalizeSettings({ profiles: [{ ...profile, timeout: 0.02 }], activeProfileId: profile.id })
    await expect(callImageApi({ ...opts, settings: shortSettings })).rejects.toThrow('请求超时')
  })

  it('rejects masks and oversized reference lists before sending requests', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    await expect(callImageApi({ ...opts, maskDataUrl: 'data:image/png;base64,aW1n' })).rejects.toThrow('蒙版')
    await expect(callImageApi({ ...opts, inputImageDataUrls: Array(15).fill('data:image/png;base64,aW1n') })).rejects.toThrow('14')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('routes the same body through the deployment proxy', async () => {
    vi.stubGlobal('__DEV_PROXY_CONFIG__', { enabled: true, prefix: '/gemini-proxy', target: 'https://gemini.example/v1beta', changeOrigin: true, secure: true })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response())
    await callImageApi({ ...opts, settings: normalizeSettings({ profiles: [{ ...profile, apiProxy: true }], activeProfileId: profile.id }) })
    expect(fetchMock.mock.calls[0][0]).toBe(`/gemini-proxy/models/${DEFAULT_GEMINI_MODEL}:generateContent`)
  })
})

describe('Gemini configuration', () => {
  it.each([
    ['google/nano-banana-2', ['512', '1K', '2K', '4K'], ['minimal', 'high'], true],
    ['nano_banana-2.1', ['1K', '2K', '4K'], ['minimal', 'medium', 'high'], true],
    ['nano-banana-2-1', ['1K', '2K', '4K'], ['minimal', 'medium', 'high'], true],
    ['nano-banana-pro', ['1K', '2K', '4K'], [], false],
    ['nano-banana-2-lite', ['1K'], ['minimal', 'high'], false],
    ['gemini-3.1-flash-lite-image', ['1K'], ['minimal', 'high'], false],
  ])('recognizes image options for model alias %s', (model, resolutions, thinkingLevels, extended) => {
    const options = getGeminiImageOptions(model)
    expect(options).toMatchObject({ resolutions, thinkingLevels })
    expect(options.ratios.includes('1:8')).toBe(extended)
  })

  it('preserves explicit versions and path prefixes without adding OpenAI v1', () => {
    expect(buildGeminiApiUrl('https://example.com', 'models/custom-model')).toBe('https://example.com/v1beta/models/custom-model:generateContent')
    expect(normalizeGeminiBaseUrl('https://example.com')).toBe('https://example.com')
    expect(buildGeminiApiUrl('https://example.com/', 'custom-model')).toBe('https://example.com/models/custom-model:generateContent')
    expect(buildGeminiApiUrl('https://example.com/proxy', 'custom-model')).toBe('https://example.com/proxy/v1beta/models/custom-model:generateContent')
    expect(buildGeminiApiUrl('https://example.com/proxy/', 'custom-model')).toBe('https://example.com/proxy/models/custom-model:generateContent')
    expect(buildGeminiApiUrl('https://example.com/proxy/v1beta/', 'custom-model')).toBe('https://example.com/proxy/v1beta/models/custom-model:generateContent')
    expect(normalizeDevProxyConfig({ target: 'https://example.com/v1beta', enabled: true })?.target).toBe('https://example.com/v1beta')
    expect(parseDefaultApiUrl('https://example.com/v1beta?connectionId=gemini-generate-content').baseUrl).toBe('https://example.com/v1beta')
  })

  it('restores connection drafts and safely normalizes imported compatibility switches', () => {
    const original = createDefaultOpenAIProfile({ model: 'custom-openai', homeParams: ['quality'] })
    const gemini = switchApiProfileConnection(original, GEMINI_CONNECTION_ID)
    expect(gemini).toMatchObject({ model: DEFAULT_GEMINI_MODEL, homeParams: ['n'], transparentBackgroundMethod: 'local', codexCli: false })
    expect(switchApiProfileConnection(gemini, 'openai-images')).toMatchObject({ model: 'custom-openai', homeParams: ['quality'] })
    const imported = readProfileImport(createProfileShareJson({ ...profile, codexCli: true, streamImages: true, transparentBackgroundMethod: 'api', homeParams: ['transparent_output'], paramDefaults: { transparent_output: true } }), settings).profiles[0]
    expect(imported).toMatchObject({ connectionId: GEMINI_CONNECTION_ID, codexCli: false, streamImages: false, transparentBackgroundMethod: 'local', paramDefaults: { transparent_output: true } })
    expect(getHomeParamState(imported).visible).toEqual(['transparent_output'])
  })

  it('remembers Gemini dimensions by profile and normalizes model-dependent options', () => {
    const params = { ...DEFAULT_PARAMS, aspect_ratio: '1:8', image_size: '512' }
    expect(normalizeParamsForSettings(params, settings)).toMatchObject({ aspect_ratio: '1:8', image_size: '512' })
    expect(normalizeGeminiParams(params, 'gemini-2.5-flash-image')).toMatchObject({ aspect_ratio: 'auto', image_size: 'auto' })
    const openai = createDefaultOpenAIProfile({ id: 'openai' })
    const switched = switchHomeParams(params, {}, profile, openai)
    expect(switchHomeParams(DEFAULT_PARAMS, switched.paramsByProfile, openai, profile).params).toEqual({ ...params, thinking_level: 'default' })
    expect(normalizeHomeParams({ ...params, moderation: 'low', output_format: 'jpeg', transparent_output: true }, getActiveApiProfile(settings))).toMatchObject({ moderation: 'default', output_format: 'default', transparent_output: false })
  })
})
