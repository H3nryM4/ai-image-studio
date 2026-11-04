import { DEFAULT_PARAMS, type AppSettings, type TaskParams } from '../types'
import { getActiveApiProfile, isApiConnectionAvailable } from './apiProfiles'
import { getImageGenerationModel, isGptImage25Model } from './imageModels'
import { normalizeCodexCliImageSize, normalizeImageSize } from './size'

export const MAX_OPENAI_OUTPUT_IMAGES = 10

export function normalizeParamsForSettings(
  params: TaskParams,
  settings: AppSettings,
): TaskParams {
  const activeProfile = getActiveApiProfile(settings)
  const nextParams: TaskParams = {
    ...params,
    size: normalizeImageSize(params.size) || DEFAULT_PARAMS.size,
    n: Math.min(MAX_OPENAI_OUTPUT_IMAGES, Math.max(1, params.n || DEFAULT_PARAMS.n)),
  }

  if (isApiConnectionAvailable(settings, activeProfile.connectionId) && activeProfile.codexCli) {
    nextParams.size = normalizeCodexCliImageSize(nextParams.size)
    nextParams.quality = DEFAULT_PARAMS.quality
  }

  if ((nextParams.quality === 'xhigh' || nextParams.quality === 'max') && !isGptImage25Model(getImageGenerationModel(activeProfile))) {
    nextParams.quality = 'high'
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
