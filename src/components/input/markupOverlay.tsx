import { useEffect, useState } from 'react'
import { ensureImageCached, getCachedImage } from '../../lib/imageCache'

export default function MarkupOverlay({ imageId, fit = 'cover' }: { imageId: string; fit?: 'cover' | 'contain' }) {
  const [src, setSrc] = useState(() => getCachedImage(imageId))
  useEffect(() => {
    let cancelled = false
    setSrc(getCachedImage(imageId))
    ensureImageCached(imageId).then((url) => {
      if (!cancelled) setSrc(url)
    }).catch((err) => console.warn('标注预览加载失败', err))
    return () => { cancelled = true }
  }, [imageId])
  if (!src) return null
  return <img src={src} alt="" className={`pointer-events-none absolute inset-0 h-full w-full ${fit === 'contain' ? 'object-contain' : 'object-cover'}`} />
}
