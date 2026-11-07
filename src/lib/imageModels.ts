import type { ApiProfile } from '../types'

export const DEFAULT_IMAGES_MODEL = 'gpt-image-2.5-sunburst'

function isGptImageAtLeast(model: string, minor: number) {
  const version = model.toLowerCase().match(/gpt-image-(\d+)(?:\.(\d+))?/)
  return Boolean(version && (Number(version[1]) > 2 || (Number(version[1]) === 2 && Number(version[2] ?? 0) >= minor)))
}

export function isGptImage25Model(model: string) {
  return isGptImageAtLeast(model, 5)
}

export function supportsGptImage26Params(model: string) {
  return isGptImageAtLeast(model, 6)
}

export function supportsImageMarkup(profile: ApiProfile) {
  return profile.connectionId === 'openai-images' && !profile.codexCli && isGptImage25Model(profile.model)
}

export function isVectorOrAnimatedFormat(format: string | undefined) {
  return format === 'svg' || format === 'gif'
}

export function getImageOutputFormats(model: string, hasInputImages = false) {
  return ['png', 'jpeg', 'webp', ...(supportsGptImage26Params(model) ? ['gif', ...(!hasInputImages ? ['svg'] : [])] : [])]
}
