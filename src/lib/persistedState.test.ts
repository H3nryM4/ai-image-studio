import { describe, expect, it } from 'vitest'
import type { AppSettings, FavoriteCollection } from '../types'
import { DEFAULT_PARAMS } from '../types'
import { DEFAULT_SETTINGS, normalizeSettings } from './apiProfiles'
import { createPersistedState, normalizePersistedState } from './persistedState'

const imageA = { id: 'image-a', dataUrl: 'data:image/png;base64,image-a' }
const collectionA: FavoriteCollection = { id: 'collection-a', name: '收藏夹 A', createdAt: 1, updatedAt: 1 }

function source(settings: AppSettings = DEFAULT_SETTINGS) {
  return {
    settings,
    params: { ...DEFAULT_PARAMS },
    prompt: '画廊输入',
    inputImages: [imageA],
    maskDraft: { targetImageId: imageA.id, maskDataUrl: 'data:image/png;base64,mask', updatedAt: 1 },
    maskEditorImageId: imageA.id,
    favoriteCollections: [collectionA],
    defaultFavoriteCollectionId: collectionA.id,
    imageSourceUrls: { [imageA.id]: 'https://example.com/a.png' },
  }
}

function fallback() {
  return {
    settings: DEFAULT_SETTINGS,
    params: { ...DEFAULT_PARAMS },
    favoriteCollections: [collectionA],
    defaultFavoriteCollectionId: collectionA.id,
  }
}

describe('persisted state codec', () => {
  it('restores Gemini dimensions and per-profile selections without changing old task defaults', () => {
    const profile = { ...DEFAULT_SETTINGS.profiles[0], connectionId: 'gemini-generate-content', model: 'gemini-3.1-flash-image' }
    const settings = normalizeSettings({ profiles: [profile], activeProfileId: profile.id })
    const params = { ...DEFAULT_PARAMS, aspect_ratio: '16:9', image_size: '2K' }
    const state = { ...source(settings), params, paramsByProfile: { [`${profile.id}:gemini-generate-content`]: params } }
    const restored = normalizePersistedState(JSON.parse(JSON.stringify(createPersistedState(state))), fallback())!
    expect(restored.params).toEqual(params)
    expect(restored.paramsByProfile[`${profile.id}:gemini-generate-content`]).toEqual(params)
    expect(normalizePersistedState({ ...createPersistedState(source()), params: DEFAULT_PARAMS }, fallback())!.params).toEqual(DEFAULT_PARAMS)
  })

  it('keeps temporary task reuse from overwriting the active profile parameters on reload', () => {
    const settings = normalizeSettings({ profiles: [{ ...DEFAULT_SETTINGS.profiles[0], id: 'first' }, { ...DEFAULT_SETTINGS.profiles[0], id: 'second' }], activeProfileId: 'first' })
    const state = source(settings)
    const persisted = createPersistedState({ ...state, reusedTaskApiProfileId: 'second', params: { ...DEFAULT_PARAMS, quality: 'low' }, paramsByProfile: { 'first:openai-images': { ...DEFAULT_PARAMS, quality: 'high' } } })
    const restored = normalizePersistedState(persisted, fallback())!
    expect(restored.params.quality).toBe('high')
    expect(restored.paramsByProfile['second:openai-images'].quality).toBe('low')
  })

  it.each(['xhigh', 'max'] as const)('restores the %s GPT Image 2.5 quality level', (quality) => {
    const result = normalizePersistedState({ params: { ...DEFAULT_PARAMS, quality } }, fallback(), 100)!

    expect(result.params.quality).toBe(quality)
  })

  it('round-trips input, masks and favorite settings without persisting image payloads', () => {
    const current = source()
    const saved = createPersistedState(current)
    expect(saved.inputImages).toEqual([{ id: imageA.id, dataUrl: '' }])
    expect(JSON.stringify(saved)).not.toContain(imageA.dataUrl)
    const restored = normalizePersistedState(saved, fallback())!
    expect(restored.prompt).toBe(current.prompt)
    expect(restored.maskDraft).toEqual(current.maskDraft)
    expect(restored.maskEditorImageId).toBe(imageA.id)
    expect(restored.defaultFavoriteCollectionId).toBe(collectionA.id)
    expect(restored.imageSourceUrls).toEqual({ [imageA.id]: 'https://example.com/a.png' })
  })

  it('only restores http(s) image source links', () => {
    const restored = normalizePersistedState({
      ...source(),
      imageSourceUrls: { a: 'https://example.com/a.png', b: 'javascript:alert(1)', c: 42 },
    }, fallback())!
    expect(restored.imageSourceUrls).toEqual({ a: 'https://example.com/a.png' })
  })

  it('omits and does not restore input when restart input persistence is disabled', () => {
    const current = source(normalizeSettings({ ...DEFAULT_SETTINGS, persistInputOnRestart: false }))
    const saved = createPersistedState(current)
    for (const key of ['prompt', 'inputImages', 'maskDraft', 'maskEditorImageId']) expect(saved).not.toHaveProperty(key)
    const restored = normalizePersistedState(current, fallback())!
    expect(restored).toMatchObject({ prompt: '', inputImages: [], maskDraft: null, maskEditorImageId: null })
  })

  it('rejects unknown state shapes and validates input and mask data', () => {
    for (const value of [null, [], new Date(), new Map()]) expect(normalizePersistedState(value, fallback())).toBeNull()
    const restored = normalizePersistedState({
      ...source(),
      params: { quality: 'invalid' },
      inputImages: [null, { id: 123 }, imageA],
      maskDraft: { targetImageId: 'missing-image', maskDataUrl: 'mask', updatedAt: 1 },
      maskEditorImageId: 'missing-image',
      setPrompt: 'external-action',
    }, fallback())!
    expect(restored.params).toEqual(DEFAULT_PARAMS)
    expect(restored.inputImages).toEqual([{ id: imageA.id, dataUrl: '' }])
    expect(restored.maskDraft).toBeNull()
    expect(restored.maskEditorImageId).toBeNull()
    expect(restored).not.toHaveProperty('setPrompt')
  })

  it('preserves an empty deployed profile snapshot', () => {
    const restored = normalizePersistedState({ previousPresetConfig: { profiles: [], customConnections: [] } }, fallback())!
    expect(restored.previousPresetConfig).toEqual({ profiles: [], customConnections: [] })
  })
})
