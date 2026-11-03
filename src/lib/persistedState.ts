import type { AppSettings, FavoriteCollection, InputImage, MaskDraft, PresetConfig, TaskParams } from '../types'
import { normalizeSettings } from './apiProfiles'
import { ensureDefaultFavoriteCollection, normalizeFavoriteCollections, resolveDefaultFavoriteCollectionId } from './favoriteState'

export interface PersistedAppState {
  settings: AppSettings
  previousPresetConfig?: PresetConfig | null
  dismissedPresetProfileIds?: string[]
  dismissedPresetProviderIds?: string[]
  params: TaskParams
  prompt?: string
  inputImages?: InputImage[]
  maskDraft?: MaskDraft | null
  maskEditorImageId?: string | null
  dismissedCodexCliPrompts: string[]
  favoriteCollections: FavoriteCollection[]
  defaultFavoriteCollectionId: string | null
}

type PersistedStateSource = PersistedAppState & {
  prompt: string
  inputImages: InputImage[]
  maskDraft: MaskDraft | null
  maskEditorImageId: string | null
}

type PersistedStateFallback = Pick<PersistedAppState,
  'settings' | 'params' | 'dismissedPresetProfileIds' | 'dismissedPresetProviderIds' | 'dismissedCodexCliPrompts' | 'favoriteCollections' | 'defaultFavoriteCollectionId'
>

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function normalizeStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback
  return value.filter((item): item is string => typeof item === 'string')
}

function normalizeParams(value: unknown, fallback: TaskParams): TaskParams {
  if (!isRecord(value)) return fallback
  return {
    size: typeof value.size === 'string' ? value.size : fallback.size,
    quality: value.quality === 'auto' || value.quality === 'low' || value.quality === 'medium' || value.quality === 'high' || value.quality === 'xhigh' || value.quality === 'max'
      ? value.quality
      : fallback.quality,
    output_format: value.output_format === 'png' || value.output_format === 'jpeg' || value.output_format === 'webp' ? value.output_format : fallback.output_format,
    output_compression: value.output_compression === null || (typeof value.output_compression === 'number' && Number.isFinite(value.output_compression))
      ? value.output_compression
      : fallback.output_compression,
    moderation: value.moderation === 'auto' || value.moderation === 'low' ? value.moderation : fallback.moderation,
    n: typeof value.n === 'number' && Number.isFinite(value.n) ? value.n : fallback.n,
    transparent_output: typeof value.transparent_output === 'boolean' ? value.transparent_output : fallback.transparent_output,
  }
}

export function createPersistedState(state: PersistedStateSource): Partial<PersistedAppState> {
  const settings = normalizeSettings(state.settings)
  return {
    settings,
    previousPresetConfig: state.previousPresetConfig ?? null,
    dismissedPresetProfileIds: state.dismissedPresetProfileIds ?? [],
    dismissedPresetProviderIds: state.dismissedPresetProviderIds ?? [],
    params: state.params,
    ...(settings.persistInputOnRestart ? {
      prompt: state.prompt,
      inputImages: state.inputImages.map((img) => ({ id: img.id, dataUrl: '' })),
      maskDraft: state.maskDraft,
      maskEditorImageId: state.maskEditorImageId,
    } : {}),
    dismissedCodexCliPrompts: state.dismissedCodexCliPrompts,
    favoriteCollections: state.favoriteCollections,
    defaultFavoriteCollectionId: state.defaultFavoriteCollectionId,
  }
}

export function normalizePersistedState(persistedState: unknown, fallback: PersistedStateFallback, now = Date.now()) {
  if (!isRecord(persistedState)) return null
  const settings = normalizeSettings(persistedState.settings ?? fallback.settings)
  const previousPresetConfig = isRecord(persistedState.previousPresetConfig) && Array.isArray(persistedState.previousPresetConfig.profiles)
    ? (() => {
        const normalized = normalizeSettings(persistedState.previousPresetConfig)
        return {
          customProviders: normalized.customProviders,
          profiles: persistedState.previousPresetConfig.profiles.length ? normalized.profiles : [],
        }
      })()
    : null
  const inputImages = settings.persistInputOnRestart && Array.isArray(persistedState.inputImages)
    ? persistedState.inputImages.flatMap((img): InputImage[] => isRecord(img) && typeof img.id === 'string' ? [{ id: img.id, dataUrl: '' }] : [])
    : []
  const mask = persistedState.maskDraft
  const maskDraft = settings.persistInputOnRestart && isRecord(mask) && typeof mask.targetImageId === 'string'
    && typeof mask.maskDataUrl === 'string' && typeof mask.updatedAt === 'number' && Number.isFinite(mask.updatedAt)
    && inputImages.some((img) => img.id === mask.targetImageId)
    ? { targetImageId: mask.targetImageId, maskDataUrl: mask.maskDataUrl, updatedAt: mask.updatedAt }
    : null
  const favoriteCollections = Array.isArray(persistedState.favoriteCollections)
    ? ensureDefaultFavoriteCollection(normalizeFavoriteCollections(persistedState.favoriteCollections, now), now)
    : fallback.favoriteCollections
  const preferredDefaultFavoriteCollectionId = persistedState.defaultFavoriteCollectionId === null || typeof persistedState.defaultFavoriteCollectionId === 'string'
    ? persistedState.defaultFavoriteCollectionId
    : fallback.defaultFavoriteCollectionId
  return {
    settings,
    previousPresetConfig,
    dismissedPresetProfileIds: normalizeStringArray(persistedState.dismissedPresetProfileIds, fallback.dismissedPresetProfileIds ?? []),
    dismissedPresetProviderIds: normalizeStringArray(persistedState.dismissedPresetProviderIds, fallback.dismissedPresetProviderIds ?? []),
    params: normalizeParams(persistedState.params, fallback.params),
    dismissedCodexCliPrompts: normalizeStringArray(persistedState.dismissedCodexCliPrompts, fallback.dismissedCodexCliPrompts),
    favoriteCollections,
    defaultFavoriteCollectionId: resolveDefaultFavoriteCollectionId(favoriteCollections, preferredDefaultFavoriteCollectionId),
    prompt: settings.persistInputOnRestart && typeof persistedState.prompt === 'string' ? persistedState.prompt : '',
    inputImages,
    maskDraft,
    maskEditorImageId: settings.persistInputOnRestart && typeof persistedState.maskEditorImageId === 'string'
      && inputImages.some((img) => img.id === persistedState.maskEditorImageId) ? persistedState.maskEditorImageId : null,
  }
}
