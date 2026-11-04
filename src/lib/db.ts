import type { TaskRecord, StoredImage, StoredImageThumbnail } from '../types'
import { blobToDataUrl } from './dataUrl'

const DB_NAME = 'ai-image-studio'
const DB_VERSION = 6
const STORE_TASKS = 'tasks'
const STORE_IMAGES = 'images'
const STORE_THUMBNAILS = 'thumbnails'
const THUMBNAIL_MAX_SIZE = 720
const THUMBNAIL_QUALITY = 0.9
const THUMBNAIL_VERSION = 2
const BLOB_MIGRATED_KEY = 'ai-image-studio:image-blob-migrated'
const BLOB_DISABLED_KEY = 'ai-image-studio:image-blob-disabled'

export const CURRENT_THUMBNAIL_VERSION = THUMBNAIL_VERSION

/** 原图与缩略图在 IndexedDB 中的记录：新格式把 dataUrl 解码成 Blob，旧格式仍是字符串 */
type StoredImageRecord = Omit<StoredImage, 'dataUrl'> & { dataUrl?: string; blob?: Blob }
type StoredThumbnailRecord = Omit<StoredImageThumbnail, 'thumbnailDataUrl'> & { thumbnailDataUrl?: string; blob?: Blob }

let blobStorageEnabled = true
try {
  blobStorageEnabled = !localStorage.getItem(BLOB_DISABLED_KEY)
} catch {
  // localStorage 不可用时按支持 Blob 处理
}

/** 只转换规范 base64、且 mime 经 Blob 规范化后不变的 dataUrl，保证读回时得到完全相同的字符串 */
export function dataUrlToLosslessBlob(dataUrl: string): Blob | undefined {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl)
  if (!match) return undefined
  const mime = match[1]
  if (mime !== mime.toLowerCase()) return undefined
  try {
    const binary = atob(match[2])
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const blob = new Blob([bytes], { type: mime })
    return blob.type === mime ? blob : undefined
  } catch {
    return undefined
  }
}

export async function readBlobAsDataUrl(blob: Blob) {
  if (typeof FileReader === 'undefined') return blobToDataUrl(blob)
  const result = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
  return result.startsWith(`data:${blob.type};base64,`) ? result : blobToDataUrl(blob)
}

function toImageRecord(image: StoredImage): StoredImageRecord {
  const blob = blobStorageEnabled ? dataUrlToLosslessBlob(image.dataUrl) : undefined
  if (!blob) return image
  const { dataUrl, ...rest } = image
  return { ...rest, blob }
}

function toThumbnailRecord(thumbnail: StoredImageThumbnail): StoredThumbnailRecord {
  const blob = blobStorageEnabled ? dataUrlToLosslessBlob(thumbnail.thumbnailDataUrl) : undefined
  if (!blob) return thumbnail
  const { thumbnailDataUrl, ...rest } = thumbnail
  return { ...rest, blob }
}

async function fromImageRecord(rec: StoredImageRecord | undefined): Promise<StoredImage | undefined> {
  if (!rec?.blob) return rec as StoredImage | undefined
  const { blob, ...rest } = rec
  try {
    return { ...rest, dataUrl: await readBlobAsDataUrl(blob) }
  } catch (err) {
    console.warn('读取图片失败', rec.id, err)
    return undefined
  }
}

async function fromThumbnailRecord(rec: StoredThumbnailRecord | undefined): Promise<StoredImageThumbnail | undefined> {
  if (!rec?.blob) return rec as StoredImageThumbnail | undefined
  const { blob, ...rest } = rec
  try {
    return { ...rest, thumbnailDataUrl: await readBlobAsDataUrl(blob) }
  } catch (err) {
    console.warn('读取缩略图失败', rec.id, err)
    return undefined
  }
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      // 版本 5 起存储结构稳定；更早的旧结构直接重置，不迁移已移除的功能。
      if (e.oldVersion > 0 && e.oldVersion < 5) {
        for (const name of Array.from(db.objectStoreNames)) db.deleteObjectStore(name)
      }
      if (!db.objectStoreNames.contains(STORE_TASKS)) {
        db.createObjectStore(STORE_TASKS, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_IMAGES)) {
        db.createObjectStore(STORE_IMAGES, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_THUMBNAILS)) {
        db.createObjectStore(STORE_THUMBNAILS, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function dbTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode)
        const store = tx.objectStore(storeName)
        const req = fn(store)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

// ===== Tasks =====

export function getAllTasks(): Promise<TaskRecord[]> {
  return dbTransaction(STORE_TASKS, 'readonly', (s) => s.getAll())
}

export function putTask(task: TaskRecord): Promise<IDBValidKey> {
  return dbTransaction(STORE_TASKS, 'readwrite', (s) => s.put(task))
}

export function deleteTask(id: string): Promise<undefined> {
  return dbTransaction(STORE_TASKS, 'readwrite', (s) => s.delete(id))
}

export function commitTaskDeletion(deletedTaskIds: string[]): Promise<undefined> {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TASKS, 'readwrite')
    const store = tx.objectStore(STORE_TASKS)
    for (const id of deletedTaskIds) store.delete(id)
    tx.oncomplete = () => resolve(undefined)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  }))
}

export function clearTasks(): Promise<undefined> {
  return dbTransaction(STORE_TASKS, 'readwrite', (s) => s.clear())
}

// ===== Images =====

export function getImage(id: string): Promise<StoredImage | undefined> {
  return dbTransaction<StoredImageRecord | undefined>(STORE_IMAGES, 'readonly', (s) => s.get(id)).then(fromImageRecord)
}

export function getStoredImageThumbnail(id: string): Promise<StoredImageThumbnail | undefined> {
  return dbTransaction<StoredThumbnailRecord | undefined>(STORE_THUMBNAILS, 'readonly', (s) => s.get(id)).then(fromThumbnailRecord)
}

export async function getStoredFreshImageThumbnail(id: string): Promise<StoredImageThumbnail | undefined> {
  const thumbnail = await getStoredImageThumbnail(id)
  return thumbnail?.thumbnailVersion === THUMBNAIL_VERSION ? thumbnail : undefined
}

export function putImageThumbnail(thumbnail: StoredImageThumbnail): Promise<IDBValidKey> {
  return dbTransaction(STORE_THUMBNAILS, 'readwrite', (s) => s.put(toThumbnailRecord(thumbnail)))
}

export async function getImageThumbnail(id: string): Promise<StoredImageThumbnail | undefined> {
  const existingThumbnail = await getStoredImageThumbnail(id)
  if (existingThumbnail?.thumbnailVersion === THUMBNAIL_VERSION) {
    const image = await getImage(id)
    if (image && (!image.width || !image.height) && existingThumbnail.width && existingThumbnail.height) {
      await putImage({ ...image, width: existingThumbnail.width, height: existingThumbnail.height })
    }
    return existingThumbnail
  }

  const image = await getImage(id)
  if (!image) return undefined
  const legacyImage = image as StoredImage & Partial<StoredImageThumbnail>
  if (legacyImage.thumbnailDataUrl && legacyImage.thumbnailVersion === THUMBNAIL_VERSION) {
    const thumbnail: StoredImageThumbnail = {
      id,
      thumbnailDataUrl: legacyImage.thumbnailDataUrl,
      width: legacyImage.width,
      height: legacyImage.height,
      thumbnailVersion: THUMBNAIL_VERSION,
    }
    await putImageThumbnail(thumbnail)
    if ((!image.width || !image.height) && thumbnail.width && thumbnail.height) {
      await putImage({ ...image, width: thumbnail.width, height: thumbnail.height })
    }
    return thumbnail
  }

  const metadata = await safeCreateImageThumbnail(image.dataUrl)
  if (!metadata.thumbnailDataUrl) return undefined
  const thumbnail: StoredImageThumbnail = {
    id,
    thumbnailDataUrl: metadata.thumbnailDataUrl,
    width: metadata.width,
    height: metadata.height,
    thumbnailVersion: THUMBNAIL_VERSION,
  }
  await putImageThumbnail(thumbnail)
  if (metadata.width && metadata.height && (image.width !== metadata.width || image.height !== metadata.height)) {
    await putImage({ ...image, width: metadata.width, height: metadata.height })
  }
  return thumbnail
}

export function getAllImages(): Promise<StoredImage[]> {
  return dbTransaction<StoredImageRecord[]>(STORE_IMAGES, 'readonly', (s) => s.getAll()).then((records) =>
    Promise.all(records.map(fromImageRecord)).then((images) => images.filter((image): image is StoredImage => image != null)),
  )
}

export function getAllImageIds(): Promise<string[]> {
  return dbTransaction(STORE_IMAGES, 'readonly', (s) => s.getAllKeys()).then((keys) =>
    keys.map(String),
  )
}

export function putImage(image: StoredImage): Promise<IDBValidKey> {
  return dbTransaction(STORE_IMAGES, 'readwrite', (s) => s.put(toImageRecord(image)))
}

export function deleteImage(id: string): Promise<undefined> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_IMAGES, STORE_THUMBNAILS], 'readwrite')
        tx.objectStore(STORE_IMAGES).delete(id)
        tx.objectStore(STORE_THUMBNAILS).delete(id)
        tx.oncomplete = () => resolve(undefined)
        tx.onerror = () => reject(tx.error)
      }),
  )
}

export function clearImages(): Promise<undefined> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_IMAGES, STORE_THUMBNAILS], 'readwrite')
        tx.objectStore(STORE_IMAGES).clear()
        tx.objectStore(STORE_THUMBNAILS).clear()
        tx.oncomplete = () => resolve(undefined)
        tx.onerror = () => reject(tx.error)
      }),
  )
}

// ===== Image hashing & dedup =====

export async function hashDataUrl(dataUrl: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    return hashDataUrlFallback(dataUrl)
  }

  const data = new TextEncoder().encode(dataUrl)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function hashDataUrlFallback(dataUrl: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193

  for (let i = 0; i < dataUrl.length; i++) {
    const code = dataUrl.charCodeAt(i)
    h1 ^= code
    h1 = Math.imul(h1, 0x01000193)
    h2 ^= code
    h2 = Math.imul(h2, 0x27d4eb2d)
  }

  return `fallback-${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`
}

export interface StoreImageResult {
  id: string
  width?: number
  height?: number
}

/**
 * 存储图片，若已存在（按 hash 去重）则跳过。
 * 返回 image id 及图片真实宽高。
 */
export async function storeImage(dataUrl: string, source: NonNullable<StoredImage['source']> = 'upload'): Promise<string> {
  return (await storeImageWithSize(dataUrl, source)).id
}

export async function storeImageWithSize(dataUrl: string, source: NonNullable<StoredImage['source']> = 'upload'): Promise<StoreImageResult> {
  const id = await hashDataUrl(dataUrl)
  const existing = await getImage(id)
  if (!existing) {
    const thumbnail = await safeCreateImageThumbnail(dataUrl)
    await putImage({
      id,
      dataUrl,
      createdAt: Date.now(),
      source,
      width: thumbnail.width,
      height: thumbnail.height,
    })
    if (thumbnail.thumbnailDataUrl) {
      await putImageThumbnail({
        id,
        thumbnailDataUrl: thumbnail.thumbnailDataUrl,
        width: thumbnail.width,
        height: thumbnail.height,
        thumbnailVersion: THUMBNAIL_VERSION,
      })
    }
    return { id, width: thumbnail.width, height: thumbnail.height }
  }

  if ((await getStoredImageThumbnail(id))?.thumbnailVersion !== THUMBNAIL_VERSION) {
    const thumbnail = await safeCreateImageThumbnail(existing.dataUrl)
    const width = thumbnail.width ?? existing.width
    const height = thumbnail.height ?? existing.height
    if (thumbnail.width && thumbnail.height && (existing.width !== thumbnail.width || existing.height !== thumbnail.height)) {
      await putImage({ ...existing, width: thumbnail.width, height: thumbnail.height })
    }
    if (thumbnail.thumbnailDataUrl) {
      await putImageThumbnail({
        id,
        thumbnailDataUrl: thumbnail.thumbnailDataUrl,
        width: thumbnail.width,
        height: thumbnail.height,
        thumbnailVersion: THUMBNAIL_VERSION,
      })
    }
    return { id, width, height }
  }
  return { id, width: existing.width, height: existing.height }
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片加载失败'))
    image.src = dataUrl
  })
}

async function createImageThumbnail(dataUrl: string): Promise<Omit<StoredImageThumbnail, 'id'>> {
  const image = await loadImage(dataUrl)
  const width = image.naturalWidth
  const height = image.naturalHeight
  if (width <= 0 || height <= 0) throw new Error('图片尺寸无效')

  const scale = Math.min(1, THUMBNAIL_MAX_SIZE / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前浏览器不支持 Canvas')
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)

  return {
    thumbnailDataUrl: canvas.toDataURL('image/webp', THUMBNAIL_QUALITY),
    width,
    height,
    thumbnailVersion: THUMBNAIL_VERSION,
  }
}

async function safeCreateImageThumbnail(dataUrl: string): Promise<Partial<Omit<StoredImageThumbnail, 'id'>>> {
  try {
    return await createImageThumbnail(dataUrl)
  } catch {
    return {}
  }
}

// ===== Blob storage migration =====

type WrittenRecord = { original: string; size: number; thumbnailVersion?: unknown }

function convertRecord(storeName: string, field: 'dataUrl' | 'thumbnailDataUrl', id: IDBValidKey) {
  return openDB().then((db) => new Promise<{ result: 'converted' | 'skipped' | 'kept'; written?: WrittenRecord }>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    let outcome: { result: 'converted' | 'skipped' | 'kept'; written?: WrittenRecord } = { result: 'skipped' }
    const req = store.get(id)
    req.onsuccess = () => {
      const rec = req.result as Record<string, unknown> | undefined
      const original = rec?.[field]
      if (!rec || typeof original !== 'string') return
      const blob = dataUrlToLosslessBlob(original)
      if (!blob) {
        outcome = { result: 'kept' }
        return
      }
      const { [field]: _, ...rest } = rec
      store.put({ ...rest, blob })
      outcome = { result: 'converted', written: { original, size: blob.size, thumbnailVersion: rec.thumbnailVersion } }
    }
    tx.oncomplete = () => resolve(outcome)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  }))
}

/** 读回刚写入的 Blob 校验能否还原成原串；失败时恢复原记录并永久停用 Blob 存储 */
async function verifyRecord(storeName: string, field: 'dataUrl' | 'thumbnailDataUrl', id: IDBValidKey, written: WrittenRecord) {
  const rec = await dbTransaction<Record<string, unknown> | undefined>(storeName, 'readonly', (s) => s.get(id))
  if (!rec?.blob || !(rec.blob instanceof Blob) || rec.blob.size !== written.size || rec.thumbnailVersion !== written.thumbnailVersion) return true
  try {
    if (await readBlobAsDataUrl(rec.blob) === written.original) return true
  } catch (err) {
    console.warn('读回转换后的图片失败', id, err)
  }
  const { blob: _, ...rest } = rec
  await dbTransaction(storeName, 'readwrite', (s) => s.put({ ...rest, [field]: written.original }))
  try {
    localStorage.setItem(BLOB_DISABLED_KEY, '1')
  } catch {
    // 标记写不进去时只在本次会话内停用
  }
  blobStorageEnabled = false
  console.warn('当前浏览器无法在 IndexedDB 中可靠地保存 Blob，改为保存 dataUrl 字符串')
  return false
}

let migrationRunning = false

/**
 * 把旧版以 dataUrl 字符串保存的原图和缩略图逐条转成 Blob。每条单独事务并在写后校验，随时可中断；
 * 下次启动重新扫描，已转换的直接跳过。全部处理完后记下标记，之后启动不再扫描。
 */
export async function migrateImagesToBlob() {
  if (migrationRunning || !blobStorageEnabled) return
  try {
    if (localStorage.getItem(BLOB_MIGRATED_KEY)) return
  } catch {
    // localStorage 不可用时每次启动都扫描一遍，已转换的记录很快跳过
  }
  migrationRunning = true
  let converted = 0
  let kept = 0
  try {
    for (const [storeName, field] of [[STORE_IMAGES, 'dataUrl'], [STORE_THUMBNAILS, 'thumbnailDataUrl']] as const) {
      const ids = await dbTransaction<IDBValidKey[]>(storeName, 'readonly', (s) => s.getAllKeys())
      for (const id of ids) {
        if (!blobStorageEnabled) return
        try {
          const outcome = await convertRecord(storeName, field, id)
          if (outcome.result === 'kept') {
            kept++
            console.warn('图片无法无损转换为 Blob，保留原格式', id)
          }
          if (outcome.result === 'converted') {
            if (!await verifyRecord(storeName, field, id, outcome.written!)) return
            converted++
          }
        } catch (err) {
          // 单条写入失败（如空间不足）保留原样，留待下次启动再试
          console.warn('图片转换为 Blob 失败，保留原格式', id, err)
          return
        }
        // 让出主线程，避免长时间占用影响界面和其他读写
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
    }
    try {
      localStorage.setItem(BLOB_MIGRATED_KEY, '1')
    } catch {
      // 标记写不进去不影响数据，下次启动再扫描一遍
    }
  } catch (err) {
    console.warn('图片存储格式迁移中断，下次启动继续', err)
  } finally {
    migrationRunning = false
    if (converted || kept) console.info(`图片存储格式迁移：转换 ${converted} 条，保留原格式 ${kept} 条`)
  }
}
