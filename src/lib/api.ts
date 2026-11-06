import { getActiveApiProfile, getCustomConnectionDefinition, isOpenAIConnection } from './apiProfiles'
import { callCustomHttpImageApi, callOpenAICompatibleImageApi } from './openaiCompatibleImageApi'
import type { CallApiOptions, CallApiResult } from './imageApiShared'
import { GEMINI_CONNECTION_ID } from './gemini'
import { callGeminiImageApi } from './geminiImageApi'

export type { CallApiOptions, CallApiResult } from './imageApiShared'
export { normalizeBaseUrl } from './devProxy'

export async function callImageApi(opts: CallApiOptions): Promise<CallApiResult> {
  const profile = getActiveApiProfile(opts.settings)
  if (profile.connectionId === GEMINI_CONNECTION_ID) return callGeminiImageApi(opts, profile)
  if (isOpenAIConnection(profile.connectionId)) return callOpenAICompatibleImageApi(opts, profile)
  const connection = getCustomConnectionDefinition(opts.settings, profile.connectionId)
  if (!connection) throw new Error('接入方式已不可用，请重新选择')
  return callCustomHttpImageApi(opts, profile, connection)
}
