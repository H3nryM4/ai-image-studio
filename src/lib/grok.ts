import { DEFAULT_PARAMS, type TaskParams } from '../types'

export const GROK_CONNECTION_ID = 'xai-images'
export const DEFAULT_GROK_BASE_URL = 'https://api.x.ai/v1'
export const DEFAULT_GROK_MODEL = 'grok-imagine-image-2.0'

export function getGrokImageOptions(model: string) {
  return {
    ratios: ['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9', '21:9', '9:19.5', '19.5:9', '9:20', '20:9', '1:2', '2:1', '5:2'],
    resolutions: ['1K', '2K'],
    maxInputImages: 5,
    maxOutputImages: 10,
    supportsQuality: /(?:^|\/)grok-imagine-image-2[.-]0(?:$|[-/])/i.test(model),
  }
}

export function normalizeGrokParams(params: TaskParams, model: string): TaskParams {
  const options = getGrokImageOptions(model)
  return {
    ...params,
    size: 'auto',
    aspect_ratio: options.ratios.includes(params.aspect_ratio ?? '') ? params.aspect_ratio : 'auto',
    image_size: options.resolutions.includes(params.image_size ?? '') ? params.image_size : 'auto',
    n: Math.min(options.maxOutputImages, Math.max(1, Math.trunc(params.n) || 1)),
    quality: options.supportsQuality && ['auto', 'low', 'medium'].includes(params.quality) ? params.quality : 'default',
    output_format: 'default',
    output_compression: null,
    moderation: 'default',
    background: 'default',
    thinking_level: 'default',
    complexity: 'default',
    frame_count: DEFAULT_PARAMS.frame_count,
    frame_duration_ms: DEFAULT_PARAMS.frame_duration_ms,
  }
}
