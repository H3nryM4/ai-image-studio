import type { InputImage } from '../types'
import { composeMarkupDataUrl, toApiInputImageDataUrl } from './canvasImage'
import { storeImage } from './db'
import { cacheImage, ensureImageCached } from './imageCache'

/** 首图可保留独立标注交给请求层适配，其余参考图在任务快照中合成标注。 */
export async function persistTaskInputImages(images: InputImage[], keepFirstMarkup: boolean): Promise<InputImage[]> {
  const result: InputImage[] = []
  for (const [idx, img] of images.entries()) {
    if (!img.markupImageId || (keepFirstMarkup && idx === 0)) {
      await storeImage(img.dataUrl)
      result.push(img)
      continue
    }
    const markup = await ensureImageCached(img.markupImageId)
    if (!markup) throw new Error(`图${idx + 1}的标注已不存在，请重新绘制`)
    const dataUrl = await composeMarkupDataUrl(img.dataUrl, markup)
    const id = await storeImage(dataUrl)
    cacheImage(id, dataUrl)
    result.push({ id, dataUrl })
  }
  return result
}

export async function toReferenceImage(id: string, dataUrl: string): Promise<InputImage> {
  const converted = await toApiInputImageDataUrl(dataUrl)
  if (converted === dataUrl) return { id, dataUrl }
  const convertedId = await storeImage(converted, 'upload')
  cacheImage(convertedId, converted)
  return { id: convertedId, dataUrl: converted }
}
