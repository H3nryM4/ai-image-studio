import type { ApiProfile, AppSettings, CustomConnectionDefinition, PresetConfig } from '../types'
import { readRuntimeEnv } from './runtimeEnv'

const RAW_SHOW_PRESET_CONFIG_ONLY = readRuntimeEnv(import.meta.env.VITE_SHOW_PRESET_CONFIG_ONLY)
const SHOW_PRESET_CONFIG_ONLY = (RAW_SHOW_PRESET_CONFIG_ONLY || readRuntimeEnv(import.meta.env.VITE_SHOW_DEFAULT_CONFIG_ONLY)) === 'true'
const LOCK_PRESET_CONFIG_PARAMS = readRuntimeEnv(import.meta.env.VITE_LOCK_PRESET_CONFIG_PARAMS) === 'true'
const PREVENT_PRESET_CONFIG_DELETION = readRuntimeEnv(import.meta.env.VITE_PREVENT_PRESET_CONFIG_DELETION) === 'true'

let presetProfiles: ApiProfile[] = []
let presetConnections: CustomConnectionDefinition[] = []
let presetProfileFields: Record<string, string[]> | undefined
let defaultPresetProfileId: string | null = null

export function setPresetConfig(settings: PresetConfig & {
  presetProfileFields?: Record<string, string[]>
} | null) {
  presetProfiles = settings?.profiles.map((profile) => ({ ...profile })) ?? []
  presetConnections = settings?.customConnections.map((connection) => ({ ...connection })) ?? []
  presetProfileFields = settings?.presetProfileFields
  defaultPresetProfileId = presetProfiles.length === 1
    ? presetProfiles[0].id
    : presetProfiles.find((profile) => profile.isDefault === true)?.id ?? null
}

export function getPresetProfileIds() {
  return new Set(presetProfiles.map((profile) => profile.id))
}

export function getPresetProfileDescription(id: string) {
  return presetProfiles.find((profile) => profile.id === id)?.description
}

export function getPresetConnectionIds() {
  return new Set(presetConnections.map((connection) => connection.id))
}

export function getPresetConfig() {
  if (presetProfiles.length === 0 && presetConnections.length === 0) return null
  return {
    customConnections: presetConnections.map((connection) => ({ ...connection })),
    profiles: presetProfiles.map((profile) => ({ ...profile })),
    presetProfileFields,
  }
}

export function getDefaultPresetProfileId() {
  return defaultPresetProfileId
}

export function getDefaultPresetBaseUrl() {
  const profile = presetProfiles.find((profile) => profile.id === defaultPresetProfileId)
  if (!profile) return ''
  return profile.baseUrl
}

export function isPresetProfile(id: string) {
  return presetProfiles.some((profile) => profile.id === id)
}

export function isPresetConnection(id: string) {
  return presetConnections.some((connection) => connection.id === id)
}

export function isPresetConfigOnlyEnabled() {
  return SHOW_PRESET_CONFIG_ONLY && presetProfiles.length > 0
}

export function isPresetConfigParamsLocked() {
  return LOCK_PRESET_CONFIG_PARAMS && presetProfiles.length > 0
}

export function isPresetConfigDeletionPrevented() {
  return (PREVENT_PRESET_CONFIG_DELETION || SHOW_PRESET_CONFIG_ONLY) && presetProfiles.length > 0
}

export function isPresetProfileLocked(id: string) {
  return isPresetConfigParamsLocked() && isPresetProfile(id)
}

export function isPresetConnectionLocked(id: string) {
  return isPresetConfigParamsLocked() && isPresetConnection(id)
}

export function isPresetConnectionDeletionPrevented(id: string, profiles: ApiProfile[]) {
  if (!isPresetConnection(id)) return false
  if (isPresetConfigDeletionPrevented()) return true
  return profiles.some((profile) => profile.connectionId === id && isPresetProfileLocked(profile.id))
}

export function enforcePresetConfigPolicy(
  settings: AppSettings,
  options: { dismissedPresetConnectionIds?: string[] } = {},
): AppSettings {
  const presetConfigOnly = isPresetConfigOnlyEnabled()
  const paramsLocked = isPresetConfigParamsLocked()
  if (presetProfiles.length === 0) return settings

  const dismissedConnectionIds = new Set(options.dismissedPresetConnectionIds ?? [])
  const profileIds = getPresetProfileIds()
  const presetProfilesById = new Map(presetProfiles.map((profile) => [profile.id, profile]))
  const presetConnectionsById = new Map(presetConnections.map((connection) => [connection.id, connection]))
  const profiles = settings.profiles.map((profile) => {
    const preset = presetProfilesById.get(profile.id)
    if (!preset) return profile.isDefault ? { ...profile, isDefault: undefined } : profile
    return {
      ...(paramsLocked ? preset : profile),
      apiKey: profile.apiKey,
      selectedModel: profile.selectedModel,
      connectionId: paramsLocked || presetConfigOnly ? preset.connectionId : profile.connectionId,
      isDefault: profile.id === defaultPresetProfileId ? true : undefined,
    }
  })
  if (isPresetConfigDeletionPrevented()) {
    for (const profile of presetProfiles) {
      if (!profiles.some((item) => item.id === profile.id)) profiles.push({ ...profile, isDefault: profile.id === defaultPresetProfileId ? true : undefined })
    }
  }
  const customConnections = settings.customConnections.filter((connection) => !dismissedConnectionIds.has(connection.id)).map((connection) => {
    const preset = presetConnectionsById.get(connection.id)
    return preset && paramsLocked ? preset : connection
  })
  for (const connection of presetConnections) {
    if (dismissedConnectionIds.has(connection.id)) continue
    if (!customConnections.some((item) => item.id === connection.id)) customConnections.push(connection)
  }
  const activeProfileId = presetConfigOnly && !profileIds.has(settings.activeProfileId)
    ? defaultPresetProfileId ?? presetProfiles[0]?.id ?? settings.activeProfileId
    : settings.activeProfileId

  return {
    ...settings,
    customConnections,
    profiles,
    activeProfileId,
  }
}
