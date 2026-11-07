import { DEFAULT_HOME_PARAMS, DEFAULT_PARAMS, HOME_PARAM_KEYS, OUTPUT_FORMATS, type ApiProfile, type CustomConnectionDefinition, type HomeParam, type TaskParams } from '../types'
import { GEMINI_CONNECTION_ID, getGeminiImageOptions, normalizeGeminiParams } from './gemini'
import { GROK_CONNECTION_ID, getGrokImageOptions, normalizeGrokParams } from './grok'
import { isVectorOrAnimatedFormat, supportsGptImage26Params } from './imageModels'
import { normalizeGifParams } from './gptImageParams'

export const HOME_PARAM_OPTIONS: Array<{ value: HomeParam; label: string }> = [
  { value: 'quality', label: '质量' },
  { value: 'complexity', label: '复杂度' },
  { value: 'output_format', label: '图片格式' },
  { value: 'frame_count', label: 'GIF 帧数' },
  { value: 'frame_duration_ms', label: '每帧时长' },
  { value: 'transparent_output', label: '透明背景' },
  { value: 'output_compression', label: '压缩参数' },
  { value: 'moderation', label: '内容审核级别' },
  { value: 'thinking_level', label: '思考强度' },
  { value: 'n', label: '数量' },
]

export function normalizeHomeParamSelection(value: unknown): HomeParam[] {
  return Array.isArray(value) ? HOME_PARAM_KEYS.filter((key) => value.includes(key)) : [...DEFAULT_HOME_PARAMS]
}

export function normalizeParamDefaults(value: unknown): NonNullable<ApiProfile['paramDefaults']> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const record = value as Record<string, unknown>
  const defaults: NonNullable<ApiProfile['paramDefaults']> = {}
  if (typeof record.n === 'number' && Number.isFinite(record.n)) defaults.n = Math.min(10, Math.max(1, Math.trunc(record.n)))
  if (typeof record.size === 'string' && /^(default|auto|\d+[xX]\d+)$/.test(record.size)) defaults.size = record.size
  if (typeof record.background === 'string' && ['default', 'auto', 'opaque', 'transparent'].includes(record.background)) defaults.background = record.background as TaskParams['background']
  if (typeof record.thinking_level === 'string' && ['default', 'minimal', 'medium', 'high'].includes(record.thinking_level)) defaults.thinking_level = record.thinking_level as TaskParams['thinking_level']
  if (typeof record.quality === 'string' && ['default', 'auto', 'low', 'medium', 'high', 'xhigh', 'max'].includes(record.quality)) defaults.quality = record.quality as TaskParams['quality']
  if (record.output_format === 'default' || OUTPUT_FORMATS.includes(record.output_format as typeof OUTPUT_FORMATS[number])) defaults.output_format = record.output_format as TaskParams['output_format']
  if (typeof record.complexity === 'string' && ['default', 'low', 'medium', 'high'].includes(record.complexity)) defaults.complexity = record.complexity as TaskParams['complexity']
  const gif = normalizeGifParams({ frame_count: typeof record.frame_count === 'number' ? record.frame_count : undefined, frame_duration_ms: typeof record.frame_duration_ms === 'number' ? record.frame_duration_ms : undefined })
  if (typeof record.frame_count === 'number' && Number.isFinite(record.frame_count)) defaults.frame_count = gif.frame_count
  if (typeof record.frame_duration_ms === 'number' && Number.isFinite(record.frame_duration_ms)) defaults.frame_duration_ms = gif.frame_duration_ms
  if (typeof record.transparent_output === 'boolean') defaults.transparent_output = record.transparent_output
  if (record.moderation === 'default' || record.moderation === 'auto' || record.moderation === 'low') defaults.moderation = record.moderation
  if (record.output_compression === null) defaults.output_compression = null
  if (typeof record.output_compression === 'number' && Number.isFinite(record.output_compression)) {
    defaults.output_compression = Math.max(0, Math.min(100, Math.round(record.output_compression)))
  }
  return defaults
}

function collectTemplateVariables(value: unknown, variables: Set<string>) {
  if (typeof value === 'string') {
    if (value.startsWith('$')) variables.add(value)
    return
  }
  if (!value || typeof value !== 'object') return
  for (const item of Object.values(value)) collectTemplateVariables(item, variables)
}

export function getHomeParamState(profile: ApiProfile, connection?: CustomConnectionDefinition | null, hasInputImages = false) {
  if (profile.connectionId === GROK_CONNECTION_ID) {
    const available: Array<keyof TaskParams> = ['size', 'n', 'transparent_output', ...(getGrokImageOptions(profile.model).supportsQuality ? ['quality' as const] : [])]
    return { available, visible: (profile.homeParams ?? []).filter((key) => available.includes(key)) }
  }
  if (profile.connectionId === GEMINI_CONNECTION_ID) {
    return {
      available: ['size', 'n', 'transparent_output', ...(getGeminiImageOptions(profile.model).thinkingLevels.length ? ['thinking_level'] : [])] as Array<keyof TaskParams>,
      visible: (profile.homeParams ?? []).filter((key) => key === 'n' || key === 'transparent_output' || (key === 'thinking_level' && getGeminiImageOptions(profile.model).thinkingLevels.length > 0)),
    }
  }
  const keys = Object.keys(DEFAULT_PARAMS) as Array<keyof TaskParams>
  const variables = new Set<string>()
  if (connection) {
    const mapping = hasInputImages && connection.editSubmit ? connection.editSubmit : connection.submit
    collectTemplateVariables([mapping.method === 'GET' ? undefined : mapping.body, mapping.query], variables)
  }
  const openAI = profile.connectionId === 'openai-images'
  const available = keys.filter((key) => {
    if (key === 'thinking_level') return false
    if (key === 'quality' && profile.codexCli) return false
    if (openAI) return !['complexity', 'frame_count', 'frame_duration_ms'].includes(key) || supportsGptImage26Params(profile.model)
    if (!connection) return false
    if (key === 'n' && profile.codexCli && !(hasInputImages && connection.editSubmit ? connection.editSubmit : connection.submit).taskIdPath) return true
    if (key === 'size' && profile.codexCli) return variables.has('$prompt')
    if (key === 'transparent_output') {
      return profile.transparentBackgroundMethod === 'local'
        ? variables.has('$prompt')
        : variables.has('$params.background') || variables.has('$params')
    }
    return variables.has(`$params.${key}`) || variables.has('$params')
  })
  const selected = profile.homeParams ?? DEFAULT_HOME_PARAMS
  return {
    available,
    visible: HOME_PARAM_KEYS.filter((key) => selected.includes(key) && available.includes(key)),
  }
}

export function normalizeHomeParams(params: TaskParams, profile: ApiProfile, connection?: CustomConnectionDefinition | null, hasInputImages = false): TaskParams {
  if (profile.connectionId === GROK_CONNECTION_ID) {
    return normalizeGrokParams({
      ...params,
      quality: profile.homeParams?.includes('quality') ? params.quality : profile.paramDefaults?.quality ?? 'default',
      transparent_output: profile.homeParams?.includes('transparent_output') ? params.transparent_output : profile.paramDefaults?.transparent_output ?? false,
      n: profile.homeParams?.includes('n') ? params.n : profile.paramDefaults?.n ?? 1,
    }, profile.model)
  }
  if (profile.connectionId === GEMINI_CONNECTION_ID) {
    return normalizeGeminiParams({
      ...params,
      transparent_output: profile.homeParams?.includes('transparent_output') ? params.transparent_output : profile.paramDefaults?.transparent_output ?? false,
      n: profile.homeParams?.includes('n') ? params.n : profile.paramDefaults?.n ?? 1,
      thinking_level: profile.homeParams?.includes('thinking_level') ? params.thinking_level : profile.paramDefaults?.thinking_level ?? 'default',
    }, profile.model)
  }
  const state = getHomeParamState(profile, connection, hasInputImages)
  const next = { ...params }
  const defaults = { ...DEFAULT_PARAMS, ...profile.paramDefaults }
  // 隐藏只影响首页取值；请求是否发送参数由协议或自定义模板决定。
  for (const key of Object.keys(DEFAULT_PARAMS) as Array<keyof TaskParams>) {
    if (!state.available.includes(key) || (HOME_PARAM_KEYS.includes(key as HomeParam) && !state.visible.includes(key as HomeParam))) {
      Object.assign(next, { [key]: defaults[key] })
    }
  }
  if (!state.visible.includes('transparent_output')) next.background = profile.paramDefaults?.background
  if (profile.transparentBackgroundMethod === 'local') next.background = 'default'
  if (profile.transparentBackgroundMethod === 'api' && next.background) next.transparent_output = next.background === 'transparent'
  if (next.output_format === 'png') next.output_compression = null
  if (next.output_format === 'jpeg') {
    next.transparent_output = false
    if (next.background === 'transparent') next.background = 'opaque'
  }
  if (isVectorOrAnimatedFormat(next.output_format)) {
    next.output_compression = null
    if (next.output_format === 'svg') next.n = 1
    if (profile.transparentBackgroundMethod === 'local') next.transparent_output = false
  }
  return next
}

export function switchHomeParams(params: TaskParams, saved: Record<string, TaskParams>, previous: ApiProfile, next: ApiProfile) {
  const previousKey = `${previous.id}:${previous.connectionId}`
  const nextKey = `${next.id}:${next.connectionId}`
  if (previousKey === nextKey) {
    const changed = { ...params }
    for (const key of HOME_PARAM_KEYS) {
      if (params[key] === (previous.paramDefaults?.[key] ?? DEFAULT_PARAMS[key])) {
        Object.assign(changed, { [key]: next.paramDefaults?.[key] ?? DEFAULT_PARAMS[key] })
      }
    }
    return { params: changed, paramsByProfile: saved }
  }
  return {
    params: { ...DEFAULT_PARAMS, ...next.paramDefaults, ...saved[nextKey] },
    paramsByProfile: { ...saved, [previousKey]: { ...params } },
  }
}
