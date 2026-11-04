import type { ApiProfile, AppSettings, CustomConnectionDefinition } from '../types'
import { DEFAULT_SETTINGS, findEquivalentApiProfile, importCustomConnectionSettingsFromJson, normalizeSettings, type ImportedConnectionSettings } from './apiProfiles'
import { getPresetConfig, isPresetConfigOnlyEnabled, isPresetProfileLocked } from './presetConfig'
import { buildSettingsFromUrlParams, getUrlSettingsPayload, hasUrlSettingParams } from './urlSettings'

export function createProfileShareJson(profile: ApiProfile, connection?: CustomConnectionDefinition, includeApiKey = false) {
  return JSON.stringify({
    format: 'ai-image-studio-profile',
    version: 2,
    ...(connection ? { customConnections: [connection] } : {}),
    profiles: [{
      ...profile,
      id: undefined,
      isDefault: undefined,
      connectionDrafts: undefined,
      selectedModel: undefined,
      apiKey: includeApiKey ? profile.apiKey : '',
    }],
  }, null, 2)
}

export function createProfileShareUrl(baseUrl: string, profile: ApiProfile, connection?: CustomConnectionDefinition, includeApiKey = false) {
  const url = new URL(baseUrl)
  url.search = ''
  url.hash = new URLSearchParams({ config: createProfileShareJson(profile, connection, includeApiKey) }).toString()
  return url.toString()
}

export function hasProfileImportUrl(url: URL) {
  return new URLSearchParams(url.hash.slice(1)).has('config') || hasUrlSettingParams(url.searchParams)
}

export function readProfileImport(text: string, current: AppSettings) {
  const source = text.trim()
  if (!source) throw new Error('请粘贴分享链接或配置 JSON')

  const params = new URLSearchParams()
  let json = source
  if (/^https?:\/\//i.test(source)) {
    const url = new URL(source)
    const hash = new URLSearchParams(url.hash.slice(1))
    if (hash.has('config')) {
      json = hash.get('config') ?? ''
    } else {
      if (!hasUrlSettingParams(url.searchParams)) throw new Error('链接中没有 API 配置')
      for (const [key, value] of url.searchParams) {
        if (hasUrlSettingParams(new URLSearchParams({ [key]: value }))) params.set(key, value)
      }
      const payload = getUrlSettingsPayload(params)
      if (params.has('settings') && !payload) throw new Error('链接中的配置 JSON 无效')
      json = payload ? JSON.stringify(payload) : ''
    }
  }

  let imported: ImportedConnectionSettings | null = null
  if (json) {
    const raw = JSON.parse(json.replace(/^```[^\r\n]*\r?\n([\s\S]*?)\r?\n```$/, '$1')) as unknown
    if (raw && typeof raw === 'object' && 'format' in raw && raw.format === 'ai-image-studio-profile' && 'version' in raw && raw.version !== 2) {
      throw new Error('不支持此配置版本，请更新应用后重试')
    }
    imported = importCustomConnectionSettingsFromJson(JSON.stringify(raw))
    if (!imported.profiles.length) throw new Error('配置中没有 API 配置，请在服务商编辑器中导入服务商定义')
    params.set('settings', JSON.stringify(imported))
  }

  if (isPresetConfigOnlyEnabled()) {
    const preset = getPresetConfig()
    const base = normalizeSettings({
      ...current,
      customConnections: [...current.customConnections, ...(preset?.customConnections.filter((connection) => !current.customConnections.some((item) => item.id === connection.id)) ?? [])],
      profiles: [...current.profiles, ...(preset?.profiles.filter((profile) => !current.profiles.some((item) => item.id === profile.id)) ?? [])],
    })
    const next = buildSettingsFromUrlParams(base, params)
    const profile = next.profiles?.find((profile) => profile.id === next.activeProfileId)
    if (!profile) throw new Error('此部署仅支持导入匹配的预置配置')
    return { customConnections: base.customConnections, profiles: [{ ...profile, apiKey: profile.apiKey === '{key}' ? '' : profile.apiKey }], params }
  }

  const hasFields = [...params.keys()].some((key) => key !== 'settings' && key !== 'profileId')
  if (!imported || hasFields) {
    const requested = current.profiles.find((profile) => profile.id === params.get('profileId'))
    const base = requested
      ? normalizeSettings({ ...current, profiles: [requested], activeProfileId: requested.id })
      : DEFAULT_SETTINGS
    const next = buildSettingsFromUrlParams(base, params)
    const profile = next.profiles?.find((profile) => profile.id === next.activeProfileId)
    if (!profile) throw new Error('链接中没有可导入的 API 配置')
    imported = {
      customConnections: next.customConnections ?? [],
      profiles: [profile],
    }
  }

  return {
    ...imported,
    profiles: imported.profiles.map((profile) => ({ ...profile, apiKey: profile.apiKey === '{key}' ? '' : profile.apiKey })),
    params,
  }
}

export function findSharedProfile(current: AppSettings, imported: ImportedConnectionSettings) {
  if (imported.profiles.length !== 1) return null
  // 分享文件中的 ID 属于发送方，不能用来判断本地配置是否相同。
  const profile = imported.profiles[0]
  const connection = imported.customConnections.find((connection) => connection.id === profile.connectionId)
  const existingConnection = connection
    ? current.customConnections.find((item) => JSON.stringify({ ...item, id: undefined }) === JSON.stringify({ ...connection, id: undefined }))
    : null
  if (connection && !existingConnection) return null
  return findEquivalentApiProfile(current, { ...profile, id: '', connectionId: existingConnection?.id ?? profile.connectionId })
}

export function applyProfileImport(
  current: AppSettings,
  imported: ImportedConnectionSettings,
  mode: 'add' | 'reuse' | 'replace',
  targetId?: string,
) {
  if (!imported.profiles.length) throw new Error('配置中没有 API 配置')
  if (mode === 'reuse') {
    const existing = findSharedProfile(current, imported)
    if (!existing) throw new Error('找不到可复用的配置，请重新选择')
    return normalizeSettings({ ...current, activeProfileId: existing.id })
  }
  if (isPresetConfigOnlyEnabled()) throw new Error('此部署仅支持更新预置配置')
  const target = current.profiles.find((profile) => profile.id === targetId)
  if (mode === 'replace' && (!target || isPresetProfileLocked(target.id) || imported.profiles.length !== 1)) {
    throw new Error('无法覆盖所选配置')
  }

  const customConnections = [...current.customConnections]
  const connectionIds = new Map<string, string>()
  for (const connection of imported.customConnections) {
    const existing = customConnections.find((item) => JSON.stringify({ ...item, id: undefined }) === JSON.stringify({ ...connection, id: undefined }))
    if (existing) {
      connectionIds.set(connection.id, existing.id)
      continue
    }
    let id = connection.id
    let suffix = 1
    while (customConnections.some((item) => item.id === id)) id = `${connection.id}-${suffix++}`
    customConnections.push({ ...connection, id })
    connectionIds.set(connection.id, id)
  }

  const profiles = [...current.profiles]
  const importedIds: string[] = []
  for (const profile of imported.profiles) {
    let id = mode === 'replace' ? target!.id : `profile-import-${Date.now().toString(36)}`
    let suffix = 1
    while (mode !== 'replace' && profiles.some((item) => item.id === id)) id = `profile-import-${Date.now().toString(36)}-${suffix++}`
    const next = {
      ...profile,
      id,
      isDefault: mode === 'replace' ? target?.isDefault : undefined,
      connectionId: connectionIds.get(profile.connectionId) ?? profile.connectionId,
    }
    if (mode === 'replace') profiles[profiles.findIndex((item) => item.id === id)] = next
    else profiles.push(next)
    importedIds.push(id)
  }
  return normalizeSettings({ ...current, customConnections, profiles, activeProfileId: importedIds[0] })
}
