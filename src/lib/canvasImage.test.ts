// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { composeMarkupDataUrl, loadImage, toApiInputImageDataUrl } from './canvasImage'

vi.mock('./dataUrl', () => ({ blobToDataUrl: vi.fn(async (blob: Blob) => `data:${blob.type};base64,raster`) }))

const sources: string[] = []
const drawImage = vi.fn()

beforeEach(() => {
  sources.length = 0
  drawImage.mockClear()
  vi.stubGlobal('Image', class {
    naturalWidth = 800
    naturalHeight = 400
    onload?: () => void
    set src(value: string) {
      sources.push(value)
      queueMicrotask(() => this.onload?.())
    }
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) => callback(new Blob(['raster'], { type })))
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('canvas reference preparation', () => {
  it('adds intrinsic SVG dimensions from viewBox before decoding and converts it to PNG', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 800 400"><path d="M0 0h800v400H0z"/></svg>'
    const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(svg))
    expect(await toApiInputImageDataUrl(src)).toBe('data:image/png;base64,raster')
    const decoded = new DOMParser().parseFromString(decodeURIComponent(sources[0].split(',')[1]), 'image/svg+xml').documentElement
    expect(decoded.getAttribute('width')).toBe('800')
    expect(decoded.getAttribute('height')).toBe('400')
    expect(drawImage).toHaveBeenCalledOnce()
  })

  it('retains explicit SVG sizes and rasterizes GIF references while leaving PNG untouched', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" viewBox="0 0 800 400"/>'
    const src = `data:image/svg+xml;base64,${btoa(svg)}`
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(svg))
    await loadImage(src)
    expect(sources[0]).toBe(src)
    expect(await toApiInputImageDataUrl('data:image/gif;base64,gif')).toBe('data:image/png;base64,raster')
    expect(await toApiInputImageDataUrl('data:image/png;base64,png')).toBe('data:image/png;base64,png')
    expect(sources).toHaveLength(2)
  })

  it('composes markup at the original image dimensions', async () => {
    expect(await composeMarkupDataUrl('data:image/png;base64,original', 'data:image/png;base64,layer')).toBe('data:image/png;base64,raster')
    expect(drawImage.mock.calls).toHaveLength(2)
    expect(drawImage.mock.calls[1].slice(1)).toEqual([0, 0, 800, 400])
  })
})
