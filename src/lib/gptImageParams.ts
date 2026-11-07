import type { ApiProfile, TaskParams } from '../types'

export function normalizeGifParams(params: Pick<TaskParams, 'frame_count' | 'frame_duration_ms'>) {
  return {
    frame_count: Math.min(16, Math.max(2, Math.trunc(params.frame_count ?? 9))),
    frame_duration_ms: Math.min(2000, Math.max(20, Math.round((params.frame_duration_ms ?? 200) / 10) * 10)),
  }
}

export function getGptImage26Params(params: TaskParams, profile: ApiProfile) {
  return {
    ...(params.complexity && params.complexity !== 'default' ? { complexity: params.complexity } : {}),
    ...(params.output_format === 'svg' && profile.svgModel?.trim() ? { svg: { model: profile.svgModel.trim() } } : {}),
    ...(params.output_format === 'gif' ? normalizeGifParams(params) : {}),
  }
}
