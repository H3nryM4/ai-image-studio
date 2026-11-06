import type { ApiConnectionId, ApiProfile } from '../types'
import { DEFAULT_STREAM_PARTIAL_IMAGES } from '../types'

import { normalizeBaseUrl } from './devProxy'
import { GEMINI_CONNECTION_ID, normalizeGeminiBaseUrl } from './gemini'

export function normalizeStreamPartialImages(value: unknown, fallback: number | undefined = DEFAULT_STREAM_PARTIAL_IMAGES): number {
  const fallbackValue = fallback ?? DEFAULT_STREAM_PARTIAL_IMAGES
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return fallbackValue
  return Math.min(3, Math.max(0, Math.trunc(numeric)))
}

export interface DefaultApiUrlPatch {
  baseUrl: string
  apiKey?: string
  connectionId?: ApiConnectionId
  model?: string
  name?: string
  codexCli?: boolean
  streamImages?: boolean
  streamPartialImages?: number
  transparentBackgroundMethod?: ApiProfile['transparentBackgroundMethod']
}

export function parseDefaultApiUrl(rawUrl: string): DefaultApiUrlPatch {
  const url = rawUrl.trim()
  if (!url) return { baseUrl: '' }

  try {
    const parsed = new URL(url)
    const queryIndex = url.search(/[?#]/)
    const baseUrl = queryIndex >= 0 ? url.slice(0, queryIndex) : url
    const patch: DefaultApiUrlPatch = {
      baseUrl: normalizeBaseUrl(baseUrl),
    }

    const apiUrlParam = parsed.searchParams.get('apiUrl')
    const apiKeyParam = parsed.searchParams.get('apiKey')
    const connectionIdParam = parsed.searchParams.get('connectionId')
    const modelParam = parsed.searchParams.get('model')
    const profileNameParam = parsed.searchParams.get('profileName')
    const codexCliParam = parsed.searchParams.get('codexCli')
    const streamImagesParam = parsed.searchParams.get('streamImages')
    const streamPartialImagesParam = parsed.searchParams.get('streamPartialImages')
    const transparentBackgroundMethodParam = parsed.searchParams.get('transparentBackgroundMethod')

    if (apiUrlParam !== null) patch.baseUrl = normalizeBaseUrl(apiUrlParam.trim())
    if (apiKeyParam !== null) patch.apiKey = apiKeyParam.trim()
    if (connectionIdParam === 'openai-images' || connectionIdParam === GEMINI_CONNECTION_ID) patch.connectionId = connectionIdParam
    if (modelParam !== null && modelParam.trim()) patch.model = modelParam.trim()
    if (profileNameParam?.trim()) patch.name = profileNameParam.trim()
    if (codexCliParam !== null) patch.codexCli = codexCliParam.trim().toLowerCase() === 'true'
    if (streamImagesParam !== null) patch.streamImages = streamImagesParam.trim().toLowerCase() === 'true'
    if (streamPartialImagesParam !== null) patch.streamPartialImages = normalizeStreamPartialImages(streamPartialImagesParam)
    if (transparentBackgroundMethodParam === 'api' || transparentBackgroundMethodParam === 'local') {
      patch.transparentBackgroundMethod = transparentBackgroundMethodParam
    }

    if (patch.connectionId === GEMINI_CONNECTION_ID) patch.baseUrl = normalizeGeminiBaseUrl(apiUrlParam ?? baseUrl)
    return patch
  } catch {
    return { baseUrl: normalizeBaseUrl(url) }
  }
}
