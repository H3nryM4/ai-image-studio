import { getActiveApiProfile, getCustomProviderDefinition, isOpenAICompatibleProvider } from './apiProfiles'
import { callOpenAICompatibleImageApi } from './openaiCompatibleImageApi'
import type { CallApiOptions, CallApiResult } from './imageApiShared'

export type { CallApiOptions, CallApiResult } from './imageApiShared'
export { normalizeBaseUrl } from './devProxy'

export async function callImageApi(opts: CallApiOptions): Promise<CallApiResult> {
  const profile = getActiveApiProfile(opts.settings)
  if (!isOpenAICompatibleProvider(opts.settings, profile.provider)) throw new Error('接入方式已不可用，请重新选择')

  return callOpenAICompatibleImageApi(opts, profile, getCustomProviderDefinition(opts.settings, profile.provider))
}
