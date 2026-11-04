import type { ApiProfile, AppSettings } from '../types'
import { normalizeBaseUrl } from './devProxy'
import {
  createDefaultOpenAIProfile,
  DEFAULT_IMAGES_MODEL,
  DEFAULT_RESPONSES_MODEL,
  findEquivalentApiProfile,
  mergeImportedSettings,
  normalizeModelList,
  normalizeSettings,
  normalizeReasoningEffort,
  normalizeStreamPartialImages,
  isApiConnectionAvailable,
} from './apiProfiles'
import { isPresetConfigOnlyEnabled, isPresetConfigParamsLocked, isPresetProfile } from './presetConfig'

const URL_SETTING_KEYS = ['settings', 'profileId', 'apiUrl', 'apiKey', 'codexCli', 'connectionId', 'model', 'imageGenerationModel', 'profileName', 'reasoningEffort', 'streamImages', 'streamPartialImages', 'transparentBackgroundMethod']

function getProfileDedupKey(profile: ApiProfile) {
  return JSON.stringify([
    profile.connectionId,
    profile.baseUrl.trim().toLowerCase(),
    profile.apiKey.trim(),
    // URL 新建的配置尚未规整，按规整后的模型列表比较才能命中已保存的配置
    normalizeModelList(profile.model),
    profile.imageGenerationModel?.trim(),
    profile.reasoningEffort,
    profile.codexCli === true,
    profile.streamImages === true,
    profile.streamPartialImages ?? 0,
    profile.transparentBackgroundMethod,
  ])
}

function createUrlProfileId(usedIds: Set<string>) {
  let id = `openai-url-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  while (usedIds.has(id)) {
    id = `openai-url-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  }
  usedIds.add(id)
  return id
}

function pickUrlSettingsPayload(value: unknown): unknown | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  return {
    customConnections: record.customConnections,
    profiles: record.profiles,
  }
}

export function getUrlSettingsPayload(searchParams: URLSearchParams): unknown | null {
  const raw = searchParams.get('settings')
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && 'settings' in parsed) {
      return pickUrlSettingsPayload((parsed as { settings?: unknown }).settings ?? null)
    }
    return pickUrlSettingsPayload(parsed)
  } catch {
    return null
  }
}

export function getExplicitUrlSettingsIds(searchParams: URLSearchParams) {
  const connectionIds = new Set<string>()
  const profileIds = new Set<string>()
  const payload = getUrlSettingsPayload(searchParams)
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>
    if (Array.isArray(record.customConnections)) {
      for (const item of record.customConnections) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue
        const id = typeof (item as Record<string, unknown>).id === 'string' ? String((item as Record<string, unknown>).id).trim() : ''
        if (id) connectionIds.add(id)
      }
    }
    if (Array.isArray(record.profiles)) {
      for (const item of record.profiles) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue
        const id = typeof (item as Record<string, unknown>).id === 'string' ? String((item as Record<string, unknown>).id).trim() : ''
        if (id) profileIds.add(id)
      }
    }
  }
  const profileId = searchParams.get('profileId')?.trim()
  if (profileId) profileIds.add(profileId)
  return { connectionIds: [...connectionIds], profileIds: [...profileIds] }
}

function ensureUrlSettingsProfileIds(value: unknown, currentSettings: Partial<AppSettings> | unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const record = value as Record<string, unknown>
  if (!Array.isArray(record.profiles)) return value
  const usedIds = new Set(normalizeSettings(currentSettings).profiles.map((profile) => profile.id))
  const emittedIds = new Set<string>()
  for (const item of record.profiles) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const id = typeof (item as { id?: unknown }).id === 'string' ? (item as { id: string }).id.trim() : ''
    if (id) usedIds.add(id)
  }
  return {
    ...record,
    profiles: record.profiles.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return item
      const profile = item as Record<string, unknown>
      if (typeof profile.id === 'string' && profile.id.trim() && !emittedIds.has(profile.id.trim())) {
        emittedIds.add(profile.id.trim())
        return { ...profile, id: profile.id.trim() }
      }
      return { ...profile, id: createUrlProfileId(usedIds) }
    }),
  }
}

export function activateFirstImportedProfile(settings: AppSettings, importedSettings: unknown): AppSettings {
  if (!importedSettings || typeof importedSettings !== 'object' || Array.isArray(importedSettings)) return settings

  const record = importedSettings as Record<string, unknown>
  if (!Array.isArray(record.profiles) || record.profiles.length === 0) return settings

  const imported = normalizeSettings({
    customConnections: record.customConnections,
    profiles: record.profiles,
  })
  const importedProfile = imported.profiles[0]
  const importedById = settings.profiles.find((profile) => profile.id === importedProfile.id)
  if (importedById) return normalizeSettings({ ...settings, activeProfileId: importedById.id })
  const activeProfile = findEquivalentApiProfile(settings, importedProfile, imported.customConnections)

  return activeProfile
    ? normalizeSettings({ ...settings, activeProfileId: activeProfile.id })
    : settings
}

function readUrlProfilePatch(searchParams: URLSearchParams): Partial<ApiProfile> {
  const patch: Partial<ApiProfile> = {}
  const connectionId = searchParams.get('connectionId')?.trim()
  const baseUrl = searchParams.get('apiUrl')
  const apiKey = searchParams.get('apiKey')
  const model = searchParams.get('model')?.trim()
  const imageGenerationModel = searchParams.get('imageGenerationModel')
  const name = searchParams.get('profileName')?.trim()
  const reasoningEffort = searchParams.get('reasoningEffort')
  const codexCli = searchParams.get('codexCli')
  const streamImages = searchParams.get('streamImages')
  const streamPartialImages = searchParams.get('streamPartialImages')
  const transparentBackgroundMethod = searchParams.get('transparentBackgroundMethod')
  if (connectionId) patch.connectionId = connectionId
  if (baseUrl !== null) patch.baseUrl = normalizeBaseUrl(baseUrl.trim())
  if (apiKey !== null) patch.apiKey = apiKey.trim()
  if (model) patch.model = model
  if (imageGenerationModel !== null) patch.imageGenerationModel = imageGenerationModel.trim()
  if (name) patch.name = name
  if (reasoningEffort !== null) patch.reasoningEffort = normalizeReasoningEffort(reasoningEffort)
  if (codexCli !== null) patch.codexCli = codexCli.trim().toLowerCase() === 'true'
  if (streamImages !== null) patch.streamImages = streamImages.trim().toLowerCase() === 'true'
  if (streamPartialImages !== null) patch.streamPartialImages = normalizeStreamPartialImages(streamPartialImages)
  if (transparentBackgroundMethod === 'api' || transparentBackgroundMethod === 'local') {
    patch.transparentBackgroundMethod = transparentBackgroundMethod
  }
  return patch
}

function buildPresetConfigOnlySettingsFromUrlParams(currentSettings: Partial<AppSettings> | unknown, searchParams: URLSearchParams, apiKeyOnly = false): Partial<AppSettings> {
  const settings = normalizeSettings(currentSettings)
  const requestedId = searchParams.get('profileId')?.trim()
  const requested = requestedId && isPresetProfile(requestedId)
    ? settings.profiles.find((profile) => profile.id === requestedId)
    : undefined
  if (requestedId && !requested) return {}
  const target = requested ?? settings.profiles.find((profile) => profile.id === settings.activeProfileId) ?? settings.profiles[0]
  const payload = getUrlSettingsPayload(searchParams) as { profiles?: unknown[] } | null
  const matched = Array.isArray(payload?.profiles) ? payload.profiles.find((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false
    const profile = item as Record<string, unknown>
    return profile.connectionId === target.connectionId && (!requested || profile.id === requested.id)
  }) as Partial<ApiProfile> | undefined : undefined
  const query = readUrlProfilePatch(searchParams)
  const imported = matched ? normalizeSettings({ ...settings, profiles: [{ ...target, ...matched }] }).profiles[0] : null
  const patch = apiKeyOnly
    ? { ...(imported ? { apiKey: imported.apiKey } : {}), ...(query.apiKey !== undefined ? { apiKey: query.apiKey } : {}) }
    : { ...imported, ...query }
  if (!matched && Object.keys(query).length === 0 && !requested) return {}

  return normalizeSettings({
    ...settings,
    profiles: settings.profiles.map((profile) => profile.id === target.id
      ? { ...profile, ...patch, id: profile.id, connectionId: profile.connectionId, isDefault: profile.isDefault }
      : profile),
    activeProfileId: target.id,
  })
}

export function hasUrlSettingParams(searchParams: URLSearchParams) {
  return URL_SETTING_KEYS.some((key) => searchParams.has(key))
}

export function clearUrlSettingParams(searchParams: URLSearchParams) {
  for (const key of URL_SETTING_KEYS) searchParams.delete(key)
}

function buildRegularSettingsFromUrlParams(currentSettings: Partial<AppSettings> | unknown, searchParams: URLSearchParams): Partial<AppSettings> {
  const imported = ensureUrlSettingsProfileIds(getUrlSettingsPayload(searchParams), currentSettings)
  const settings = imported == null
    ? normalizeSettings(currentSettings)
    : activateFirstImportedProfile(mergeImportedSettings(currentSettings, imported), imported)
  const requestedId = searchParams.get('profileId')?.trim()
  const patch = readUrlProfilePatch(searchParams)
  if (patch.connectionId && !isApiConnectionAvailable(settings, patch.connectionId)) return {}
  const requested = settings.profiles.find((profile) => profile.id === requestedId)
  const keys = Object.keys(patch)
  if (!keys.length) {
    if (requested) return normalizeSettings({ ...settings, activeProfileId: requested.id })
    return imported == null ? {} : settings
  }
  const target = requested ?? (keys.length === 1 && patch.transparentBackgroundMethod
    ? settings.profiles.find((profile) => profile.id === settings.activeProfileId)
    : null)
  if (target) {
    return normalizeSettings({
      ...settings,
      profiles: settings.profiles.map((profile) => profile.id === target.id ? { ...profile, ...patch } : profile),
      activeProfileId: target.id,
    })
  }

  const connectionId = patch.connectionId ?? 'openai-images'
  const profile = createDefaultOpenAIProfile({
    id: requestedId || createUrlProfileId(new Set(settings.profiles.map((profile) => profile.id))),
    name: 'URL 参数配置',
    connectionId,
    model: connectionId === 'openai-responses' ? DEFAULT_RESPONSES_MODEL : DEFAULT_IMAGES_MODEL,
    ...patch,
  })
  const existing = settings.profiles.find((item) => getProfileDedupKey(item) === getProfileDedupKey(profile) && (!patch.name || item.name.trim() === patch.name))
  if (existing) return normalizeSettings({ ...settings, activeProfileId: existing.id })
  return normalizeSettings({ ...settings, profiles: [...settings.profiles, profile], activeProfileId: profile.id })
}

export function buildSettingsFromUrlParams(currentSettings: Partial<AppSettings> | unknown, searchParams: URLSearchParams): Partial<AppSettings> {
  return isPresetConfigOnlyEnabled()
    ? buildPresetConfigOnlySettingsFromUrlParams(currentSettings, searchParams, isPresetConfigParamsLocked())
    : buildRegularSettingsFromUrlParams(currentSettings, searchParams)
}
