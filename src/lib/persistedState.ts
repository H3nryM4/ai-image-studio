import { DEFAULT_PARAMS, type AppSettings, type FavoriteCollection, type InputImage, type MaskDraft, type PresetConfig, type TaskParams } from '../types'
import { getActiveApiProfile, normalizeSettings } from './apiProfiles'
import { ensureDefaultFavoriteCollection, normalizeFavoriteCollections, resolveDefaultFavoriteCollectionId } from './favoriteState'
import { isHttpUrl } from './imageApiShared'

export interface PersistedAppState {
  settings: AppSettings
  previousPresetConfig?: PresetConfig | null
  dismissedPresetProfileIds?: string[]
  dismissedPresetConnectionIds?: string[]
  params: TaskParams
  paramsByProfile?: Record<string, TaskParams>
  prompt?: string
  inputImages?: InputImage[]
  maskDraft?: MaskDraft | null
  maskEditorImageId?: string | null
  favoriteCollections: FavoriteCollection[]
  defaultFavoriteCollectionId: string | null
  imageSourceUrls?: Record<string, string>
}

type PersistedStateSource = PersistedAppState & {
  reusedTaskApiProfileId?: string | null
  prompt: string
  inputImages: InputImage[]
  maskDraft: MaskDraft | null
  maskEditorImageId: string | null
}

type PersistedStateFallback = Pick<PersistedAppState,
  'settings' | 'params' | 'dismissedPresetProfileIds' | 'dismissedPresetConnectionIds' | 'favoriteCollections' | 'defaultFavoriteCollectionId'
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
    ...(typeof value.aspect_ratio === 'string' ? { aspect_ratio: value.aspect_ratio } : {}),
    ...(typeof value.image_size === 'string' ? { image_size: value.image_size } : {}),
    thinking_level: typeof value.thinking_level === 'string' && ['default', 'minimal', 'medium', 'high'].includes(value.thinking_level) ? value.thinking_level as TaskParams['thinking_level'] : fallback.thinking_level,
    background: typeof value.background === 'string' && ['default', 'auto', 'opaque', 'transparent'].includes(value.background) ? value.background as TaskParams['background'] : fallback.background,
    quality: value.quality === 'default' || value.quality === 'auto' || value.quality === 'low' || value.quality === 'medium' || value.quality === 'high' || value.quality === 'xhigh' || value.quality === 'max'
      ? value.quality
      : fallback.quality,
    output_format: value.output_format === 'default' || value.output_format === 'png' || value.output_format === 'jpeg' || value.output_format === 'webp' || value.output_format === 'svg' || value.output_format === 'gif' ? value.output_format : fallback.output_format,
    complexity: value.complexity === 'default' || value.complexity === 'low' || value.complexity === 'medium' || value.complexity === 'high' ? value.complexity : fallback.complexity,
    frame_count: typeof value.frame_count === 'number' && Number.isFinite(value.frame_count) ? Math.min(16, Math.max(2, Math.round(value.frame_count))) : fallback.frame_count,
    frame_duration_ms: typeof value.frame_duration_ms === 'number' && Number.isFinite(value.frame_duration_ms) ? Math.min(2000, Math.max(20, Math.round(value.frame_duration_ms / 10) * 10)) : fallback.frame_duration_ms,
    output_compression: value.output_compression === null || (typeof value.output_compression === 'number' && Number.isFinite(value.output_compression))
      ? value.output_compression
      : fallback.output_compression,
    moderation: value.moderation === 'default' || value.moderation === 'auto' || value.moderation === 'low' ? value.moderation : fallback.moderation,
    n: typeof value.n === 'number' && Number.isFinite(value.n) ? value.n : fallback.n,
    transparent_output: typeof value.transparent_output === 'boolean' ? value.transparent_output : fallback.transparent_output,
  }
}

export function createPersistedState(state: PersistedStateSource): Partial<PersistedAppState> {
  const settings = normalizeSettings(state.settings)
  const activeProfile = getActiveApiProfile(settings)
  const effectiveProfile = settings.profiles.find((profile) => profile.id === state.reusedTaskApiProfileId) ?? activeProfile
  return {
    settings,
    previousPresetConfig: state.previousPresetConfig ?? null,
    dismissedPresetProfileIds: state.dismissedPresetProfileIds ?? [],
    dismissedPresetConnectionIds: state.dismissedPresetConnectionIds ?? [],
    params: effectiveProfile.id === activeProfile.id ? state.params : state.paramsByProfile?.[`${activeProfile.id}:${activeProfile.connectionId}`] ?? { ...DEFAULT_PARAMS, ...activeProfile.paramDefaults },
    paramsByProfile: {
      ...Object.fromEntries(Object.entries(state.paramsByProfile ?? {}).filter(([key]) => settings.profiles.some((profile) => key.startsWith(`${profile.id}:`)))),
      [`${effectiveProfile.id}:${effectiveProfile.connectionId}`]: state.params,
    },
    ...(settings.persistInputOnRestart ? {
      prompt: state.prompt,
      inputImages: state.inputImages.map((img) => ({ id: img.id, dataUrl: '', ...(img.markupImageId ? { markupImageId: img.markupImageId } : {}) })),
      maskDraft: state.maskDraft,
      maskEditorImageId: state.maskEditorImageId,
    } : {}),
    favoriteCollections: state.favoriteCollections,
    defaultFavoriteCollectionId: state.defaultFavoriteCollectionId,
    imageSourceUrls: state.imageSourceUrls,
  }
}

export function normalizePersistedState(persistedState: unknown, fallback: PersistedStateFallback, now = Date.now()) {
  if (!isRecord(persistedState)) return null
  const settings = normalizeSettings(persistedState.settings ?? fallback.settings)
  const previousPresetConfig = isRecord(persistedState.previousPresetConfig) && Array.isArray(persistedState.previousPresetConfig.profiles)
    ? (() => {
        const normalized = normalizeSettings(persistedState.previousPresetConfig)
        return {
          customConnections: normalized.customConnections,
          profiles: persistedState.previousPresetConfig.profiles.length ? normalized.profiles : [],
        }
      })()
    : null
  const inputImages = settings.persistInputOnRestart && Array.isArray(persistedState.inputImages)
    ? persistedState.inputImages.flatMap((img): InputImage[] => isRecord(img) && typeof img.id === 'string' ? [{ id: img.id, dataUrl: '', ...(typeof img.markupImageId === 'string' && img.markupImageId ? { markupImageId: img.markupImageId } : {}) }] : [])
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
    dismissedPresetConnectionIds: normalizeStringArray(persistedState.dismissedPresetConnectionIds, fallback.dismissedPresetConnectionIds ?? []),
    params: normalizeParams(persistedState.params, fallback.params),
    paramsByProfile: isRecord(persistedState.paramsByProfile)
      ? Object.fromEntries(Object.entries(persistedState.paramsByProfile)
        .filter(([key]) => settings.profiles.some((profile) => key.startsWith(`${profile.id}:`)))
        .map(([key, value]) => [key, normalizeParams(value, fallback.params)]))
      : {},
    favoriteCollections,
    defaultFavoriteCollectionId: resolveDefaultFavoriteCollectionId(favoriteCollections, preferredDefaultFavoriteCollectionId),
    imageSourceUrls: isRecord(persistedState.imageSourceUrls)
      ? Object.fromEntries(Object.entries(persistedState.imageSourceUrls).filter((entry): entry is [string, string] => isHttpUrl(entry[1])))
      : {},
    prompt: settings.persistInputOnRestart && typeof persistedState.prompt === 'string' ? persistedState.prompt : '',
    inputImages,
    maskDraft,
    maskEditorImageId: settings.persistInputOnRestart && typeof persistedState.maskEditorImageId === 'string'
      && inputImages.some((img) => img.id === persistedState.maskEditorImageId) ? persistedState.maskEditorImageId : null,
  }
}
