import type { ApiProfile, ApiConnectionId, AppSettings, PresetConfig, CustomConnectionContentType, CustomConnectionDefinition, CustomConnectionFileMapping, CustomConnectionPollMapping, CustomConnectionRequestMethod, CustomConnectionResultMapping, CustomConnectionSubmitMapping, CustomConnectionTemplate, ReferenceImageEditAction, RetryMode } from '../types'
import { DEFAULT_STREAM_PARTIAL_IMAGES, DEFAULT_ZIP_DOWNLOAD_ROUTES, ZIP_DOWNLOAD_ROUTE_VALUES } from '../types'
import { customConnectionSupportsNativeTransparentBackground } from './customConnectionCapabilities'
import { shouldUseApiProxy } from './devProxy'
import { normalizeReasoningEffort, normalizeStreamPartialImages, parseDefaultApiUrl } from './defaultApiUrl'
import { readRuntimeEnv } from './runtimeEnv'
import { isImportableConfigUrl } from './importableConfigUrl'
import { DEFAULT_IMAGES_MODEL } from './imageModels'
import { normalizeBatchPromptConcurrency } from './batchPrompts'
import { normalizeHomeParamSelection, normalizeParamDefaults } from './homeParams'

const OPENAI_DEFAULT_API_BASE_URL = 'https://api.openai.com/v1'
const RAW_DEFAULT_API_URL = readRuntimeEnv(import.meta.env.VITE_DEFAULT_API_URL)
const DEFAULT_OPENAI_API_PROXY = readRuntimeEnv(import.meta.env.VITE_API_PROXY_AVAILABLE) === 'true'
const DOCKER_DEPLOYMENT = readRuntimeEnv(import.meta.env.VITE_DOCKER_DEPLOYMENT) === 'true'
const DEFAULT_API_URL_PATCH = isImportableConfigUrl(RAW_DEFAULT_API_URL)
  ? null
  : parseDefaultApiUrl(RAW_DEFAULT_API_URL || (DOCKER_DEPLOYMENT && DEFAULT_OPENAI_API_PROXY ? '' : OPENAI_DEFAULT_API_BASE_URL))
export const DEFAULT_API_BASE_URL = DEFAULT_API_URL_PATCH?.baseUrl ?? ''
export { DEFAULT_IMAGES_MODEL } from './imageModels'
export const DEFAULT_RESPONSES_MODEL = 'gpt-6.1-sol'
export const DEFAULT_OPENAI_PROFILE_ID = 'default-openai'
export const DEFAULT_API_TIMEOUT = 600

const BUILT_IN_CONNECTION_IDS = new Set<ApiConnectionId>(['openai-images', 'openai-responses'])
const DEFAULT_CUSTOM_CONNECTION_PATHS = {
  generationPath: 'images/generations',
  editPath: 'images/edits',
  taskPath: 'images/tasks/{task_id}',
}
const DEFAULT_GENERATE_BODY = {
  model: '$profile.model',
  prompt: '$prompt',
  size: '$params.size',
  quality: '$params.quality',
  output_format: '$params.output_format',
  moderation: '$params.moderation',
  output_compression: '$params.output_compression',
  n: '$params.n',
  background: '$params.background',
}
const DEFAULT_EDIT_BODY = DEFAULT_GENERATE_BODY
const DEFAULT_OPENAI_RESULT: CustomConnectionResultMapping = {
  imageUrlPaths: ['data.*.url'],
  b64JsonPaths: ['data.*.b64_json'],
}
const DEFAULT_EDIT_FILES: CustomConnectionFileMapping[] = [
  { field: 'image[]', source: 'inputImages', array: true },
  { field: 'mask', source: 'mask' },
]

type ApiProfileConnectionDraft = NonNullable<ApiProfile['connectionDrafts']>[ApiConnectionId]

export function isOpenAIConnection(connectionId: ApiConnectionId): boolean {
  return connectionId === 'openai-images' || connectionId === 'openai-responses'
}

export { normalizeReasoningEffort, normalizeStreamPartialImages } from './defaultApiUrl'

export function hasDefaultPresetConfig(): boolean {
  return Boolean(RAW_DEFAULT_API_URL) || DEFAULT_OPENAI_API_PROXY
}

export function getDefaultApiProfileId(settings: Partial<AppSettings> | unknown): string | null {
  const record = isRecord(settings) ? settings : {}
  const profiles = Array.isArray(record.profiles) ? record.profiles.filter(isRecord) : []
  const marked = profiles.find((profile) => profile.isDefault === true && typeof profile.id === 'string')
  if (marked && typeof marked.id === 'string') return marked.id
  return null
}

function normalizeReferenceImageEditAction(value: unknown): ReferenceImageEditAction {
  return value === 'sketch' || value === 'mask' ? value : 'ask'
}

function normalizeRetryMode(value: unknown, alwaysShowRetryButton: boolean): RetryMode {
  if (value === 'overwriteAll') return alwaysShowRetryButton ? value : 'overwriteFailed'
  return value === 'overwriteFailed' ? value : 'new'
}

function normalizeZipDownloadRoutes(value: unknown) {
  if (!Array.isArray(value)) return [...DEFAULT_ZIP_DOWNLOAD_ROUTES]
  const allowed = new Set<string>(ZIP_DOWNLOAD_ROUTE_VALUES)
  return value.filter((item): item is typeof ZIP_DOWNLOAD_ROUTE_VALUES[number] => typeof item === 'string' && allowed.has(item))
}

function normalizeConnectionOrder(value: unknown, customConnections: CustomConnectionDefinition[]): string[] | undefined {
  if (!Array.isArray(value)) return undefined

  const connectionIds = ['openai-images', 'openai-responses', ...customConnections.map((connection) => connection.id)]
  const knownIds = new Set(connectionIds)
  const ordered = value
    .map(String)
    .filter((id, idx, list) => knownIds.has(id) && list.indexOf(id) === idx)

  return [...ordered, ...connectionIds.filter((id) => !ordered.includes(id))]
}

function isCustomConnectionTemplate(value: unknown): value is CustomConnectionTemplate {
  return value === 'http-image'
}

function normalizeConnectionPath(value: unknown, fallback: string): string {
  return (typeof value === 'string' && value.trim() ? value : fallback).trim().replace(/^\/+/, '').replace(/^v1\//, '')
}

function normalizeStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object') return undefined

  const entries = Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [string, string | number | boolean] =>
      typeof entry[0] === 'string' && ['string', 'number', 'boolean'].includes(typeof entry[1]),
    )
    .map(([key, item]) => [key, String(item)] as const)

  return entries.length ? Object.fromEntries(entries) : undefined
}

function normalizeStringArray(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim())
    : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeRequestMethod(value: unknown, fallback: CustomConnectionRequestMethod = 'POST'): CustomConnectionRequestMethod {
  return value === 'GET' || value === 'POST' ? value : fallback
}

function normalizeContentType(value: unknown, fallback: CustomConnectionContentType = 'json'): CustomConnectionContentType {
  return value === 'multipart' ? 'multipart' : fallback
}

function normalizeBodyTemplate(value: unknown, fallback: Record<string, unknown>): Record<string, unknown> {
  return isRecord(value) ? value : fallback
}

function normalizeFileMappings(value: unknown, fallback: CustomConnectionFileMapping[] = []): CustomConnectionFileMapping[] {
  if (!Array.isArray(value)) return fallback
  const files = value
    .map((item): CustomConnectionFileMapping | null => {
      if (!isRecord(item) || typeof item.field !== 'string' || !item.field.trim()) return null
      if (item.source !== 'inputImages' && item.source !== 'mask') return null
      return {
        field: item.field.trim(),
        source: item.source,
        array: Boolean(item.array),
      }
    })
    .filter((item): item is CustomConnectionFileMapping => Boolean(item))
  return files.length ? files : fallback
}

function normalizeResultMapping(value: unknown, fallback: CustomConnectionResultMapping = DEFAULT_OPENAI_RESULT): CustomConnectionResultMapping {
  const record = isRecord(value) ? value : {}
  const imageUrlPaths = normalizeStringArray(record.imageUrlPaths, fallback.imageUrlPaths ?? [])
  const b64JsonPaths = normalizeStringArray(record.b64JsonPaths, fallback.b64JsonPaths ?? [])
  return {
    imageUrlPaths,
    b64JsonPaths,
  }
}

function normalizeSubmitMapping(value: unknown, fallback: CustomConnectionSubmitMapping): CustomConnectionSubmitMapping {
  const record = isRecord(value) ? value : {}
  const contentType = normalizeContentType(record.contentType, fallback.contentType ?? 'json')
  return {
    path: normalizeConnectionPath(record.path, fallback.path),
    method: normalizeRequestMethod(record.method, fallback.method ?? 'POST'),
    contentType,
    query: normalizeStringRecord(record.query) ?? fallback.query,
    body: normalizeBodyTemplate(record.body, fallback.body ?? (contentType === 'multipart' ? DEFAULT_EDIT_BODY : DEFAULT_GENERATE_BODY)),
    files: contentType === 'multipart' ? normalizeFileMappings(record.files, fallback.files) : undefined,
    taskIdPath: typeof record.taskIdPath === 'string' && record.taskIdPath.trim() ? record.taskIdPath.trim() : fallback.taskIdPath,
    result: normalizeResultMapping(record.result, fallback.result ?? DEFAULT_OPENAI_RESULT),
  }
}

function normalizePollMapping(value: unknown, fallback?: CustomConnectionPollMapping): CustomConnectionPollMapping | undefined {
  if (!isRecord(value) && !fallback) return undefined
  const record = isRecord(value) ? value : {}
  const path = normalizeConnectionPath(record.path, fallback?.path ?? DEFAULT_CUSTOM_CONNECTION_PATHS.taskPath)
  const statusPath = typeof record.statusPath === 'string' && record.statusPath.trim() ? record.statusPath.trim() : fallback?.statusPath
  if (!statusPath) return undefined

  return {
    path,
    method: normalizeRequestMethod(record.method, fallback?.method ?? 'GET'),
    query: normalizeStringRecord(record.query) ?? fallback?.query,
    intervalSeconds: typeof record.intervalSeconds === 'number' && Number.isFinite(record.intervalSeconds)
      ? Math.max(1, record.intervalSeconds)
      : fallback?.intervalSeconds ?? 5,
    statusPath,
    successValues: normalizeStringArray(record.successValues, fallback?.successValues ?? ['SUCCESS', 'succeeded', 'completed', 'COMPLETED']),
    failureValues: normalizeStringArray(record.failureValues, fallback?.failureValues ?? ['FAILURE', 'failed', 'error', 'FAILED', 'cancelled']),
    errorPath: typeof record.errorPath === 'string' && record.errorPath.trim() ? record.errorPath.trim() : fallback?.errorPath,
    result: normalizeResultMapping(record.result, fallback?.result ?? DEFAULT_OPENAI_RESULT),
  }
}

function createCustomConnectionId(name: string, usedIds: Set<string>): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'custom'
  let id = `custom-${slug}`
  let index = 2
  while (usedIds.has(id) || BUILT_IN_CONNECTION_IDS.has(id)) {
    id = `custom-${slug}-${index}`
    index += 1
  }
  usedIds.add(id)
  return id
}

export function normalizeCustomConnectionDefinition(input: unknown, usedIds = new Set<string>()): CustomConnectionDefinition | null {
  if (!input || typeof input !== 'object') return null
  const record = input as Record<string, unknown>
  const template = record.template == null ? 'http-image' : isCustomConnectionTemplate(record.template) ? record.template : null
  if (!template || !isRecord(record.submit)) return null

  const rawName = typeof record.name === 'string' && record.name.trim() ? record.name.trim() : '自定义 HTTP 接口'
  const id = typeof record.id === 'string' && record.id.trim() && !BUILT_IN_CONNECTION_IDS.has(record.id.trim()) && !usedIds.has(record.id.trim())
    ? record.id.trim()
    : createCustomConnectionId(rawName, usedIds)
  usedIds.add(id)

  return {
    id,
    name: rawName,
    template,
    submit: normalizeSubmitMapping(record.submit, {
      path: DEFAULT_CUSTOM_CONNECTION_PATHS.generationPath,
      method: 'POST',
      contentType: 'json',
      body: DEFAULT_GENERATE_BODY,
      result: DEFAULT_OPENAI_RESULT,
    }),
    editSubmit: isRecord(record.editSubmit) ? normalizeSubmitMapping(record.editSubmit, {
      path: DEFAULT_CUSTOM_CONNECTION_PATHS.editPath,
      method: 'POST',
      contentType: 'multipart',
      body: DEFAULT_EDIT_BODY,
      files: DEFAULT_EDIT_FILES,
      result: DEFAULT_OPENAI_RESULT,
    }) : undefined,
    poll: normalizePollMapping(record.poll),
  }
}

export function normalizeCustomConnectionDefinitions(input: unknown): CustomConnectionDefinition[] {
  const usedIds = new Set<string>()
  const list = Array.isArray(input) ? input : []
  return list
    .map((item) => normalizeCustomConnectionDefinition(item, usedIds))
    .filter((item): item is CustomConnectionDefinition => Boolean(item))
}

export function createDefaultOpenAIProfile(overrides: Partial<ApiProfile> = {}): ApiProfile {
  const connectionId = overrides.connectionId ?? DEFAULT_API_URL_PATCH?.connectionId ?? 'openai-images'

  return {
    id: DEFAULT_OPENAI_PROFILE_ID,
    name: DEFAULT_API_URL_PATCH?.name ?? '默认',
    baseUrl: DEFAULT_API_BASE_URL,
    apiKey: DEFAULT_API_URL_PATCH?.apiKey ?? '',
    model: DEFAULT_API_URL_PATCH?.model ?? (connectionId === 'openai-responses' ? DEFAULT_RESPONSES_MODEL : DEFAULT_IMAGES_MODEL),
    imageGenerationModel: DEFAULT_API_URL_PATCH?.imageGenerationModel ?? DEFAULT_IMAGES_MODEL,
    timeout: DEFAULT_API_TIMEOUT,
    reasoningEffort: DEFAULT_API_URL_PATCH?.reasoningEffort,
    codexCli: DEFAULT_API_URL_PATCH?.codexCli ?? false,
    apiProxy: DEFAULT_OPENAI_API_PROXY,
    streamPartialImages: DEFAULT_API_URL_PATCH?.streamPartialImages ?? DEFAULT_STREAM_PARTIAL_IMAGES,
    transparentBackgroundMethod: DEFAULT_API_URL_PATCH?.transparentBackgroundMethod ?? 'api',
    ...overrides,
    connectionId,
    homeParams: normalizeHomeParamSelection(overrides.homeParams),
    paramDefaults: normalizeParamDefaults(overrides.paramDefaults),
    streamImages: overrides.streamImages ?? DEFAULT_API_URL_PATCH?.streamImages ?? connectionId === 'openai-responses',
  }
}

export function switchApiProfileConnection(profile: ApiProfile, connectionId: ApiConnectionId, customConnection?: CustomConnectionDefinition): ApiProfile {
  if (profile.connectionId === connectionId) return profile
  const connectionDrafts = {
    ...profile.connectionDrafts,
    [profile.connectionId]: {
      baseUrl: profile.baseUrl,
      model: profile.model,
      imageGenerationModel: profile.imageGenerationModel,
      reasoningEffort: profile.reasoningEffort,
      codexCli: profile.codexCli,
      apiProxy: profile.apiProxy,
      responseFormatB64Json: profile.responseFormatB64Json,
      streamImages: profile.streamImages,
      streamPartialImages: profile.streamPartialImages,
      transparentBackgroundMethod: profile.transparentBackgroundMethod,
      homeParams: profile.homeParams,
      paramDefaults: profile.paramDefaults,
    },
  }
  const savedDraft = connectionDrafts[connectionId]
  const openAI = isOpenAIConnection(connectionId)
  const fromOpenAI = isOpenAIConnection(profile.connectionId)
  const defaultModel = connectionId === 'openai-responses' ? DEFAULT_RESPONSES_MODEL : DEFAULT_IMAGES_MODEL
  const previousDefaultModel = profile.connectionId === 'openai-responses' ? DEFAULT_RESPONSES_MODEL : DEFAULT_IMAGES_MODEL
  const model = profile.model && profile.model !== previousDefaultModel ? profile.model : defaultModel

  return {
    ...profile,
    connectionId,
    baseUrl: savedDraft?.baseUrl ?? profile.baseUrl,
    model: savedDraft?.model ?? model,
    imageGenerationModel: savedDraft?.imageGenerationModel ?? profile.imageGenerationModel,
    reasoningEffort: savedDraft ? savedDraft.reasoningEffort : openAI && fromOpenAI ? profile.reasoningEffort : undefined,
    codexCli: savedDraft?.codexCli ?? (openAI && fromOpenAI ? profile.codexCli : false),
    apiProxy: savedDraft?.apiProxy ?? (openAI && (fromOpenAI ? profile.apiProxy : DEFAULT_OPENAI_API_PROXY)),
    responseFormatB64Json: savedDraft?.responseFormatB64Json,
    streamImages: openAI ? savedDraft?.streamImages ?? connectionId === 'openai-responses' : false,
    streamPartialImages: savedDraft?.streamPartialImages ?? (openAI && fromOpenAI ? profile.streamPartialImages : DEFAULT_STREAM_PARTIAL_IMAGES),
    transparentBackgroundMethod: customConnection && !customConnectionSupportsNativeTransparentBackground(customConnection)
      ? 'local'
      : savedDraft?.transparentBackgroundMethod ?? 'api',
    homeParams: normalizeHomeParamSelection(savedDraft?.homeParams),
    paramDefaults: normalizeParamDefaults(savedDraft?.paramDefaults),
    connectionDrafts,
  }
}

function normalizeConnectionDraft(
  input: unknown,
  connectionId: ApiConnectionId,
  customConnectionIds: Set<string>,
  nativeTransparentConnectionIds: Set<string>,
): ApiProfileConnectionDraft {
  if (!isRecord(input)) return undefined
  const nativeTransparentBackgroundUnavailable = customConnectionIds.has(connectionId) && !nativeTransparentConnectionIds.has(connectionId)
  const transparentBackgroundMethod = nativeTransparentBackgroundUnavailable ? 'local' : 'api'
  const fallback = createDefaultOpenAIProfile({ connectionId, transparentBackgroundMethod })
  const baseUrl = typeof input.baseUrl === 'string' ? input.baseUrl : undefined
  const model = (typeof input.model === 'string' && normalizeModelList(input.model)) || undefined
  const imageGenerationModel = typeof input.imageGenerationModel === 'string' ? input.imageGenerationModel.trim() : ''
  const knownConnection = BUILT_IN_CONNECTION_IDS.has(connectionId) || customConnectionIds.has(connectionId)
  if (!knownConnection) return undefined

  return {
    baseUrl,
    model,
    imageGenerationModel,
    reasoningEffort: normalizeReasoningEffort(input.reasoningEffort),
    homeParams: normalizeHomeParamSelection(input.homeParams),
    paramDefaults: normalizeParamDefaults(input.paramDefaults),
    codexCli: typeof input.codexCli === 'boolean' ? input.codexCli : fallback.codexCli,
    apiProxy: typeof input.apiProxy === 'boolean' ? input.apiProxy : fallback.apiProxy,
    responseFormatB64Json: input.responseFormatB64Json === true ? true : undefined,
    streamImages: typeof input.streamImages === 'boolean' ? input.streamImages : fallback.streamImages,
    streamPartialImages: normalizeStreamPartialImages(input.streamPartialImages, fallback.streamPartialImages),
    transparentBackgroundMethod: !nativeTransparentBackgroundUnavailable && (input.transparentBackgroundMethod === 'api' || input.transparentBackgroundMethod === 'local')
      ? input.transparentBackgroundMethod
      : fallback.transparentBackgroundMethod,
  }
}

function normalizeConnectionDrafts(
  input: unknown,
  customConnectionIds: Set<string>,
  nativeTransparentConnectionIds: Set<string>,
): ApiProfile['connectionDrafts'] {
  if (!isRecord(input)) return undefined
  const entries = Object.entries(input)
    .map(([connectionId, draft]) => [connectionId, normalizeConnectionDraft(draft, connectionId, customConnectionIds, nativeTransparentConnectionIds)] as const)
    .filter((entry): entry is [ApiConnectionId, NonNullable<ApiProfileConnectionDraft>] => Boolean(entry[1]))

  return entries.length ? Object.fromEntries(entries) : undefined
}

export function normalizeApiProfile(
  input: unknown,
  fallback?: Partial<ApiProfile>,
  customConnectionIds = new Set<string>(),
  nativeTransparentConnectionIds = new Set<string>(),
): ApiProfile {
  const record = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const rawConnection = typeof record.connectionId === 'string' ? record.connectionId : ''
  // 缺失接口定义时保留标识，禁止静默切换协议。
  const connectionId: ApiConnectionId = rawConnection.trim() || fallback?.connectionId || ''
  const connectionFallback = customConnectionIds.has(connectionId)
    ? { transparentBackgroundMethod: 'local' as const, ...fallback }
    : fallback
  const defaults = createDefaultOpenAIProfile({ ...connectionFallback, connectionId })
  const rawBaseUrl = typeof record.baseUrl === 'string' ? record.baseUrl : defaults.baseUrl
  const streamImages = isOpenAIConnection(connectionId)
    ? typeof record.streamImages === 'boolean' ? record.streamImages : defaults.streamImages
    : false
  const nativeTransparentBackgroundUnavailable = customConnectionIds.has(connectionId) && !nativeTransparentConnectionIds.has(connectionId)

  return {
    ...defaults,
    id: typeof record.id === 'string' && record.id.trim() ? record.id : defaults.id,
    isDefault: typeof record.isDefault === 'boolean' ? record.isDefault : undefined,
    name: typeof record.name === 'string' && record.name.trim() ? record.name : defaults.name,
    description: typeof record.description === 'string' && record.description.trim() ? record.description : undefined,
    connectionId,
    baseUrl: rawBaseUrl,
    apiKey: typeof record.apiKey === 'string' ? record.apiKey : defaults.apiKey,
    model: (typeof record.model === 'string' && normalizeModelList(record.model)) || defaults.model,
    selectedModel: typeof record.selectedModel === 'string' && record.selectedModel.trim() ? record.selectedModel.trim() : undefined,
    imageGenerationModel: typeof record.imageGenerationModel === 'string'
      ? record.imageGenerationModel.trim()
      : '',
    timeout: typeof record.timeout === 'number' && Number.isFinite(record.timeout) ? record.timeout : defaults.timeout,
    reasoningEffort: normalizeReasoningEffort(record.reasoningEffort, defaults.reasoningEffort),
    codexCli: Boolean(record.codexCli),
    apiProxy: typeof record.apiProxy === 'boolean' ? record.apiProxy : defaults.apiProxy,
    responseFormatB64Json: record.responseFormatB64Json === true ? true : undefined,
    streamImages,
    streamPartialImages: normalizeStreamPartialImages(record.streamPartialImages, defaults.streamPartialImages),
    transparentBackgroundMethod: !nativeTransparentBackgroundUnavailable && (record.transparentBackgroundMethod === 'api' || record.transparentBackgroundMethod === 'local')
      ? record.transparentBackgroundMethod
      : defaults.transparentBackgroundMethod,
    homeParams: normalizeHomeParamSelection(record.homeParams),
    paramDefaults: normalizeParamDefaults(record.paramDefaults),
    connectionDrafts: normalizeConnectionDrafts(record.connectionDrafts, customConnectionIds, nativeTransparentConnectionIds),
  }
}

function validateImportedProfileRecord(input: unknown) {
  if (!isRecord(input)) return

  const baseUrl = typeof input.baseUrl === 'string' ? input.baseUrl.trim() : ''
  if (baseUrl && (baseUrl.startsWith('[') || baseUrl.includes(']('))) {
    throw new Error('JSON 包含 Markdown 链接，请粘贴纯文本')
  }

  if (typeof input.connectionId !== 'string' || !input.connectionId.trim()) {
    throw new Error('API 配置缺少有效的 connectionId')
  }
}

function validateImportedConnectionIds(input: unknown, deploymentConfig = false) {
  if (!Array.isArray(input)) return
  const usedIds = new Set<string>()

  for (const item of input) {
    if (!isRecord(item)) {
      if (deploymentConfig) throw new Error('部署文件中的服务商配置必须是对象')
      continue
    }
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    const label = name ? `「${name}」` : ''
    const id = typeof item.id === 'string' ? item.id.trim() : ''
    if (BUILT_IN_CONNECTION_IDS.has(id)) throw new Error(`自定义接入${label}的 id「${id}」与内置接入冲突`)
    if (!deploymentConfig) continue
    if (!id) throw new Error(`部署服务商${label}缺少 id`)
    if (usedIds.has(id)) throw new Error(`部署服务商${label}的 id「${id}」重复`)
    if (!normalizeCustomConnectionDefinition(item)) throw new Error(`部署服务商${label}的 Manifest 无效`)
    usedIds.add(id)
  }
}

function normalizeDeploymentProfileEntries(input: unknown, customConnectionIds: Set<string>, nativeTransparentConnectionIds = new Set<string>(), deploymentConfig = false) {
  const records = Array.isArray(input)
    ? input.flatMap((item) => {
        validateImportedProfileRecord(item)
        if (!isRecord(item)) throw new Error('API 配置必须是对象')
        if (typeof item.connectionId !== 'string' || (!BUILT_IN_CONNECTION_IDS.has(item.connectionId) && !customConnectionIds.has(item.connectionId))) {
          const name = typeof item.name === 'string' ? item.name.trim() : ''
          const id = typeof item.id === 'string' ? item.id.trim() : ''
          const label = name || id ? `「${name || id}」` : ''
          throw new Error(`API 配置${label}引用了不存在的自定义服务商`)
        }
        return [item]
      })
    : []
  const usedIds = new Set<string>()
  if (deploymentConfig && records.length > 1) {
    const defaultCount = records.filter((record) => record.isDefault === true).length
    if (defaultCount !== 1) throw new Error('部署文件包含多个 API 配置时，必须且只能有一项设置 isDefault: true')
  }

  for (const record of records) {
    const id = typeof record.id === 'string' ? record.id.trim() : ''
    if (id) {
      if (usedIds.has(id)) {
        const name = typeof record.name === 'string' ? record.name.trim() : ''
        const label = name ? `「${name}」` : ''
        throw new Error(`API 配置${label}的 id「${id}」重复`)
      }
      usedIds.add(id)
      continue
    }
  }

  return records.map((record) => {
    const rawId = typeof record.id === 'string' ? record.id.trim() : ''
    const fallback = nativeTransparentConnectionIds.has(record.connectionId as string) ? { transparentBackgroundMethod: 'api' as const } : undefined
    if (rawId) return { source: record, profile: normalizeApiProfile({ ...record, id: rawId }, fallback, customConnectionIds, nativeTransparentConnectionIds) }

    const connection = record.connectionId as string
    const id = deploymentConfig
      ? createPresetProfileId(connection, record, usedIds)
      : createImportedProfileId(connection, usedIds)
    return { source: record, profile: normalizeApiProfile({ ...record, id }, fallback, customConnectionIds, nativeTransparentConnectionIds) }
  })
}

export function normalizeSettings(input: Partial<AppSettings> | unknown): AppSettings {
  const record = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const customConnections = normalizeCustomConnectionDefinitions(record.customConnections)
  const customConnectionIds = new Set(customConnections.map((connection) => connection.id))
  const nativeTransparentConnectionIds = new Set(customConnections.filter(customConnectionSupportsNativeTransparentBackground).map((connection) => connection.id))
  const normalizedProfiles = Array.isArray(record.profiles) && record.profiles.length
    ? record.profiles.map((profile) => {
        const connectionId = isRecord(profile) && typeof profile.connectionId === 'string' ? profile.connectionId : ''
        const fallback = nativeTransparentConnectionIds.has(connectionId) ? { transparentBackgroundMethod: 'api' as const } : undefined
        return normalizeApiProfile(profile, fallback, customConnectionIds, nativeTransparentConnectionIds)
      })
    : [createDefaultOpenAIProfile()]
  const defaultProfileId = getDefaultApiProfileId({ profiles: normalizedProfiles })
  const profiles = normalizedProfiles.map((profile) => ({
    ...profile,
    isDefault: profile.id === defaultProfileId ? true : undefined,
  }))
  const activeProfileId = typeof record.activeProfileId === 'string' && profiles.some((p) => p.id === record.activeProfileId)
    ? record.activeProfileId
    : profiles[0].id

  return {
    customConnections,
    connectionOrder: normalizeConnectionOrder(record.connectionOrder, customConnections),
    clearInputAfterSubmit: typeof record.clearInputAfterSubmit === 'boolean' ? record.clearInputAfterSubmit : false,
    persistInputOnRestart: typeof record.persistInputOnRestart === 'boolean' ? record.persistInputOnRestart : true,
    reuseTaskApiProfileTemporarily: typeof record.reuseTaskApiProfileTemporarily === 'boolean' ? record.reuseTaskApiProfileTemporarily : false,
    alwaysShowRetryButton: typeof record.alwaysShowRetryButton === 'boolean' ? record.alwaysShowRetryButton : false,
    saveTasksToActiveFavoriteCollection: typeof record.saveTasksToActiveFavoriteCollection === 'boolean' ? record.saveTasksToActiveFavoriteCollection : true,
    retryMode: normalizeRetryMode(record.retryMode, record.alwaysShowRetryButton === true),
    allowPromptRewrite: typeof record.allowPromptRewrite === 'boolean' ? record.allowPromptRewrite : false,
    taskCompletionNotification: typeof record.taskCompletionNotification === 'boolean' ? record.taskCompletionNotification : false,
    enterSubmit: typeof record.enterSubmit === 'boolean' ? record.enterSubmit : false,
    colorMode: record.colorMode === 'light' || record.colorMode === 'dark' ? record.colorMode : 'system',
    showBatchPrompt: typeof record.showBatchPrompt === 'boolean' ? record.showBatchPrompt : false,
    batchPromptEnabled: typeof record.batchPromptEnabled === 'boolean' ? record.batchPromptEnabled : false,
    batchPromptMode: record.batchPromptMode === 'concurrent' ? 'concurrent' : 'queue',
    batchPromptConcurrencyLimited: typeof record.batchPromptConcurrencyLimited === 'boolean' ? record.batchPromptConcurrencyLimited : true,
    batchPromptConcurrency: normalizeBatchPromptConcurrency(record.batchPromptConcurrency),
    referenceImageEditAction: normalizeReferenceImageEditAction(record.referenceImageEditAction),
    zipDownloadRoutes: normalizeZipDownloadRoutes(record.zipDownloadRoutes),
    profiles,
    activeProfileId,
  }
}

export function getCustomConnectionDefinition(settings: Partial<AppSettings> | unknown, connectionId: ApiConnectionId): CustomConnectionDefinition | null {
  const normalized = normalizeSettings(settings)
  return normalized.customConnections.find((item) => item.id === connectionId) ?? null
}

export function getApiConnectionLabel(settings: Partial<AppSettings> | unknown, connectionId: ApiConnectionId): string {
  if (connectionId === 'openai-images') return 'OpenAI Images API'
  if (connectionId === 'openai-responses') return 'OpenAI Responses API'
  return getCustomConnectionDefinition(settings, connectionId)?.name ?? '接入已失效'
}

export function isApiConnectionAvailable(settings: Partial<AppSettings> | unknown, connectionId: ApiConnectionId): boolean {
  return BUILT_IN_CONNECTION_IDS.has(connectionId) || Boolean(getCustomConnectionDefinition(settings, connectionId))
}

export interface ImportedConnectionSettings extends PresetConfig {
  presetProfileFields?: Record<string, string[]>
}

function validateCustomConnectionTaskMappings(connections: CustomConnectionDefinition[]) {
  const invalid = connections.find((connection) =>
    (connection.submit.taskIdPath || connection.editSubmit?.taskIdPath) && !connection.poll,
  )
  if (invalid) throw new Error(`自定义服务商「${invalid.name}」配置了 taskIdPath，但缺少 poll`)
}

function stripMarkdownCodeFence(text: string): string {
  const trimmed = text.trim()
  const match = trimmed.match(/^```[^\r\n]*\r?\n([\s\S]*?)\r?\n```$/)
  return match ? match[1].trim() : trimmed
}

export function importCustomConnectionSettingsFromJson(
  jsonText: string,
  existingConnections: CustomConnectionDefinition[] = [],
  options: { deploymentConfig?: boolean } = {},
): ImportedConnectionSettings {
  let parsed: unknown
  try {
    parsed = JSON.parse(stripMarkdownCodeFence(jsonText))
  } catch {
    throw new Error('JSON 格式无效')
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('JSON 根节点必须是对象')
  }

  const record = parsed as Record<string, unknown>

  // 包裹结构：profiles 可独立于自定义服务商配置导入。
  if (Array.isArray(record.profiles) || Array.isArray(record.customConnections)) {
    validateImportedConnectionIds(record.customConnections, options.deploymentConfig)
    const customConnections = normalizeCustomConnectionDefinitions(record.customConnections)
    if (!options.deploymentConfig && Array.isArray(record.customConnections) && record.customConnections.length > 0 && !customConnections.length) {
      throw new Error('customConnections 数组中没有有效的服务商配置')
    }
    validateCustomConnectionTaskMappings(customConnections)
    const customConnectionIds = new Set(customConnections.map((connection) => connection.id))
    const nativeTransparentConnectionIds = new Set(customConnections.filter(customConnectionSupportsNativeTransparentBackground).map((connection) => connection.id))
    const profileEntries = normalizeDeploymentProfileEntries(record.profiles, customConnectionIds, nativeTransparentConnectionIds, options.deploymentConfig)
    const profiles = profileEntries.map((entry) => entry.profile)
    if (!options.deploymentConfig) return { customConnections, profiles }
    return {
      customConnections,
      profiles,
      ...(profileEntries.length
        ? { presetProfileFields: Object.fromEntries(profileEntries.map((entry) => [entry.profile.id, Object.keys(entry.source)])) }
        : {}),
    }
  }

  // 单个 Manifest 对象：{name, submit, ...}
  validateImportedConnectionIds([parsed], options.deploymentConfig)
  const usedIds = new Set(existingConnections.map((connection) => connection.id))
  const direct = normalizeCustomConnectionDefinition(parsed, usedIds)
  if (direct) {
    validateCustomConnectionTaskMappings([direct])
    return { customConnections: [direct], profiles: [] }
  }

  throw new Error('无法识别该 JSON。请粘贴自定义服务商配置。')
}

export function importCustomConnectionDefinitionFromJson(jsonText: string, existingConnections: CustomConnectionDefinition[] = []): CustomConnectionDefinition {
  const result = importCustomConnectionSettingsFromJson(jsonText, existingConnections)
  return result.customConnections[0]
}

/** 拆分模型列表，兼容中英文逗号并去重 */
export function splitModelList(value: string) {
  return Array.from(new Set(value.split(/[,，]/).map((item) => item.trim()).filter(Boolean)))
}

export function normalizeModelList(value: string) {
  return splitModelList(value).join(', ')
}

/** 将模型列表解析为实际请求使用的单个模型，优先使用 preferred，其次是首页选中的模型 */
export function resolveApiProfileModel(profile: ApiProfile, preferred?: string): ApiProfile {
  const models = splitModelList(profile.model)
  const model = [preferred, profile.selectedModel].find((item) => item && models.includes(item)) ?? models[0] ?? profile.model
  return { ...profile, model }
}

export function getActiveApiProfile(settings: Partial<AppSettings> | unknown): ApiProfile {
  const normalized = normalizeSettings(settings)
  const profile = normalized.profiles.find((p) => p.id === normalized.activeProfileId) ?? normalized.profiles[0]
  return resolveApiProfileModel(profile)
}

export function validateApiProfile(profile: ApiProfile, settings?: Partial<AppSettings> | unknown): string | null {
  if (!isApiConnectionAvailable(settings, profile.connectionId)) return '接入方式已不可用，请重新选择'
  if (!profile.name.trim()) return '缺少名称'
  if (!profile.baseUrl.trim() && !shouldUseApiProxy(profile.apiProxy)) return '缺少 API URL'
  if (!profile.apiKey.trim()) return '缺少 API Key'
  if (!profile.model.trim()) return '缺少模型 ID'
  return null
}

function isDefaultOpenAIProfile(profile: ApiProfile): boolean {
  return profile.id === DEFAULT_OPENAI_PROFILE_ID &&
    profile.name === '默认' &&
    profile.baseUrl === DEFAULT_API_BASE_URL &&
    profile.apiKey === '' &&
    profile.model === DEFAULT_IMAGES_MODEL &&
    profile.imageGenerationModel === DEFAULT_IMAGES_MODEL &&
    profile.timeout === DEFAULT_API_TIMEOUT &&
    profile.connectionId === 'openai-images' &&
    profile.reasoningEffort === undefined &&
    profile.codexCli === false &&
    profile.apiProxy === DEFAULT_OPENAI_API_PROXY &&
    profile.streamImages === false &&
    profile.streamPartialImages === DEFAULT_STREAM_PARTIAL_IMAGES &&
    profile.transparentBackgroundMethod === 'api' &&
    JSON.stringify(profile.homeParams) === JSON.stringify(normalizeHomeParamSelection(undefined)) &&
    Object.keys(profile.paramDefaults ?? {}).length === 0
}

function hasOnlyDefaultProfiles(settings: AppSettings): boolean {
  return settings.customConnections.length === 0 &&
    settings.profiles.length === 1 &&
    settings.activeProfileId === DEFAULT_OPENAI_PROFILE_ID &&
    isDefaultOpenAIProfile(settings.profiles[0])
}

function createImportedProfileId(connection: ApiConnectionId, usedIds: Set<string>): string {
  let id = `${connection}-imported-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  while (usedIds.has(id)) {
    id = `${connection}-imported-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  }
  usedIds.add(id)
  return id
}

function createPresetProfileId(connection: ApiConnectionId, record: Record<string, unknown>, usedIds: Set<string>): string {
  const text = JSON.stringify(record)
  let hash = 2166136261
  for (let idx = 0; idx < text.length; idx += 1) {
    hash ^= text.charCodeAt(idx)
    hash = Math.imul(hash, 16777619)
  }

  const base = `${connection}-preset-${(hash >>> 0).toString(36)}`
  let id = base
  let suffix = 2
  while (usedIds.has(id)) {
    id = `${base}-${suffix}`
    suffix += 1
  }
  usedIds.add(id)
  return id
}

function getApiProfileDedupKey(profile: ApiProfile): string {
  return JSON.stringify([
    profile.connectionId,
    profile.baseUrl.trim().toLowerCase(),
    profile.apiKey.trim(),
    profile.model.trim(),
    profile.imageGenerationModel?.trim(),
    profile.reasoningEffort,
  ])
}

function getApiProfileConnectionKey(profile: ApiProfile): string {
  return JSON.stringify([
    profile.connectionId,
    profile.baseUrl.trim().toLowerCase(),
    profile.model.trim(),
    profile.imageGenerationModel?.trim(),
    profile.reasoningEffort,
  ])
}

function getCustomConnectionDedupKey(connection: CustomConnectionDefinition): string {
  return JSON.stringify([
    connection.name,
    connection.template ?? 'http-image',
    connection.submit,
    connection.editSubmit ?? null,
    connection.poll ?? null,
  ])
}

function mergeImportedCustomConnections(currentConnections: CustomConnectionDefinition[], importedConnections: CustomConnectionDefinition[]) {
  const connections = [...currentConnections]
  const connectionIdMap = new Map<string, string>()
  const usedIds = new Set(connections.map((connection) => connection.id))

  for (const connection of importedConnections) {
    const sameIdIdx = connections.findIndex((item) => item.id === connection.id)
    if (sameIdIdx >= 0) {
      connections[sameIdIdx] = connection
      connectionIdMap.set(connection.id, connection.id)
      continue
    }

    const normalized = normalizeCustomConnectionDefinition(connection, usedIds)
    if (!normalized) continue
    connectionIdMap.set(connection.id, normalized.id)
    connections.push(normalized)
  }

  return { connections, connectionIdMap }
}

export function findEquivalentApiProfile(
  settings: Partial<AppSettings> | unknown,
  importedProfile: ApiProfile,
  importedConnections: CustomConnectionDefinition[] = [],
): ApiProfile | null {
  const normalized = normalizeSettings(settings)
  const importedConnection = importedConnections.find((connection) => connection.id === importedProfile.connectionId)
  const connection = importedConnection
    ? normalized.customConnections.find((connection) => getCustomConnectionDedupKey(connection) === getCustomConnectionDedupKey(importedConnection))?.id ?? importedProfile.connectionId
    : importedProfile.connectionId
  const profile = { ...importedProfile, connection }
  const byId = normalized.profiles.find((item) => item.id === profile.id)
  if (byId) return byId
  const dedupKey = getApiProfileDedupKey(profile)
  const exact = normalized.profiles.find((item) => getApiProfileDedupKey(item) === dedupKey)
  if (exact) return exact

  if (profile.apiKey.trim()) return null
  const connectionKey = getApiProfileConnectionKey(profile)
  return normalized.profiles.find((item) => getApiProfileConnectionKey(item) === connectionKey) ?? null
}

export function mergeImportedSettings(
  currentSettings: Partial<AppSettings> | unknown,
  importedSettings: Partial<AppSettings> | unknown,
  options: { preserveInternalIds?: boolean } = {},
): AppSettings {
  const current = normalizeSettings(currentSettings)
  const normalizedImported = normalizeSettings(importedSettings)
  const imported = normalizeSettings({
    ...normalizedImported,
    customConnections: normalizedImported.customConnections,
    profiles: normalizedImported.profiles.map((profile) => ({
      ...profile,
      isDefault: undefined,
    })),
  })

  if (options.preserveInternalIds) {
    if (hasOnlyDefaultProfiles(current)) return imported

    const customConnections = [...current.customConnections]
    for (const connection of imported.customConnections) {
      const idx = customConnections.findIndex((item) => item.id === connection.id)
      if (idx >= 0) customConnections[idx] = connection
      else customConnections.push(connection)
    }
    const profiles = [...current.profiles]
    for (const profile of imported.profiles) {
      const idx = profiles.findIndex((item) => item.id === profile.id)
      if (idx >= 0) profiles[idx] = profile
      else profiles.push(profile)
    }
    return normalizeSettings({ ...current, customConnections, profiles, activeProfileId: current.activeProfileId })
  }

  if (hasOnlyDefaultProfiles(current)) {
    return imported
  }

  const { connections: customConnections, connectionIdMap } = mergeImportedCustomConnections(current.customConnections, imported.customConnections)
  const profiles = [...current.profiles]
  for (const importedProfile of imported.profiles) {
    const profile = connectionIdMap.has(importedProfile.connectionId)
      ? { ...importedProfile, connectionId: connectionIdMap.get(importedProfile.connectionId) ?? importedProfile.connectionId }
      : importedProfile
    const sameIdIdx = profiles.findIndex((item) => item.id === profile.id)
    if (sameIdIdx >= 0) {
      profiles[sameIdIdx] = profile
      continue
    }
    profiles.push(profile)
  }

  return normalizeSettings({
    ...current,
    customConnections,
    profiles,
    activeProfileId: current.activeProfileId,
  })
}

const PRESET_PROFILE_DEPLOYMENT_KEYS = [
  'name',
  'description',
  'connectionId',
  'baseUrl',
  'model',
  'imageGenerationModel',
  'timeout',
  'reasoningEffort',
  'codexCli',
  'apiProxy',
  'responseFormatB64Json',
  'streamImages',
  'streamPartialImages',
  'transparentBackgroundMethod',
  'connectionDrafts',
  'homeParams',
  'paramDefaults',
] as const

function getPresetDeploymentFields(input: unknown, id: string, source: object) {
  if (!isRecord(input) || !Array.isArray(input[id])) return new Set(Object.keys(source))
  return new Set(input[id].filter((key): key is string => typeof key === 'string'))
}

function mergePresetProfileSnapshot(previous: ApiProfile, imported: ApiProfile, fields: Set<string>) {
  if (previous.connectionId !== imported.connectionId) return imported

  const patch: Partial<ApiProfile> = {}
  for (const key of PRESET_PROFILE_DEPLOYMENT_KEYS) {
    if (fields.has(key)) Object.assign(patch, { [key]: imported[key] })
  }
  return { ...previous, ...patch, id: imported.id, isDefault: imported.isDefault }
}

export function mergePresetImportedSettings(
  currentSettings: Partial<AppSettings> | unknown,
  importedSettings: Partial<AppSettings> | unknown,
  options: {
    lockPresetParams?: boolean
    dismissedPresetProfileIds?: string[]
    dismissedPresetConnectionIds?: string[]
    previousPresetConfig?: PresetConfig | null
    usedPresetProfileIds?: string[]
  } = {},
): { settings: AppSettings; presetConfig: PresetConfig } {
  const importedRecord = isRecord(importedSettings) ? importedSettings : {}
  validateImportedConnectionIds(importedRecord.customConnections, true)
  const normalizedImported = normalizeSettings(importedSettings)
  const current = normalizeSettings(currentSettings)
  const customConnectionIds = new Set(normalizedImported.customConnections.map((connection) => connection.id))
  const nativeTransparentConnectionIds = new Set(normalizedImported.customConnections.filter(customConnectionSupportsNativeTransparentBackground).map((connection) => connection.id))
  const allSourceProfileEntries = normalizeDeploymentProfileEntries(importedRecord.profiles, customConnectionIds, nativeTransparentConnectionIds, true).map((entry) => ({
    profile: entry.profile,
    source: entry.source,
    isDefault: entry.source.isDefault === true,
  }))
  const dismissedIds = new Set(options.dismissedPresetProfileIds ?? [])
  const dismissedConnectionIds = new Set(options.dismissedPresetConnectionIds ?? [])
  const sourceProfileEntries = allSourceProfileEntries.filter((entry) => !dismissedIds.has(entry.profile.id))
  const sourceProfiles = sourceProfileEntries.map((entry) => entry.profile)
  const sourceProfileIds = new Set(allSourceProfileEntries.map((entry) => entry.profile.id))
  const sourceDefaultProfileId = allSourceProfileEntries.length === 1
    ? allSourceProfileEntries[0].profile.id
    : allSourceProfileEntries.find((entry) => entry.isDefault)?.profile.id ?? null
  const replacingPristineDefault = sourceProfiles.length > 0 && hasOnlyDefaultProfiles(current)
  const currentConnectionsById = new Map(current.customConnections.map((connection) => [connection.id, connection]))
  const previousProfilesById = new Map(options.previousPresetConfig?.profiles.map((profile) => [profile.id, profile]) ?? [])
  const previousConnectionsById = new Map(options.previousPresetConfig?.customConnections.map((connection) => [connection.id, connection]) ?? [])
  const nextConnections = normalizedImported.customConnections.filter((connection) => !dismissedConnectionIds.has(connection.id)).map((connection) => {
    const matched = currentConnectionsById.get(connection.id)
    const previous = previousConnectionsById.get(connection.id)
    if (!matched || options.lockPresetParams) return connection
    if (!previous || JSON.stringify(connection) === JSON.stringify(previous)) return matched
    return connection
  })
  const sourceConnectionIds = new Set(normalizedImported.customConnections.map((connection) => connection.id))
  const usedPresetProfileIds = new Set(options.usedPresetProfileIds ?? [])
  const modifiedConnectionIds = new Set(current.customConnections
    .filter((connection) => {
      const previous = previousConnectionsById.get(connection.id)
      return previous && JSON.stringify(connection) !== JSON.stringify(previous)
    })
    .map((connection) => connection.id))
  const removableProfileIds = new Set(current.profiles
    .filter((profile) => {
      const previous = previousProfilesById.get(profile.id)
      if (!previous || sourceProfileIds.has(profile.id) || usedPresetProfileIds.has(profile.id) || modifiedConnectionIds.has(profile.connectionId)) return false
      return JSON.stringify({ ...profile, isDefault: undefined }) === JSON.stringify({ ...previous, isDefault: undefined })
    })
    .map((profile) => profile.id))

  const currentProfilesById = new Map(current.profiles.map((profile) => [profile.id, profile]))
  const nextProfiles = sourceProfileEntries.map((entry) => {
    const matched = replacingPristineDefault ? undefined : currentProfilesById.get(entry.profile.id)
    const normalizedProfile = {
      ...entry.profile,
      isDefault: entry.profile.id === sourceDefaultProfileId ? true : undefined,
    }
    const previous = previousProfilesById.get(entry.profile.id)
    const fields = getPresetDeploymentFields(importedRecord.presetProfileFields, entry.profile.id, entry.source)
    const importedProfile = previous
      ? mergePresetProfileSnapshot(previous, normalizedProfile, fields)
      : normalizedProfile
    if (!matched) return importedProfile
    if (options.lockPresetParams) return { ...importedProfile, apiKey: matched.apiKey }
    if (!previous) return { ...matched, baseUrl: importedProfile.baseUrl, isDefault: importedProfile.isDefault }

    const changed: Partial<ApiProfile> = {}
    for (const key of PRESET_PROFILE_DEPLOYMENT_KEYS) {
      if (JSON.stringify(importedProfile[key]) !== JSON.stringify(previous[key])) {
        Object.assign(changed, { [key]: importedProfile[key] })
      }
    }
    return { ...matched, ...changed, isDefault: importedProfile.isDefault }
  })
  const nextProfilesById = new Map(nextProfiles.map((profile) => [profile.id, profile]))
  const profiles = replacingPristineDefault
    ? nextProfiles
    : [
        ...current.profiles
          .filter((profile) => !removableProfileIds.has(profile.id))
          .map((profile) => nextProfilesById.get(profile.id) ?? (profile.isDefault ? { ...profile, isDefault: undefined } : profile)),
        ...nextProfiles.filter((profile) => !currentProfilesById.has(profile.id)),
      ]
  const retainedConnections = current.customConnections
    .filter((connection) => !sourceConnectionIds.has(connection.id))
    .filter((connection) => {
      const previous = previousConnectionsById.get(connection.id)
      const unchangedRemovedPreset = previous && JSON.stringify(connection) === JSON.stringify(previous)
      return !unchangedRemovedPreset || profiles.some((profile) => profile.connectionId === connection.id)
    })
  const customConnections = [...nextConnections, ...retainedConnections]
  const presetConnections = [...normalizedImported.customConnections]
  for (const connection of options.previousPresetConfig?.customConnections ?? []) {
    if (!sourceConnectionIds.has(connection.id) && customConnections.some((item) => item.id === connection.id)) presetConnections.push(connection)
  }
  const presetProfiles: ApiProfile[] = allSourceProfileEntries.map((entry) => {
    const normalizedProfile = {
      ...entry.profile,
      isDefault: entry.profile.id === sourceDefaultProfileId ? true : undefined,
    }
    const previous = previousProfilesById.get(entry.profile.id)
    if (!previous) return normalizedProfile
    const fields = getPresetDeploymentFields(importedRecord.presetProfileFields, entry.profile.id, entry.source)
    return mergePresetProfileSnapshot(previous, normalizedProfile, fields)
  })
  for (const profile of options.previousPresetConfig?.profiles ?? []) {
    if (!sourceProfileIds.has(profile.id) && profiles.some((item) => item.id === profile.id)) presetProfiles.push(profile)
  }

  return {
    settings: normalizeSettings({
      ...current,
      customConnections,
      profiles,
      activeProfileId: replacingPristineDefault ? sourceDefaultProfileId ?? nextProfiles[0].id : current.activeProfileId,
    }),
    presetConfig: {
      customConnections: presetConnections,
      profiles: presetProfiles,
    },
  }
}

export const DEFAULT_SETTINGS: AppSettings = normalizeSettings({
  profiles: [createDefaultOpenAIProfile()],
})
