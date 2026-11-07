import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PARAMS, type ApiProfile } from '../types'
import { callImageApi } from './api'
import { createDefaultOpenAIProfile, normalizeSettings } from './apiProfiles'
import * as canvasImage from './canvasImage'
import { getApiErrorMessage } from './imageApiShared'
import { callOpenAICompatibleImageApi } from './openaiCompatibleImageApi'
import { normalizeParamsForSettings } from './paramCompatibility'

const PNG = 'data:image/png;base64,aW1hZ2U='
const MARKUP = 'data:image/png;base64,bWFya3Vw'
const nativeFetch = globalThis.fetch

function createSettings(patch: Partial<ApiProfile> = {}) {
  const profile = createDefaultOpenAIProfile({ model: 'gpt-image-2.6-sunburst', apiKey: 'test-key', ...patch })
  return normalizeSettings({ profiles: [profile], activeProfileId: profile.id })
}

function mockImages(format: 'svg' | 'gif' | 'png' = 'png') {
  const b64 = format === 'svg' ? 'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=' : format === 'gif' ? 'R0lGODlh' : 'iVBORw0KGgo='
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (String(url).startsWith('data:')) return nativeFetch(url, init)
    return new Response(JSON.stringify({ data: [{ b64_json: b64 }] }))
  })
}

afterEach(() => vi.restoreAllMocks())

describe('GPT Image 2.6 requests', () => {
  it('generates SVG with the requested authoring model and vector MIME', async () => {
    const fetchMock = mockImages('svg')
    const result = await callImageApi({
      settings: createSettings({ streamImages: true, streamPartialImages: 3, svgModel: 'gpt-6-luna' }),
      prompt: '画一个矢量图标',
      params: { ...DEFAULT_PARAMS, output_format: 'svg', output_compression: 80, complexity: 'high' },
      inputImageDataUrls: [],
    })
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body).toMatchObject({ output_format: 'svg', complexity: 'high', svg: { model: 'gpt-6-luna' } })
    for (const key of ['stream', 'partial_images', 'output_compression', 'frame_count', 'frame_duration_ms']) expect(body).not.toHaveProperty(key)
    expect(body.n ?? 1).toBe(1)
    expect(result.images[0]).toMatch(/^data:image\/svg\+xml;base64,/)
    expect(result.actualParamsList?.[0]?.output_format).toBe('svg')
  })

  it('leaves the SVG model and complexity to the interface when unspecified', async () => {
    const fetchMock = mockImages('svg')
    await callImageApi({ settings: createSettings({ svgModel: '' }), prompt: '图标', params: { ...DEFAULT_PARAMS, output_format: 'svg' }, inputImageDataUrls: [] })
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body).not.toHaveProperty('svg')
    expect(body).not.toHaveProperty('complexity')
  })

  it('normalizes SVG count for the UI and rejects direct multi-image requests', async () => {
    const fetchMock = mockImages('svg')
    const settings = createSettings()
    const params = { ...DEFAULT_PARAMS, output_format: 'svg' as const, n: 4 }
    expect(normalizeParamsForSettings(params, settings).n).toBe(1)
    await expect(callImageApi({ settings, prompt: '图标', params, inputImageDataUrls: [] })).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects SVG reference editing before submitting an image request', async () => {
    const fetchMock = mockImages('svg')
    await expect(callImageApi({ settings: createSettings(), prompt: '修改', params: { ...DEFAULT_PARAMS, output_format: 'svg' }, inputImageDataUrls: [PNG] })).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('generates GIF with frame settings and animation MIME without streaming or compression', async () => {
    const fetchMock = mockImages('gif')
    const result = await callImageApi({
      settings: createSettings({ streamImages: true, streamPartialImages: 2 }),
      prompt: '挥手动图',
      params: { ...DEFAULT_PARAMS, output_format: 'gif', frame_count: 7, frame_duration_ms: 120, output_compression: 75 },
      inputImageDataUrls: [],
    })
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body).toMatchObject({ output_format: 'gif', frame_count: 7, frame_duration_ms: 120 })
    for (const key of ['stream', 'partial_images', 'output_compression', 'complexity', 'svg']) expect(body).not.toHaveProperty(key)
    expect(result.images[0]).toMatch(/^data:image\/gif;base64,/)
    expect(result.actualParamsList?.[0]?.output_format).toBe('gif')
  })

  it.each([
    [1, 1, 2, 20],
    [999, 9999, 16, 2000],
    [9, 117, 9, 120],
  ])('normalizes GIF frame count %s and duration %s to supported bounds', (frameCount, duration, expectedCount, expectedDuration) => {
    expect(normalizeParamsForSettings({ ...DEFAULT_PARAMS, output_format: 'gif', frame_count: frameCount, frame_duration_ms: duration }, createSettings())).toMatchObject({ frame_count: expectedCount, frame_duration_ms: expectedDuration })
  })

  it('rejects GIF masks before submitting an image request', async () => {
    const fetchMock = mockImages('gif')
    await expect(callImageApi({ settings: createSettings(), prompt: '局部修改', params: { ...DEFAULT_PARAMS, output_format: 'gif' }, inputImageDataUrls: [PNG], maskDataUrl: PNG })).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not send 2.6-only fields to a GPT Image 2.5 model', async () => {
    const fetchMock = mockImages()
    await callImageApi({ settings: createSettings({ model: 'gpt-image-2.5-sunburst', svgModel: 'gpt-6-luna' }), prompt: '猫', params: { ...DEFAULT_PARAMS, complexity: 'high', quality: 'max' }, inputImageDataUrls: [] })
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body.quality).toBe('max')
    for (const key of ['complexity', 'svg', 'frame_count', 'frame_duration_ms']) expect(body).not.toHaveProperty(key)
  })

  it('sends a separate markup file alongside the first reference image', async () => {
    const fetchMock = mockImages()
    await callImageApi({ settings: createSettings(), prompt: '按标注修改', params: { ...DEFAULT_PARAMS, complexity: 'medium' }, inputImageDataUrls: [PNG], markupDataUrl: MARKUP })
    const form = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/images/edits'))?.[1]?.body as FormData
    expect(form.getAll('image[]')).toHaveLength(1)
    expect(form.get('markup')).toBeInstanceOf(Blob)
    expect(await (form.get('markup') as Blob).text()).toBe('markup')
    expect(form.get('complexity')).toBe('medium')
    expect(form.has('mask')).toBe(false)
  })

  it('never sends markup and mask together through the direct Images request', async () => {
    const fetchMock = mockImages()
    vi.spyOn(canvasImage, 'imageDataUrlToPngBlob').mockResolvedValue(new Blob(['input'], { type: 'image/png' }))
    const settings = createSettings()
    await callOpenAICompatibleImageApi({ settings, prompt: '局部修改', params: DEFAULT_PARAMS, inputImageDataUrls: [PNG], maskDataUrl: PNG, markupDataUrl: MARKUP }, settings.profiles[0])
    const form = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/images/edits'))?.[1]?.body as FormData
    expect(form.has('mask')).toBe(true)
    expect(form.has('markup')).toBe(false)
  })
})

describe('moderation error details', () => {
  it('explains which stage and categories triggered a moderation failure', async () => {
    const msg = await getApiErrorMessage(new Response(JSON.stringify({
      error: { message: 'moderation blocked', moderation_details: { moderation_stage: 'input', categories: ['violence', 'sexual'] } },
    }), { status: 400 }))
    expect(msg).toContain('moderation blocked')
    expect(msg).toContain('拦截来源：提示词或参考图')
    expect(msg).toContain('类别：violence、sexual')
  })
})
