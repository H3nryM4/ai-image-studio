const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

export function dataUrlToBytes(dataUrl: string): { ext: string; bytes: Uint8Array } {
  const match = dataUrl.match(/^data:image\/([\w.+-]+)((?:;[^,]*)?),([\s\S]*)$/i)
  if (!match) throw new Error('图片 data URL 格式无效')
  const mime = match[1].toLowerCase()
  const ext = mime === 'svg+xml' ? 'svg' : mime
  if (!/;base64(?:;|$)/i.test(match[2])) return { ext, bytes: new TextEncoder().encode(decodeURIComponent(match[3])) }
  const binary = atob(match[3])
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return { ext, bytes }
}

export function bytesToDataUrl(bytes: Uint8Array, filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? 'png'
  const mime = IMAGE_MIME_BY_EXTENSION[ext] ?? 'image/png'
  return `data:${mime};base64,${bytesToBase64(bytes)}`
}

export async function blobToDataUrl(blob: Blob, fallbackMime = 'application/octet-stream'): Promise<string> {
  return `data:${blob.type || fallbackMime};base64,${bytesToBase64(new Uint8Array(await blob.arrayBuffer()))}`
}

export function fileToDataUrl(file: File): Promise<string> {
  return blobToDataUrl(file, file.type || 'application/octet-stream')
}
