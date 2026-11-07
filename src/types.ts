// ===== 设置 =====

export const ZIP_DOWNLOAD_ROUTE_VALUES = [
  'task-selection',
  'favorite-collection-selection',
  'image-context-menu-all',
  'task-detail-all',
  'task-detail-partial',
] as const
export type ZipDownloadRoute = typeof ZIP_DOWNLOAD_ROUTE_VALUES[number]
export const DEFAULT_ZIP_DOWNLOAD_ROUTES: ZipDownloadRoute[] = ['task-selection', 'favorite-collection-selection']
export type ApiConnectionId = string
export type CustomConnectionTemplate = 'http-image'
export const DEFAULT_STREAM_PARTIAL_IMAGES = 0
/** 接口允许的参考图数量上限 */
export const MAX_INPUT_IMAGES = 16

export type CustomConnectionRequestMethod = 'GET' | 'POST'
export type CustomConnectionContentType = 'json' | 'multipart'
export type CustomConnectionFileSource = 'inputImages' | 'mask'

export interface CustomConnectionFileMapping {
  field: string
  source: CustomConnectionFileSource
  array?: boolean
}

export interface CustomConnectionResultMapping {
  imageUrlPaths?: string[]
  b64JsonPaths?: string[]
}

export interface CustomConnectionSubmitMapping {
  path: string
  method?: CustomConnectionRequestMethod
  contentType?: CustomConnectionContentType
  query?: Record<string, string>
  body?: Record<string, unknown>
  files?: CustomConnectionFileMapping[]
  taskIdPath?: string
  result?: CustomConnectionResultMapping
}

export interface CustomConnectionPollMapping {
  path: string
  method?: CustomConnectionRequestMethod
  query?: Record<string, string>
  intervalSeconds?: number
  statusPath: string
  successValues: string[]
  failureValues: string[]
  errorPath?: string
  result: CustomConnectionResultMapping
}

export interface CustomConnectionDefinition {
  id: string
  name: string
  template?: CustomConnectionTemplate
  submit: CustomConnectionSubmitMapping
  editSubmit?: CustomConnectionSubmitMapping
  poll?: CustomConnectionPollMapping
}

export interface ApiProfile {
  id: string
  /** 当前部署指定的默认预置配置。 */
  isDefault?: boolean
  name: string
  /** 预置配置的 Markdown 说明。 */
  description?: string
  connectionId: ApiConnectionId
  baseUrl: string
  apiKey: string
  /** 模型 ID 列表，多个模型以 `, ` 分隔 */
  model: string
  /** SVG 编写模型，留空时使用接口默认值。 */
  svgModel?: string
  /** 首页选中的模型；不在列表中时回退到第一个 */
  selectedModel?: string
  timeout: number
  codexCli: boolean
  apiProxy: boolean
  responseFormatB64Json?: boolean
  streamImages?: boolean
  streamPartialImages?: number
  transparentBackgroundMethod: 'api' | 'local'
  /** 可在首页“更多设置”中调整的参数。 */
  homeParams?: HomeParam[]
  /** 首页隐藏的参数使用此配置的默认值。 */
  paramDefaults?: Partial<Pick<TaskParams, HomeParam | 'size' | 'background'>>
  connectionDrafts?: Partial<Record<ApiConnectionId, Partial<Pick<ApiProfile, 'baseUrl' | 'model' | 'svgModel' | 'codexCli' | 'apiProxy' | 'responseFormatB64Json' | 'streamImages' | 'streamPartialImages' | 'transparentBackgroundMethod' | 'homeParams' | 'paramDefaults'>>>>
}

export interface PresetConfig {
  customConnections: CustomConnectionDefinition[]
  profiles: ApiProfile[]
}

/** 参考图预览中“编辑图片”按钮的默认行为 */
export type ReferenceImageEditAction = 'ask' | 'sketch' | 'mask'

/** 重试任务时新建任务，还是覆盖原任务 */
export type RetryMode = 'new' | 'overwriteFailed' | 'overwriteAll'
export type ColorMode = 'system' | 'light' | 'dark'

/** 打开画板的请求：baseImageSrc 为空时是空白画板，replaceImageId 表示完成后替换该参考图 */
export interface SketchBoardRequest {
  baseImageSrc: string | null
  replaceImageId?: string
}

/** 正在进行的批量提交进度 */
export interface BatchProgress {
  total: number
  started: number
  finished: number
}

/** 批量提交模式：排队逐条执行，或按并发数同时执行 */
export type BatchPromptMode = 'queue' | 'concurrent'

export interface AppSettings {
  customConnections: CustomConnectionDefinition[]
  connectionOrder?: string[]
  clearInputAfterSubmit: boolean
  persistInputOnRestart: boolean
  reuseTaskApiProfileTemporarily: boolean
  alwaysShowRetryButton: boolean
  /** 在收藏夹页新建的任务自动加入当前收藏夹 */
  saveTasksToActiveFavoriteCollection: boolean
  retryMode: RetryMode
  allowPromptRewrite: boolean
  taskCompletionNotification: boolean
  enterSubmit: boolean
  colorMode: ColorMode
  /** 偏好设置：是否在首页提供多提示词批量提交 */
  showBatchPrompt: boolean
  /** 多提示词批量提交，提示词之间空两行分隔 */
  batchPromptEnabled: boolean
  batchPromptMode: BatchPromptMode
  /** 并发模式下是否限制并发数（默认开启），关闭时全部同时提交 */
  batchPromptConcurrencyLimited: boolean
  batchPromptConcurrency: number
  referenceImageEditAction: ReferenceImageEditAction
  zipDownloadRoutes: ZipDownloadRoute[]
  profiles: ApiProfile[]
  activeProfileId: string
}

// ===== 任务参数 =====

export interface TaskParams {
  size: string
  /** Gemini / Grok 的比例和分辨率独立于 GPT Image 的像素尺寸。 */
  aspect_ratio?: string
  image_size?: string
  thinking_level?: 'default' | 'minimal' | 'medium' | 'high'
  background?: 'default' | 'auto' | 'opaque' | 'transparent'
  quality: 'default' | 'auto' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  output_format: 'default' | 'png' | 'jpeg' | 'webp' | 'svg' | 'gif'
  output_compression: number | null
  moderation: 'default' | 'auto' | 'low'
  n: number
  transparent_output: boolean
  complexity?: 'default' | 'low' | 'medium' | 'high'
  frame_count?: number
  frame_duration_ms?: number
}

export const OUTPUT_FORMATS = ['png', 'jpeg', 'webp', 'svg', 'gif'] as const

export const DEFAULT_PARAMS: TaskParams = {
  size: 'default',
  quality: 'default',
  output_format: 'default',
  output_compression: null,
  moderation: 'default',
  background: 'default',
  thinking_level: 'default',
  n: 1,
  transparent_output: false,
  complexity: 'default',
  frame_count: 9,
  frame_duration_ms: 200,
}

export const HOME_PARAM_KEYS = ['quality', 'complexity', 'output_format', 'frame_count', 'frame_duration_ms', 'transparent_output', 'output_compression', 'moderation', 'thinking_level', 'n'] as const
export type HomeParam = typeof HOME_PARAM_KEYS[number]
export const DEFAULT_HOME_PARAMS: HomeParam[] = ['quality', 'n']

// ===== 输入图片（UI 层面） =====

export interface InputImage {
  /** IndexedDB image store 的 id（SHA-256 hash） */
  id: string
  /** data URL，用于预览 */
  dataUrl: string
  /** 与原图分开保存的透明标注层。 */
  markupImageId?: string
}

/** 参考图上的评论标注，x / y 为相对原图宽高的比例（0~1） */
export interface ImageComment {
  x: number
  y: number
  text: string
}

export interface MaskDraft {
  targetImageId: string
  maskDataUrl: string
  updatedAt: number
}

// ===== 任务记录 =====

export type TaskStatus = 'running' | 'done' | 'error'

export interface TaskRecord {
  id: string
  prompt: string
  params: TaskParams
  /** 生成时使用的接入标识 */
  apiConnectionId?: ApiConnectionId
  /** 生成时使用的 API 配置 ID */
  apiProfileId?: string
  /** 生成时使用的配置名称 */
  apiProfileName?: string
  /** 生成时使用的模型 ID */
  apiModel?: string
  /** 自定义异步服务商任务 ID，用于重启后继续查询结果 */
  customTaskId?: string
  /** 自定义异步任务是否等待自动恢复 */
  customRecoverable?: boolean
  /** API 返回的实际生效参数，用于标记与请求值不一致的情况 */
  actualParams?: Partial<TaskParams>
  /** 输出图片对应的实际生效参数，key 为 outputImages 中的图片 id */
  actualParamsByImage?: Record<string, Partial<TaskParams>>
  /** 输出图片对应的 API 改写提示词，key 为 outputImages 中的图片 id */
  revisedPromptByImage?: Record<string, string>
  /** 是否启用透明背景后处理 */
  transparentOutput?: boolean
  /** 实际发送给 API 的透明背景辅助提示词 */
  transparentPrompt?: string
  /** 透明背景后处理前的原始输出图片 id，顺序对应 outputImages */
  transparentOriginalImages?: string[]
  /** 输入图片的 image store id 列表 */
  inputImageIds: string[]
  maskTargetImageId?: string | null
  maskImageId?: string | null
  /** 第一张参考图的独立标注层。 */
  markupImageId?: string | null
  /** 输出图片的 image store id 列表 */
  outputImages: string[]
  /** 并发多图中失败的输出槽位，requestIndex 为从 0 开始的请求序号 */
  outputErrors?: Array<{ requestIndex: number; error: string; rawResponsePayload?: string }>
  /** 流式生成的中间步骤图片 id 列表，仅失败时保留供排查/下载 */
  streamPartialImageIds?: string[]
  /** API 返回的原始图片 HTTP URL（非 base64 时记录） */
  rawImageUrls?: string[]
  /** 发生解析错误时的原始响应 JSON */
  rawResponsePayload?: string
  status: TaskStatus
  error: string | null
  createdAt: number
  /** 本次生成开始时间，重试时不改变原始创建时间 */
  startedAt?: number
  finishedAt: number | null
  /** 总耗时毫秒 */
  elapsed: number | null
  /** 是否收藏 */
  isFavorite?: boolean
  /** 所属收藏夹 ID 列表 */
  favoriteCollectionIds?: string[]
}

export interface FavoriteCollection {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

// ===== IndexedDB 存储的图片 =====

export interface StoredImage {
  id: string
  dataUrl: string
  /** 图片首次存储时间（ms） */
  createdAt?: number
  /** 图片来源：用户上传 / API 生成 / 遮罩 */
  source?: 'upload' | 'generated' | 'mask'
  /** 原图宽度 */
  width?: number
  /** 原图高度 */
  height?: number
}

export interface StoredImageThumbnail {
  id: string
  /** 列表缩略图，用于避免卡片页解码完整 4K 原图 */
  thumbnailDataUrl: string
  /** 原图宽度 */
  width?: number
  /** 原图高度 */
  height?: number
  /** 缩略图生成参数版本 */
  thumbnailVersion?: number
}

// ===== API 响应 =====

export interface ImageResponseItem {
  b64_json?: string
  url?: string
  revised_prompt?: string
  size?: string
  quality?: string
  output_format?: string
  output_compression?: number
  moderation?: string
}

export interface ImageApiResponse {
  data: ImageResponseItem[]
  size?: string
  quality?: string
  output_format?: string
  output_compression?: number
  moderation?: string
  n?: number
}

export interface ExportData {
  version: number
  exportedAt: string
  backupPart?: {
    id: string
    index: number
    total: number
  }
  settings?: Omit<AppSettings, 'customConnections'> & { customConnections?: CustomConnectionDefinition[] }
  tasks?: TaskRecord[]
  favoriteCollections?: FavoriteCollection[]
  defaultFavoriteCollectionId?: string | null
  /** imageId → 图片信息 */
  imageFiles?: Record<string, {
    path: string
    createdAt?: number
    source?: 'upload' | 'generated' | 'mask'
    width?: number
    height?: number
    /** 通过链接添加参考图时记录的原链接 */
    sourceUrl?: string
  }>
  /** imageId → 缩略图信息 */
  thumbnailFiles?: Record<string, {
    path: string
    width?: number
    height?: number
    thumbnailVersion?: number
  }>
}
