import { describe, expect, it } from 'vitest'
import { blobToDataUrl, bytesToDataUrl, dataUrlToBytes } from './dataUrl'

describe('dataUrl helpers', () => {
  it('converts image data URLs to bytes with extension', () => {
    const result = dataUrlToBytes('data:image/png;base64,AQID')

    expect(result.ext).toBe('png')
    expect(Array.from(result.bytes)).toEqual([1, 2, 3])
  })

  it('converts bytes to image data URLs from file extension', () => {
    expect(bytesToDataUrl(new Uint8Array([1, 2, 3]), 'images/output.webp')).toBe('data:image/webp;base64,AQID')
  })

  it.each([
    ['svg', 'image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg"><text>猫</text></svg>'],
    ['gif', 'image/gif', 'GIF89a'],
  ])('preserves %s bytes and MIME across backup conversion', (ext, mime, source) => {
    const bytes = new TextEncoder().encode(source)
    const dataUrl = bytesToDataUrl(bytes, `images/output.${ext}`)
    expect(dataUrl).toMatch(new RegExp(`^data:${mime.replace('+', '\\+')};base64,`))
    const restored = dataUrlToBytes(dataUrl)
    expect(restored.ext).toBe(ext)
    expect(restored.bytes).toEqual(bytes)
  })

  it('accepts URL-encoded SVG and MIME parameters without changing the UTF-8 bytes', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>猫</text></svg>'
    const bytes = new TextEncoder().encode(svg)
    expect(dataUrlToBytes(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)).toEqual({ ext: 'svg', bytes })
    expect(dataUrlToBytes(bytesToDataUrl(bytes, 'image.svg').replace(';base64', ';charset=utf-8;base64'))).toEqual({ ext: 'svg', bytes })
  })

  it('converts blobs to data URLs with fallback MIME', async () => {
    await expect(blobToDataUrl(new Blob([new Uint8Array([1, 2, 3])]), 'image/png')).resolves.toBe('data:image/png;base64,AQID')
  })
})
