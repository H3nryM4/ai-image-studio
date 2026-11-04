import { describe, expect, it } from 'vitest'
import { dataUrlToLosslessBlob, readBlobAsDataUrl } from './db'

describe('image blob conversion', () => {
  it('round-trips a canonical base64 data URL', async () => {
    const dataUrl = 'data:image/png;base64,aW1hZ2U='
    const blob = dataUrlToLosslessBlob(dataUrl)!
    expect(blob.type).toBe('image/png')
    expect(await readBlobAsDataUrl(blob)).toBe(dataUrl)
  })

  it('keeps data URLs that cannot be restored byte for byte as strings', () => {
    expect(dataUrlToLosslessBlob('data:image/PNG;base64,aW1hZ2U=')).toBeUndefined()
    expect(dataUrlToLosslessBlob('data:image/png;charset=utf-8;base64,aW1hZ2U=')).toBeUndefined()
    expect(dataUrlToLosslessBlob('data:image/svg+xml,<svg></svg>')).toBeUndefined()
    expect(dataUrlToLosslessBlob('data:image/png;base64,aW1h\nZ2U=')).toBeUndefined()
  })
})
