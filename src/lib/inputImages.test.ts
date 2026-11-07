import { afterEach, describe, expect, it, vi } from 'vitest'
import { persistTaskInputImages, toReferenceImage } from './inputImages'
import { composeMarkupDataUrl, toApiInputImageDataUrl } from './canvasImage'
import { storeImage } from './db'

vi.mock('./canvasImage', () => ({ composeMarkupDataUrl: vi.fn(async () => 'data:image/png;base64,combined'), toApiInputImageDataUrl: vi.fn(async (src: string) => src) }))
vi.mock('./db', () => ({ storeImage: vi.fn(async (src: string) => src.includes('combined') ? 'combined-id' : 'original-id') }))
vi.mock('./imageCache', () => ({ cacheImage: vi.fn(), ensureImageCached: vi.fn(async (id: string) => id === 'missing' ? undefined : 'data:image/png;base64,markup') }))

afterEach(() => vi.clearAllMocks())

describe('reference image snapshots', () => {
  it('keeps the first annotation separate and composites later annotations without changing the draft', async () => {
    const images = [
      { id: 'a', dataUrl: 'data:image/png;base64,original-a', markupImageId: 'markup-a' },
      { id: 'b', dataUrl: 'data:image/png;base64,original-b', markupImageId: 'markup-b' },
    ]
    const result = await persistTaskInputImages(images, true)
    expect(result).toEqual([images[0], { id: 'combined-id', dataUrl: 'data:image/png;base64,combined' }])
    expect(composeMarkupDataUrl).toHaveBeenCalledExactlyOnceWith(images[1].dataUrl, 'data:image/png;base64,markup')
    expect(images[1]).toMatchObject({ id: 'b', markupImageId: 'markup-b' })
  })

  it('rejects missing layers instead of silently omitting annotations', async () => {
    await expect(persistTaskInputImages([{ id: 'a', dataUrl: 'original', markupImageId: 'missing' }], false)).rejects.toThrow('标注已不存在')
  })

  it('stores a raster reference under its own id when a generated SVG or GIF is reused', async () => {
    vi.mocked(toApiInputImageDataUrl).mockResolvedValueOnce('data:image/png;base64,raster')
    const result = await toReferenceImage('svg-id', 'data:image/svg+xml;base64,svg')
    expect(result).toEqual({ id: 'original-id', dataUrl: 'data:image/png;base64,raster' })
    expect(storeImage).toHaveBeenCalledWith('data:image/png;base64,raster', 'upload')
  })
})
