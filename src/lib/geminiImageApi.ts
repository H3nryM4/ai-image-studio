import type { ApiProfile, TaskParams } from '../types'
import { runWithConcurrency } from './batchPrompts'
import { readClientDevProxyConfig, shouldUseApiProxy } from './devProxy'
import { buildGeminiApiUrl, getGeminiImageOptions, normalizeGeminiParams } from './gemini'
import { getApiErrorMessage, type CallApiOptions, type CallApiResult } from './imageApiShared'

interface GeminiPart {
  thought?: boolean
  text?: string
  inlineData?: { data?: string; mimeType?: string }
  inline_data?: { data?: string; mime_type?: string }
}

interface GeminiResponse {
  error?: { message?: string }
  promptFeedback?: { blockReason?: string }
  candidates?: Array<{ finishReason?: string; content?: { parts?: GeminiPart[] } }>
}

export async function callGeminiImageApi(opts: CallApiOptions, profile: ApiProfile): Promise<CallApiResult> {
  if (opts.maskDataUrl) throw new Error('Gemini 暂不支持蒙版编辑，请移除蒙版后用文字描述修改区域')
  const params = normalizeGeminiParams(opts.params, profile.model)
  const options = getGeminiImageOptions(profile.model)
  if (opts.inputImageDataUrls.length > options.maxInputImages) throw new Error(`当前 Gemini 模型最多添加 ${options.maxInputImages} 张参考图`)
  const parts = [
    { text: opts.prompt },
    ...opts.inputImageDataUrls.map((url) => {
      const match = url.match(/^data:(image\/(?:png|jpeg|webp|heic|heif));base64,([\s\S]+)$/i)
      if (!match) throw new Error('Gemini 参考图必须是 PNG、JPEG、WebP、HEIC 或 HEIF 图片')
      return { inlineData: { mimeType: match[1].toLowerCase(), data: match[2] } }
    }),
  ]
  const imageConfig = {
    ...(params.aspect_ratio !== 'auto' ? { aspectRatio: params.aspect_ratio } : {}),
    ...(params.image_size !== 'auto' ? { imageSize: params.image_size } : {}),
  }
  const body = JSON.stringify({
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      ...(params.thinking_level && params.thinking_level !== 'default' ? { thinkingConfig: { thinkingLevel: params.thinking_level.toUpperCase() } } : {}),
      ...(Object.keys(imageConfig).length ? { imageConfig } : {}),
    },
  })
  // 首版使用内联图片，限制整个 JSON 请求，避免沿用 Images API 的大文件额度。
  if (new TextEncoder().encode(body).length > 20 * 1024 * 1024) throw new Error('Gemini 内联请求超过 20 MiB，请减少参考图或缩小图片')
  const proxy = readClientDevProxyConfig()
  const url = shouldUseApiProxy(profile.apiProxy, proxy)
    ? `${proxy?.prefix ?? '/api-proxy'}/models/${encodeURIComponent(profile.model.replace(/^models\//, ''))}:generateContent`
    : buildGeminiApiUrl(profile.baseUrl, profile.model)
  const count = Math.min(10, Math.max(1, Math.trunc(params.n) || 1))
  const results: Array<CallApiResult | undefined> = new Array(count)
  const failures: NonNullable<CallApiResult['failedRequests']> = []
  await runWithConcurrency(Array.from({ length: count }, (_, idx) => idx), 2, async (idx) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), profile.timeout * 1000)
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': profile.apiKey },
        body,
        signal: controller.signal,
        cache: 'no-store',
      })
      if (!response.ok) throw new Error(await getApiErrorMessage(response))
      const payload = await response.json() as GeminiResponse | null
      if (payload?.error) throw new Error(payload.error.message || 'Gemini 接口返回错误')
      if (payload?.promptFeedback?.blockReason) throw new Error(`Gemini 拒绝了此请求：${payload.promptFeedback.blockReason}`)
      const images: string[] = []
      const actualParamsList: Array<Partial<TaskParams>> = []
      const messages: string[] = []
      for (const candidate of Array.isArray(payload?.candidates) ? payload.candidates : []) {
        if (!candidate) continue
        if (candidate.finishReason && candidate.finishReason !== 'STOP') {
          messages.push(`生成结束原因：${candidate.finishReason}`)
          continue
        }
        for (const part of Array.isArray(candidate.content?.parts) ? candidate.content.parts : []) {
          if (!part || part.thought) continue
          if (typeof part.text === 'string') messages.push(part.text)
          const data = part.inlineData?.data ?? part.inline_data?.data
          const mime = part.inlineData?.mimeType ?? part.inline_data?.mime_type
          if (typeof data !== 'string' || !data.trim() || typeof mime !== 'string' || !/^image\/(png|jpeg|webp)$/i.test(mime)) continue
          images.push(`data:${mime.toLowerCase()};base64,${data}`)
          actualParamsList.push({ output_format: mime.toLowerCase().slice(6) as TaskParams['output_format'] })
        }
      }
      if (!images.length) throw new Error(`Gemini 未返回成品图片${messages.length ? `：${messages.join('\n').slice(0, 1500)}` : '，请检查模型是否支持生图及接口响应格式'}`)
      results[idx] = { images, actualParamsList }
    } catch (err) {
      const message = controller.signal.aborted ? `Gemini 请求超时（${profile.timeout} 秒）` : err instanceof Error ? err.message : String(err)
      console.warn('Gemini 生图请求失败', message)
      failures.push({ requestIndex: idx, error: message })
    } finally {
      clearTimeout(timer)
    }
  })
  const images = results.flatMap((result) => result?.images ?? [])
  if (!images.length) throw new Error(failures.map((item) => item.error).join('\n'))
  return {
    images,
    actualParams: results.find((result) => result)?.actualParamsList?.[0],
    actualParamsList: results.flatMap((result) => result?.actualParamsList ?? []),
    ...(failures.length ? { failedRequests: failures.sort((a, b) => a.requestIndex - b.requestIndex) } : {}),
  }
}
