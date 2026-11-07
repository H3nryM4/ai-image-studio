import type { ApiProfile, ImageApiResponse } from '../types'
import { buildApiUrl, readClientDevProxyConfig, shouldUseApiProxy } from './devProxy'
import { DEFAULT_GROK_BASE_URL, getGrokImageOptions, normalizeGrokParams } from './grok'
import { assertImageInputPayloadSize, getApiErrorMessage, type CallApiOptions, type CallApiResult } from './imageApiShared'
import { parseImagesApiResponse } from './openaiCompatibleImageApi'

export async function callGrokImageApi(opts: CallApiOptions, profile: ApiProfile): Promise<CallApiResult> {
  if (opts.maskDataUrl) throw new Error('Grok 暂不支持蒙版编辑，请移除蒙版后用文字描述修改区域')
  const options = getGrokImageOptions(profile.model)
  if (opts.inputImageDataUrls.length > options.maxInputImages) throw new Error(`Grok 最多添加 ${options.maxInputImages} 张参考图`)
  if (opts.inputImageDataUrls.some((url) => !/^data:image\/[\w.+-]+;base64,[\s\S]+$/i.test(url))) throw new Error('Grok 参考图必须是有效的 Base64 图片')
  assertImageInputPayloadSize(opts.inputImageDataUrls.reduce((sum, url) => sum + url.length, 0))
  const params = normalizeGrokParams(opts.params, profile.model)
  const images = opts.inputImageDataUrls.map((url) => ({ type: 'image_url', url }))
  const body = {
    model: profile.model,
    prompt: opts.prompt,
    ...(params.n > 1 ? { n: params.n } : {}),
    ...(params.aspect_ratio !== 'auto' ? { aspect_ratio: params.aspect_ratio } : {}),
    ...(params.image_size !== 'auto' ? { resolution: params.image_size?.toLowerCase() } : {}),
    ...(params.quality !== 'default' ? { quality: params.quality } : {}),
    ...(images.length === 1 ? { image: images[0] } : images.length > 1 ? { images } : {}),
    ...(profile.responseFormatB64Json ? { response_format: 'b64_json' } : {}),
  }
  const proxy = readClientDevProxyConfig()
  const url = buildApiUrl(profile.baseUrl.trim() || DEFAULT_GROK_BASE_URL, images.length ? 'images/edits' : 'images/generations', proxy, shouldUseApiProxy(profile.apiProxy, proxy))
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), profile.timeout * 1000)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${profile.apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!response.ok) {
      const rawResponsePayload = await response.clone().text()
      throw Object.assign(new Error(await getApiErrorMessage(response)), { rawResponsePayload })
    }
    const payload = await response.json() as ImageApiResponse & { error?: { message?: string } } | null
    if (payload?.error) throw Object.assign(new Error(payload.error.message || 'Grok 接口返回错误'), { rawResponsePayload: JSON.stringify(payload, null, 2) })
    return await parseImagesApiResponse(payload ?? { data: [] }, 'image/jpeg', controller.signal)
  } catch (err) {
    console.warn('Grok 生图请求失败', err)
    if (controller.signal.aborted) throw new Error(`Grok 请求超时（${profile.timeout} 秒）`)
    throw err
  } finally {
    clearTimeout(timer)
  }
}
