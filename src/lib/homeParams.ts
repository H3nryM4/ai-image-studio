import { DEFAULT_HOME_PARAMS, DEFAULT_PARAMS, HOME_PARAM_KEYS, type ApiProfile, type CustomConnectionDefinition, type HomeParam, type TaskParams } from '../types'

export const HOME_PARAM_OPTIONS: Array<{ value: HomeParam; label: string }> = [
  { value: 'quality', label: '质量' },
  { value: 'output_format', label: '图片格式' },
  { value: 'transparent_output', label: '透明背景' },
  { value: 'output_compression', label: '压缩参数' },
  { value: 'moderation', label: '内容审核级别' },
]

export function normalizeHomeParamSelection(value: unknown): HomeParam[] {
  return Array.isArray(value) ? HOME_PARAM_KEYS.filter((key) => value.includes(key)) : [...DEFAULT_HOME_PARAMS]
}

export function normalizeParamDefaults(value: unknown): NonNullable<ApiProfile['paramDefaults']> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const record = value as Record<string, unknown>
  const defaults: NonNullable<ApiProfile['paramDefaults']> = {}
  if (typeof record.quality === 'string' && ['auto', 'low', 'medium', 'high', 'xhigh', 'max'].includes(record.quality)) defaults.quality = record.quality as TaskParams['quality']
  if (typeof record.output_format === 'string' && ['png', 'jpeg', 'webp'].includes(record.output_format)) defaults.output_format = record.output_format as TaskParams['output_format']
  if (typeof record.transparent_output === 'boolean') defaults.transparent_output = record.transparent_output
  if (record.moderation === 'auto' || record.moderation === 'low') defaults.moderation = record.moderation
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
  const keys = Object.keys(DEFAULT_PARAMS) as Array<keyof TaskParams>
  const variables = new Set<string>()
  if (connection) {
    const mapping = hasInputImages && connection.editSubmit ? connection.editSubmit : connection.submit
    collectTemplateVariables([mapping.method === 'GET' ? undefined : mapping.body, mapping.query], variables)
  }
  const openAI = profile.connectionId === 'openai-images' || profile.connectionId === 'openai-responses'
  const available = keys.filter((key) => {
    if (key === 'quality' && profile.codexCli) return false
    if (openAI) return true
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
  const state = getHomeParamState(profile, connection, hasInputImages)
  const next = { ...params }
  const defaults = { ...DEFAULT_PARAMS, ...profile.paramDefaults }
  // 隐藏只影响首页取值；请求是否发送参数由协议或自定义模板决定。
  for (const key of Object.keys(DEFAULT_PARAMS) as Array<keyof TaskParams>) {
    if (!state.available.includes(key) || (HOME_PARAM_KEYS.includes(key as HomeParam) && !state.visible.includes(key as HomeParam))) {
      Object.assign(next, { [key]: defaults[key] })
    }
  }
  if (next.output_format === 'png') next.output_compression = null
  if (next.output_format === 'jpeg') next.transparent_output = false
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
