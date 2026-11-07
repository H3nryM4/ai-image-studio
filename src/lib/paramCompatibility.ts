import { DEFAULT_PARAMS, type AppSettings, type TaskParams } from '../types'
import { getActiveApiProfile, isApiConnectionAvailable } from './apiProfiles'
import { isGptImage25Model, isVectorOrAnimatedFormat, supportsGptImage26Params } from './imageModels'
import { normalizeGifParams } from './gptImageParams'
import { normalizeCodexCliImageSize, normalizeImageSize } from './size'
import { GEMINI_CONNECTION_ID, normalizeGeminiParams } from './gemini'
import { GROK_CONNECTION_ID, normalizeGrokParams } from './grok'

export const MAX_OPENAI_OUTPUT_IMAGES = 10

export function normalizeParamsForSettings(
  params: TaskParams,
  settings: AppSettings,
): TaskParams {
  const activeProfile = getActiveApiProfile(settings)
  if (activeProfile.connectionId === GEMINI_CONNECTION_ID) return normalizeGeminiParams({ ...params, n: Math.min(MAX_OPENAI_OUTPUT_IMAGES, Math.max(1, Math.trunc(params.n) || 1)) }, activeProfile.model)
  if (activeProfile.connectionId === GROK_CONNECTION_ID) return normalizeGrokParams(params, activeProfile.model)
  const nextParams: TaskParams = {
    ...params,
    size: normalizeImageSize(params.size) || DEFAULT_PARAMS.size,
    n: Math.min(MAX_OPENAI_OUTPUT_IMAGES, Math.max(1, Math.trunc(params.n) || DEFAULT_PARAMS.n)),
    ...normalizeGifParams(params),
  }

  if (isApiConnectionAvailable(settings, activeProfile.connectionId) && activeProfile.codexCli) {
    nextParams.size = normalizeCodexCliImageSize(nextParams.size)
    nextParams.quality = DEFAULT_PARAMS.quality
  }

  if ((nextParams.quality === 'xhigh' || nextParams.quality === 'max') && !isGptImage25Model(activeProfile.model)) {
    nextParams.quality = 'high'
  }
  if (activeProfile.connectionId === 'openai-images' && !supportsGptImage26Params(activeProfile.model)) {
    nextParams.complexity = 'default'
    if (isVectorOrAnimatedFormat(nextParams.output_format)) nextParams.output_format = 'default'
  }
  if (isVectorOrAnimatedFormat(nextParams.output_format)) {
    nextParams.output_compression = null
    if (nextParams.output_format === 'svg') nextParams.n = 1
    if (activeProfile.transparentBackgroundMethod === 'local') nextParams.transparent_output = false
  }

  if (nextParams.output_format === 'png') {
    nextParams.output_compression = DEFAULT_PARAMS.output_compression
  }

  return nextParams
}

export function getChangedParams(current: TaskParams, next: TaskParams): Partial<TaskParams> {
  const patch: Partial<TaskParams> = {}
  for (const key of Object.keys(next) as Array<keyof TaskParams>) {
    if (current[key] !== next[key]) {
      ;(patch as Record<keyof TaskParams, TaskParams[keyof TaskParams]>)[key] = next[key]
    }
  }
  return patch
}
