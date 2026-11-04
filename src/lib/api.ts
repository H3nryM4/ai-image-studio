import { getActiveApiProfile, getCustomConnectionDefinition, isOpenAIConnection } from './apiProfiles'
import { callCustomHttpImageApi, callOpenAICompatibleImageApi } from './openaiCompatibleImageApi'
import type { CallApiOptions, CallApiResult } from './imageApiShared'

export type { CallApiOptions, CallApiResult } from './imageApiShared'
export { normalizeBaseUrl } from './devProxy'

export async function callImageApi(opts: CallApiOptions): Promise<CallApiResult> {
  const profile = getActiveApiProfile(opts.settings)
  if (isOpenAIConnection(profile.connectionId)) return callOpenAICompatibleImageApi(opts, profile)
  const connection = getCustomConnectionDefinition(opts.settings, profile.connectionId)
  if (!connection) throw new Error('接入方式已不可用，请重新选择')
  return callCustomHttpImageApi(opts, profile, connection)
}
