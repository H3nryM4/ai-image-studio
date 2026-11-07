import { getActiveApiProfile, getCustomConnectionDefinition, isOpenAIConnection } from './apiProfiles'
import { callCustomHttpImageApi, callOpenAICompatibleImageApi } from './openaiCompatibleImageApi'
import type { CallApiOptions, CallApiResult } from './imageApiShared'
import { GEMINI_CONNECTION_ID } from './gemini'
import { callGeminiImageApi } from './geminiImageApi'
import { GROK_CONNECTION_ID } from './grok'
import { callGrokImageApi } from './grokImageApi'
import { composeMarkupDataUrl, toApiInputImageDataUrl } from './canvasImage'
import { supportsImageMarkup } from './imageModels'

export type { CallApiOptions, CallApiResult } from './imageApiShared'
export { normalizeBaseUrl } from './devProxy'

export async function callImageApi(opts: CallApiOptions): Promise<CallApiResult> {
  const profile = getActiveApiProfile(opts.settings)
  const inputImageDataUrls = await Promise.all(opts.inputImageDataUrls.map(toApiInputImageDataUrl))
  const inputImageUrls = opts.inputImageUrls ? [...opts.inputImageUrls] : undefined
  if (inputImageUrls) inputImageDataUrls.forEach((url, idx) => { if (url !== opts.inputImageDataUrls[idx]) inputImageUrls[idx] = null })
  let markupDataUrl = opts.markupDataUrl
  if (markupDataUrl && inputImageDataUrls.length && (opts.maskDataUrl || !supportsImageMarkup(profile))) {
    inputImageDataUrls[0] = await composeMarkupDataUrl(inputImageDataUrls[0], markupDataUrl)
    if (inputImageUrls) inputImageUrls[0] = null
    markupDataUrl = undefined
  }
  opts = { ...opts, inputImageDataUrls, inputImageUrls, markupDataUrl }
  if (profile.connectionId === GEMINI_CONNECTION_ID) return callGeminiImageApi(opts, profile)
  if (profile.connectionId === GROK_CONNECTION_ID) return callGrokImageApi(opts, profile)
  if (isOpenAIConnection(profile.connectionId)) return callOpenAICompatibleImageApi(opts, profile)
  const connection = getCustomConnectionDefinition(opts.settings, profile.connectionId)
  if (!connection) throw new Error('接入方式已不可用，请重新选择')
  return callCustomHttpImageApi(opts, profile, connection)
}
