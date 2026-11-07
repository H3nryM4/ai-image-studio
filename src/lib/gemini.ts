import { DEFAULT_PARAMS, type TaskParams } from '../types'
import { buildApiUrl, normalizeBaseUrl } from './devProxy'

export const GEMINI_CONNECTION_ID = 'gemini-generate-content'
export const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
export const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-image'

export function getGeminiImageOptions(model: string) {
  const id = model.toLowerCase()
  const firstGeneration = /gemini-2\.5-|(?:^|\/)(?:gemini-)?nano[-_]?banana(?:$|[-_](?:image|preview)(?:$|[-_]))/.test(id)
  const flashLite = /flash-lite-image|nano[-_]?banana-(?:2-)?lite(?:$|[-_])/.test(id)
  const banana21 = /nano[-_]?banana-2[._-]1(?:$|[-_])/.test(id)
  const flash31 = /gemini-3\.1-flash-image|nano[-_]?banana-2(?:$|[._-])/.test(id) && !banana21 && !flashLite
  const extended = flash31 || banana21
  return {
    ratios: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9', ...(extended ? ['1:4', '4:1', '1:8', '8:1'] : [])],
    resolutions: firstGeneration ? [] : flashLite ? ['1K'] : [...(flash31 ? ['512'] : []), '1K', '2K', '4K'],
    // 2.5 按官方推荐限制为三张；其他模型使用本应用支持的十四张上限。
    maxInputImages: firstGeneration ? 3 : 14,
    thinkingLevels: banana21 ? ['minimal', 'medium', 'high'] : flash31 || flashLite ? ['minimal', 'high'] : [],
  }
}

export function normalizeGeminiParams(params: TaskParams, model: string): TaskParams {
  const options = getGeminiImageOptions(model)
  return {
    ...params,
    size: 'auto',
    aspect_ratio: options.ratios.includes(params.aspect_ratio ?? '') ? params.aspect_ratio : 'auto',
    image_size: options.resolutions.includes(params.image_size ?? '') ? params.image_size : 'auto',
    thinking_level: options.thinkingLevels.includes(params.thinking_level ?? '') ? params.thinking_level : 'default',
    quality: 'default',
    output_format: 'default',
    output_compression: null,
    moderation: 'default',
    background: 'default',
    complexity: 'default',
    frame_count: DEFAULT_PARAMS.frame_count,
    frame_duration_ms: DEFAULT_PARAMS.frame_duration_ms,
  }
}

export function normalizeGeminiBaseUrl(baseUrl: string) {
  return normalizeBaseUrl(baseUrl.trim() || DEFAULT_GEMINI_BASE_URL, 'v1beta')
}

export function buildGeminiApiUrl(baseUrl: string, model: string) {
  const base = new URL(buildApiUrl(baseUrl.trim() || DEFAULT_GEMINI_BASE_URL, `models/${encodeURIComponent(model.replace(/^models\//, ''))}:generateContent`, null, false, 'v1beta'))
  if (base.protocol !== 'https:' && base.protocol !== 'http:') throw new Error('Gemini API 地址必须使用 HTTP 或 HTTPS')
  return base.toString()
}
