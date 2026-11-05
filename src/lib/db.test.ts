import { describe, expect, it } from 'vitest'
import { dataUrlToBlob } from './db'
import { blobToDataUrl } from './dataUrl'

describe('image blob conversion', () => {
  it('round-trips a base64 data URL', async () => {
    const dataUrl = 'data:image/png;base64,aW1hZ2U='
    const blob = dataUrlToBlob(dataUrl)
    expect(blob.type).toBe('image/png')
    expect(await blobToDataUrl(blob)).toBe(dataUrl)
  })

  it('rejects non-base64 data URLs', () => {
    expect(() => dataUrlToBlob('data:image/svg+xml,<svg></svg>')).toThrow()
    expect(() => dataUrlToBlob('https://example.com/a.png')).toThrow()
  })
})
