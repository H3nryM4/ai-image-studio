import type { TaskParams } from '../types'
import { buildApiUrl, normalizeBaseUrl } from './devProxy'

export const GEMINI_CONNECTION_ID = 'gemini-generate-content'
export const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
export const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-image'

export function getGeminiImageOptions(model: string) {
  const id = model.toLowerCase()
  const extended = id.includes('3.1-flash-image') || id.includes('nano-banana-2.1')
  return {
    ratios: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9', ...(extended ? ['1:4', '4:1', '1:8', '8:1'] : [])],
    resolutions: id.includes('2.5-flash-image') || id.includes('flash-lite-image')
      ? ['1K']
      : [...(id.includes('3.1-flash-image') ? ['512'] : []), '1K', '2K', '4K'],
    // 2.5 按官方推荐限制为三张；其他模型使用本应用支持的十四张上限。
    maxInputImages: id.includes('2.5-flash-image') ? 3 : 14,
    thinkingLevels: id.includes('nano-banana-2.1') ? ['minimal', 'medium', 'high'] : id.includes('3.1-flash-image') || id.includes('3.1-flash-lite-image') ? ['minimal', 'high'] : [],
  }
}

export function normalizeGeminiParams(params: TaskParams, model: string): TaskParams {
  const options = getGeminiImageOptions(model)
  return {
    ...params,
    size: 'default',
    aspect_ratio: options.ratios.includes(params.aspect_ratio ?? '') ? params.aspect_ratio : 'auto',
    image_size: options.resolutions.includes(params.image_size ?? '') ? params.image_size : 'auto',
    thinking_level: options.thinkingLevels.includes(params.thinking_level ?? '') ? params.thinking_level : 'default',
    quality: 'default',
    output_format: 'default',
    output_compression: null,
    moderation: 'default',
    background: 'default',
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
