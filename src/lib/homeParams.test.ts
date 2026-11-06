import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PARAMS, HOME_PARAM_KEYS } from '../types'
import { callImageApi } from './api'
import { createDefaultOpenAIProfile, getActiveApiProfile, normalizeSettings } from './apiProfiles'
import { getHomeParamState, normalizeHomeParams, switchHomeParams } from './homeParams'
import { createProfileShareJson, readProfileImport } from './profileSharing'
import { createCustomProfileImportUrl } from './profileImportUrl'

afterEach(() => vi.restoreAllMocks())

describe('home parameters', () => {
  it('uses profile defaults for hidden fields and keeps WebP compression with transparency', () => {
    const profile = createDefaultOpenAIProfile({ homeParams: [], paramDefaults: { output_format: 'webp', output_compression: 75, transparent_output: true, moderation: 'auto', quality: 'high' } })
    expect(normalizeHomeParams({ ...DEFAULT_PARAMS, moderation: 'low' }, profile)).toMatchObject(profile.paramDefaults!)
    const restored = readProfileImport(createProfileShareJson(profile), normalizeSettings({ profiles: [profile] })).profiles[0]
    expect(restored.paramDefaults).toEqual(profile.paramDefaults)
  })

  it('validates imported defaults without accepting unrelated task fields', () => {
    const profile = normalizeSettings({ profiles: [{ ...createDefaultOpenAIProfile(), paramDefaults: { quality: 'invalid', output_format: 'gif', n: 999, moderation: 'off', output_compression: 200, transparent_output: 'true' } }] }).profiles[0]
    expect(profile.paramDefaults).toEqual({ output_compression: 100 })
  })

  it('restores each profile selection without carrying choices to another channel', () => {
    const first = createDefaultOpenAIProfile({ id: 'first' })
    const second = createDefaultOpenAIProfile({ id: 'second', paramDefaults: { quality: 'low' } })
    const switched = switchHomeParams({ ...DEFAULT_PARAMS, quality: 'high', size: '1536x1024' }, {}, first, second)
    expect(switched.params).toMatchObject({ quality: 'low', size: 'auto' })
    expect(switchHomeParams({ ...switched.params, n: 2 }, switched.paramsByProfile, second, first).params).toMatchObject({ quality: 'high', size: '1536x1024', n: 1 })
  })

  it('ignores unused GET bodies and preserves zero and false defaults', () => {
    const profile = createDefaultOpenAIProfile({ connectionId: 'custom', homeParams: [], paramDefaults: { output_format: 'webp', output_compression: 0, transparent_output: false } })
    const connection = { id: 'custom', name: 'GET', submit: { path: 'generate', method: 'GET' as const, body: { quality: '$params.quality' }, query: { format: '$params.output_format', compression: '$params.output_compression' } } }
    expect(getHomeParamState(profile, connection).available).toEqual(['output_format', 'output_compression'])
    expect(normalizeHomeParams({ ...DEFAULT_PARAMS, transparent_output: true }, profile, connection)).toMatchObject({ output_format: 'webp', output_compression: 0, transparent_output: false })
  })

  it('sends hidden defaults inside the Responses image tool, without legacy response_format', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ output: [{ type: 'image_generation_call', result: 'aW1hZ2U=' }] })))
    const profile = createDefaultOpenAIProfile({ connectionId: 'openai-responses', streamImages: false, responseFormatB64Json: true, homeParams: [], paramDefaults: { output_format: 'webp', output_compression: 65, quality: 'high' } })
    const settings = normalizeSettings({ profiles: [profile] })
    await callImageApi({ settings, prompt: '画猫', inputImageDataUrls: [], params: normalizeHomeParams(DEFAULT_PARAMS, profile) })
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]!.body))
    expect(body.tools[0]).toMatchObject({ quality: 'high', output_format: 'webp', output_compression: 65 })
    expect(body.response_format).toBeUndefined()
    expect(body.quality).toBeUndefined()
  })

  it('defaults old profiles to quality and preserves an explicit empty selection through sharing', () => {
    const settings = normalizeSettings({ profiles: [{ ...createDefaultOpenAIProfile(), homeParams: undefined }] })
    expect(settings.profiles[0].homeParams).toEqual(['quality'])

    const profile = { ...settings.profiles[0], homeParams: [] }
    const json = createProfileShareJson(profile)
    expect(readProfileImport(json, settings).profiles[0].homeParams).toEqual([])
    const url = createCustomProfileImportUrl('https://studio.example.com', profile, undefined, { includeApiKey: false, useNewApiAddress: false, useNewApiKey: false, useNewApiModel: false })
    expect(readProfileImport(url, settings).profiles[0].homeParams).toEqual([])
  })

  it('cleans untrusted display selections without changing the source array', () => {
    const homeParams = ['quality', 'invalid', 'moderation', 'quality']
    const settings = normalizeSettings({ profiles: [{ ...createDefaultOpenAIProfile(), homeParams }] })
    expect(settings.profiles[0].homeParams).toEqual(['quality', 'moderation'])
    expect(homeParams).toEqual(['quality', 'invalid', 'moderation', 'quality'])
  })

  it('resets hidden advanced values while keeping visible quality and common parameters', () => {
    expect(normalizeHomeParams({ ...DEFAULT_PARAMS, size: '1536x1024', n: 3, quality: 'high', output_format: 'webp', output_compression: 80, moderation: 'low', transparent_output: true }, createDefaultOpenAIProfile())).toEqual({
      ...DEFAULT_PARAMS, size: '1536x1024', n: 3, quality: 'high',
    })
  })

  it('uses the active custom template and keeps fixed request fields out of home controls', () => {
    const settings = normalizeSettings({
      customConnections: [{
        id: 'custom-image', name: '自定义',
        submit: { path: 'generate', query: { count: '$params.n' }, body: { prompt: '$prompt', output_format: 'webp', rendering: { quality: '$params.quality' } } },
        editSubmit: { path: 'edit', body: { prompt: '$prompt', size: '$params.size' } },
      }],
      profiles: [createDefaultOpenAIProfile({ connectionId: 'custom-image', homeParams: [...HOME_PARAM_KEYS] })],
    })
    const profile = getActiveApiProfile(settings)
    const connection = settings.customConnections[0]
    expect(getHomeParamState(profile, connection).available).toEqual(['quality', 'n', 'transparent_output'])
    expect(getHomeParamState(profile, connection, true).available).toEqual(['size', 'transparent_output'])
    expect(normalizeHomeParams({ ...DEFAULT_PARAMS, n: 4, quality: 'high' }, profile, connection, true)).toEqual(DEFAULT_PARAMS)
  })

  it('keeps template constants and omits unmapped fields from a custom request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: 'aW1hZ2U=' }] })))
    const settings = normalizeSettings({
      customConnections: [{
        id: 'custom-image', name: '自定义',
        submit: { path: 'generate', body: { prompt: '$prompt', model: '$profile.model', output_format: 'webp', size: '$params.size' } },
      }],
      profiles: [createDefaultOpenAIProfile({ connectionId: 'custom-image', apiKey: 'test-key', baseUrl: 'https://example.com/', homeParams: [...HOME_PARAM_KEYS] })],
    })
    const profile = getActiveApiProfile(settings)
    await callImageApi({
      settings, prompt: '画一只猫', inputImageDataUrls: [],
      params: normalizeHomeParams({ ...DEFAULT_PARAMS, size: '1024x1024', moderation: 'low', quality: 'high' }, profile, settings.customConnections[0]),
    })
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({ prompt: '画一只猫', model: profile.model, output_format: 'webp', size: '1024x1024' })
  })

  it('retains official request defaults when all advanced home controls are hidden', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: 'aW1hZ2U=' }] })))
    const settings = normalizeSettings({ profiles: [createDefaultOpenAIProfile({ apiKey: 'test-key', baseUrl: 'https://example.com/v1', streamImages: false, homeParams: [] })] })
    await callImageApi({ settings, prompt: '画一只猫', inputImageDataUrls: [], params: normalizeHomeParams({ ...DEFAULT_PARAMS, moderation: 'low', output_format: 'webp' }, getActiveApiProfile(settings)) })
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toMatchObject({ quality: 'auto', moderation: 'auto', output_format: 'png' })
  })
})
