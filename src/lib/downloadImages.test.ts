import { unzipSync } from 'fflate'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bytesToDataUrl } from './dataUrl'
import { downloadImageEntriesAsZip, downloadImageIds } from './downloadImages'

vi.mock('./imageCache', () => ({ ensureImageCached: vi.fn() }))

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('vector and animated image downloads', () => {
  it('downloads an SVG with its original bytes and svg extension', async () => {
    const a = { href: '', download: '', click: vi.fn() }
    const downloads: Blob[] = []
    vi.stubGlobal('document', { createElement: () => a, body: { appendChild: vi.fn(), removeChild: vi.fn() } })
    vi.stubGlobal('window', { setTimeout: vi.fn() })
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => { downloads.push(blob as Blob); return 'blob:download' })
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>猫</text></svg>'
    const result = await downloadImageIds([`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`], 'drawing')
    expect(result).toEqual({ successCount: 1, failCount: 0 })
    expect(a.download).toBe('drawing.svg')
    expect(await downloads[0].text()).toBe(svg)
  })

  it('keeps SVG and GIF files unchanged inside a downloaded ZIP', async () => {
    const a = { href: '', download: '', click: vi.fn() }
    const downloads: Blob[] = []
    vi.stubGlobal('document', { createElement: () => a, body: { appendChild: vi.fn(), removeChild: vi.fn() } })
    vi.stubGlobal('window', { setTimeout: vi.fn() })
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => { downloads.push(blob as Blob); return 'blob:download' })
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')
    const gif = new TextEncoder().encode('GIF89a')
    const result = await downloadImageEntriesAsZip([
      { imageId: bytesToDataUrl(svg, 'image.svg'), fileNameBase: 'drawing' },
      { imageId: bytesToDataUrl(gif, 'image.gif'), fileNameBase: 'animation' },
    ], 'outputs')
    expect(result).toEqual({ successCount: 2, failCount: 0 })
    expect(a.download).toBe('outputs.zip')
    const files = unzipSync(new Uint8Array(await downloads[0].arrayBuffer()))
    expect(files['drawing.svg']).toEqual(svg)
    expect(files['animation.gif']).toEqual(gif)
  })
})
