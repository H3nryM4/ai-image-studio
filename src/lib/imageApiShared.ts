import { OUTPUT_FORMATS, type AppSettings, type TaskParams } from '../types'
import { blobToDataUrl } from './dataUrl'

export const MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  gif: 'image/gif',
}

export const MAX_MASK_EDIT_FILE_BYTES = 50 * 1024 * 1024
export const MAX_IMAGE_INPUT_PAYLOAD_BYTES = 512 * 1024 * 1024
export const PROMPT_REWRITE_GUARD_PREFIX = 'Treat everything after this line as one complete image-generation prompt, including the resolution instruction. Follow it exactly without rewriting or omitting anything:'

export interface CallApiOptions {
  settings: AppSettings
  prompt: string
  params: TaskParams
  /** 输入图片的 data URL 列表 */
  inputImageDataUrls: string[]
  /** 与 inputImageDataUrls 按索引对齐的原链接，不是通过链接添加的为 null */
  inputImageUrls?: (string | null)[]
  maskDataUrl?: string
  markupDataUrl?: string
  onCustomTaskEnqueued?: (task: { taskId: string }) => void
  onPartialImage?: (partial: { image: string; partialImageIndex?: number; requestIndex?: number }) => void
}

export interface CallApiResult {
  /** base64 data URL 列表 */
  images: string[]
  /** API 返回的实际生效参数 */
  actualParams?: Partial<TaskParams>
  /** 每张图片对应的实际生效参数 */
  actualParamsList?: Array<Partial<TaskParams> | undefined>
  /** 每张图片对应的 API 改写提示词 */
  revisedPrompts?: Array<string | undefined>
  /** API 返回的原始图片 HTTP URL（非 base64 时记录） */
  rawImageUrls?: string[]
  /** 并发多图请求中失败的单张请求 */
  failedRequests?: Array<{ requestIndex: number; error: string; rawResponsePayload?: string }>
}

export function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value)
}

export function isDataUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:')
}

export function normalizeBase64Image(value: string, fallbackMime: string): string {
  if (value.startsWith('data:')) return value
  const mime = value.startsWith('/9j/') ? 'image/jpeg' : value.startsWith('iVBORw0KGgo') ? 'image/png' : value.startsWith('UklGR') ? 'image/webp' : fallbackMime
  return `data:${mime};base64,${value}`
}

function formatMiB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`
}

export function getDataUrlEncodedByteSize(dataUrl: string): number {
  return dataUrl.length
}

export function getDataUrlDecodedByteSize(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(',')
  if (commaIndex < 0) return dataUrl.length

  const meta = dataUrl.slice(0, commaIndex)
  const payload = dataUrl.slice(commaIndex + 1)
  if (!/;base64/i.test(meta)) return decodeURIComponent(payload).length

  const normalized = payload.replace(/\s/g, '')
  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding)
}

function assertMaxBytes(label: string, bytes: number, maxBytes: number) {
  if (bytes > maxBytes) {
    throw new Error(`${label}过大：${formatMiB(bytes)}，上限为 ${formatMiB(maxBytes)}`)
  }
}

export function assertImageInputPayloadSize(bytes: number) {
  assertMaxBytes('图像输入有效负载总大小', bytes, MAX_IMAGE_INPUT_PAYLOAD_BYTES)
}

export function assertMaskEditFileSize(label: string, bytes: number) {
  assertMaxBytes(label, bytes, MAX_MASK_EDIT_FILE_BYTES)
}

export const IMAGE_FETCH_CORS_HINT = ' 可点链接按钮复制结果链接，或尝试开启「返回 Base64 图片数据」避免此问题。'
export const STREAMING_UNSUPPORTED_HINT = '提示：当前使用的 API 可能不支持流式传输，请尝试关闭「流式传输」功能。'
export const STREAMING_FORMAT_HINT = '提示：API 返回了无法解析的流式数据格式，请尝试关闭「流式传输」功能。'
export const TRANSPARENT_BACKGROUND_UNSUPPORTED_HINT = '提示：当前使用的 API 不支持为该模型使用原生透明背景，请将「透明背景实现方式」切换为「本地后处理」。'

export function appendStreamingUnsupportedHint(message: string): string {
  return message ? `${message}\n${STREAMING_UNSUPPORTED_HINT}` : STREAMING_UNSUPPORTED_HINT
}

export function appendStreamingFormatHint(message: string): string {
  return message ? `${message}\n${STREAMING_FORMAT_HINT}` : STREAMING_FORMAT_HINT
}

export function maybeAppendTransparentBackgroundHint(message: string): string {
  if (!/transparent background is not supported for this model\.?/i.test(message)) return message
  return `${message}\n${TRANSPARENT_BACKGROUND_UNSUPPORTED_HINT}`
}

/** 排除明确与流式无关的状态码后追加提示 */
export function maybeAppendStreamingHint(message: string, status: number, streamImages?: boolean): string {
  const transparentMessage = maybeAppendTransparentBackgroundHint(message)
  if (transparentMessage !== message) return transparentMessage
  if (!streamImages) return message
  if (status === 401 || status === 403 || status === 404 || status === 408 || status === 429 || status >= 500) {
    return message
  }
  return appendStreamingUnsupportedHint(message)
}

async function probeNoCorsReachability(url: string, timeoutMs = 8000): Promise<'opaque' | 'reachable' | 'failed'> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    })
    return response.type === 'opaque' ? 'opaque' : 'reachable'
  } catch {
    return 'failed'
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function fetchImageUrlAsDataUrl(url: string, fallbackMime: string, signal?: AbortSignal): Promise<string> {
  if (isDataUrl(url)) return url

  let response: Response
  try {
    response = await fetch(url, {
      cache: 'no-store',
      signal,
    })
  } catch (err) {
    if (err instanceof TypeError) {
      const probe = await probeNoCorsReachability(url)
      if (probe === 'opaque') {
        throw new Error(`图片已生成，但因服务商未允许跨域，图片链接下载失败。${IMAGE_FETCH_CORS_HINT}`)
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new Error(`图片链接下载失败（网络不可用）。${IMAGE_FETCH_CORS_HINT}`)
      }
      throw new Error(`图片链接下载失败（可能因跨域限制、链接过期或网络异常）。${IMAGE_FETCH_CORS_HINT}`)
    }
    throw err
  }

  if (!response.ok) {
    throw new Error(`图片 URL 下载失败：HTTP ${response.status}`)
  }

  const blob = await response.blob()
  return blobToDataUrl(blob, fallbackMime)
}

export function appendModerationDetails(message: string, details: unknown): string {
  if (!details || typeof details !== 'object') return message
  const record = details as Record<string, unknown>
  const stage = record.moderation_stage === 'input' ? '提示词或参考图' : record.moderation_stage === 'output' ? '生成结果' : ''
  const categories = Array.isArray(record.categories) ? record.categories.filter((item): item is string => typeof item === 'string' && Boolean(item)) : []
  const parts = [stage ? `拦截来源：${stage}` : '', categories.length ? `类别：${categories.join('、')}` : ''].filter(Boolean)
  return parts.length ? `${message}\n${parts.join('；')}` : message
}

export async function getApiErrorMessage(response: Response): Promise<string> {
  let errorMsg = `HTTP ${response.status}`
  const textResponse = response.clone()
  try {
    const errJson = await response.json()
    if (errJson.error?.message) errorMsg = appendModerationDetails(errJson.error.message, errJson.error.moderation_details)
    else if (typeof errJson.detail === 'string') errorMsg = errJson.detail
    else if (Array.isArray(errJson.detail)) errorMsg = errJson.detail.map((item: unknown) => typeof item === 'string' ? item : JSON.stringify(item)).join('\n')
    else if (typeof errJson.error === 'string') errorMsg = errJson.error
    else if (errJson.message) errorMsg = errJson.message
  } catch {
    try {
      errorMsg = await textResponse.text()
    } catch {
      /* ignore */
    }
  }
  return errorMsg
}

export function pickActualParams(source: unknown): Partial<TaskParams> {
  if (!source || typeof source !== 'object') return {}
  const record = source as Record<string, unknown>
  const actualParams: Partial<TaskParams> = {}

  if (typeof record.size === 'string') actualParams.size = record.size
  if (record.quality === 'auto' || record.quality === 'low' || record.quality === 'medium' || record.quality === 'high' || record.quality === 'xhigh' || record.quality === 'max') {
    actualParams.quality = record.quality
  }
  if (OUTPUT_FORMATS.includes(record.output_format as typeof OUTPUT_FORMATS[number])) {
    actualParams.output_format = record.output_format as TaskParams['output_format']
  }
  if (typeof record.output_compression === 'number') actualParams.output_compression = record.output_compression
  if (record.moderation === 'auto' || record.moderation === 'low') actualParams.moderation = record.moderation
  if (record.background === 'opaque' || record.background === 'transparent') actualParams.background = record.background
  if (typeof record.n === 'number') actualParams.n = record.n
  if (record.complexity === 'low' || record.complexity === 'medium' || record.complexity === 'high') actualParams.complexity = record.complexity
  if (typeof record.frame_count === 'number') actualParams.frame_count = record.frame_count
  if (typeof record.frame_duration_ms === 'number') actualParams.frame_duration_ms = record.frame_duration_ms

  return actualParams
}

export function mergeActualParams(...sources: Array<Partial<TaskParams> | undefined>): Partial<TaskParams> | undefined {
  const merged = Object.assign({}, ...sources.filter((source) => source && Object.keys(source).length))
  return Object.keys(merged).length ? merged : undefined
}
