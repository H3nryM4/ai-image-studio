import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ApiProfile, AppSettings, BatchProgress, PresetConfig, TaskParams, InputImage, MaskDraft, SketchBoardRequest, TaskRecord, FavoriteCollection, StoredImage, StoredImageThumbnail } from './types'
import { DEFAULT_PARAMS, DEFAULT_STREAM_PARTIAL_IMAGES } from './types'
import { DEFAULT_SETTINGS, getActiveApiProfile, isOpenAIConnection, getCustomConnectionDefinition, mergeImportedSettings, mergePresetImportedSettings, normalizeSettings, resolveApiProfileModel, splitModelList, validateApiProfile } from './lib/apiProfiles'
import { enforcePresetConfigPolicy, getPresetConfig, getPresetProfileIds, getPresetConnectionIds, isPresetConfigDeletionPrevented, isPresetConfigOnlyEnabled, isPresetConfigParamsLocked, isPresetProfile, isPresetConnectionDeletionPrevented } from './lib/presetConfig'
import { dismissAllTooltips } from './lib/tooltipDismiss'
import { getTaskPromptText, remapImageCommentsForOrder } from './lib/promptImageComments'
import { getAllTasks, putTask, deleteTask as dbDeleteTask, commitTaskDeletion, clearTasks as dbClearTasks, getImage, getStoredImageThumbnail, getImageThumbnail, getAllImageIds, putImage, putImageThumbnail, deleteImage, clearImages, storeImage, storeImageWithSize } from './lib/db'
import { callImageApi } from './lib/api'
import { showBrowserNotification } from './lib/browserNotification'
import { IMAGE_FETCH_CORS_HINT, isHttpUrl } from './lib/imageApiShared'
import { getCustomQueuedImageResult } from './lib/openaiCompatibleImageApi'
import { validateMaskMatchesImage } from './lib/canvasImage'
import { GEMINI_CONNECTION_ID } from './lib/gemini'
import { orderInputImagesForMask } from './lib/mask'
import { normalizeHomeParams, switchHomeParams } from './lib/homeParams'
import { getChangedParams, normalizeParamsForSettings } from './lib/paramCompatibility'
import { runWithConcurrency, splitBatchPrompts } from './lib/batchPrompts'
import { createTransparentOutputMeta, getTransparentRequestParams, removeKeyedBackgroundFromDataUrl } from './lib/transparentImage'
import { blobToDataUrl, fileToDataUrl } from './lib/dataUrl'
import { cacheImage, cacheThumbnail, clearImageCaches, deleteCachedImage, deleteImageCacheEntry, ensureImageCached, scheduleThumbnailBackfill } from './lib/imageCache'
import { hasActiveDataOperations } from './lib/dataOperations'
import { endDataProgress, setDataProgressCancelable, startDataProgress, updateDataProgress } from './lib/dataProgress'
import { throwIfAborted } from './lib/serverSentEvents'
import { formatExportFileTime } from './lib/exportFileName'
import { buildExportZip, createExportBlob, getExportImageEstimatedBytes, getExportZipPlan, MAX_EXPORT_ZIP_BYTES, readExportZip, readExportZipFileAsDataUrl, readExportZipManifest } from './lib/exportZip'
import { updateInputDraftImages } from './lib/inputDraftState'
import { ALL_FAVORITES_COLLECTION_ID, DEFAULT_FAVORITE_COLLECTION_ID, createDefaultFavoriteCollection, deleteFavoriteCollectionState, ensureDefaultFavoriteCollection, getNewTaskFavoritePatch, getTaskFavoriteCollectionIds, mergeFavoriteCollections, normalizeFavoriteCollectionIds, normalizeFavoriteCollectionName, normalizeFavoriteCollections, normalizeFavoritePatch, normalizeLoadedFavoriteState, resolveDefaultFavoriteCollectionId, sameFavoriteCollectionIds } from './lib/favoriteState'
import { createPersistedState, normalizePersistedState } from './lib/persistedState'
import { addImageSizeParam, createTaskDonePatch, createTaskErrorPatch, deriveGalleryActualParams, firstActualParams, hasActualParams, hasActualSizeParam, mapActualParamsByImage, mapRevisedPromptsByImage, markInterruptedRunningTasks } from './lib/taskState'
import { stripInjectedCodexCliSizePrompt } from './lib/size'

const CUSTOM_RECOVERY_POLL_MS = 10_000
const customRecoveryTimers = new Map<string, ReturnType<typeof setTimeout>>()
const openAIWatchdogTimers = new Map<string, ReturnType<typeof setTimeout>>()
const taskExecutions = new Map<string, symbol>()
const ERROR_TOAST_MAX_LENGTH = 80
type ToastType = 'info' | 'success' | 'error'

export function getErrorToastMessage(message: string): string {
  const text = message.trim()
  if (!text) return '操作失败'

  const firstLine = text.split(/\r?\n/)[0]?.trim() ?? ''
  const separatorIndex = firstLine.search(/[：:]/)
  if (separatorIndex > 0) {
    const title = firstLine.slice(0, separatorIndex).trim()
    if (isErrorToastTitle(title)) return title
  }

  if (firstLine.length > ERROR_TOAST_MAX_LENGTH) return '操作失败，请查看详情'
  return firstLine || '操作失败'
}

function getToastMessage(message: string, type: ToastType): string {
  return type === 'error' ? getErrorToastMessage(message) : message
}

function isErrorToastTitle(title: string): boolean {
  return /(?:失败|错误|异常|报错|无法|不能|超时|中断|断开|请先|请输入|已达上限|不存在|已丢失)$/.test(title)
}

export type SettingsTab = 'general' | 'appearance' | 'api' | 'data' | 'about'

const TIMEOUT_STREAMING_HINT = '也可尝试打开「流式传输」，并提高「请求中间步骤图像数」来维持连接。'
const TIMEOUT_PARTIAL_IMAGES_ZERO_HINT = '官方流式接口不发送心跳，当前「请求中间步骤图像数」为 0，连接可能因无数据传输而断开。建议提高到 2 或 3。'
const TIMEOUT_PARTIAL_IMAGES_LOW_HINT = '也可尝试提高「请求中间步骤图像数」来维持连接，避免长时间无数据传输导致断开。'

type TimeoutStreamingHintProfile = Pick<ApiProfile, 'connectionId' | 'streamImages' | 'streamPartialImages'>

function getTimeoutStreamingHint(profile?: TimeoutStreamingHintProfile | null) {
  if (!profile || !isOpenAIConnection(profile.connectionId)) return ''
  const partialImages = profile.streamPartialImages ?? DEFAULT_STREAM_PARTIAL_IMAGES
  if (profile.streamImages !== true) return TIMEOUT_STREAMING_HINT
  if (partialImages === 0) return TIMEOUT_PARTIAL_IMAGES_ZERO_HINT
  return partialImages < 3 ? TIMEOUT_PARTIAL_IMAGES_LOW_HINT : ''
}

function createOpenAITimeoutError(timeoutSeconds: number, profile?: TimeoutStreamingHintProfile | null) {
  return `请求超时：超过 ${timeoutSeconds} 秒仍未完成，请稍后重试或提高超时时间。${getTimeoutStreamingHint(profile)}`
}

function orderImagesWithMaskFirst(images: InputImage[], maskTargetImageId: string | null | undefined) {
  if (!maskTargetImageId) return images
  const maskIdx = images.findIndex((img) => img.id === maskTargetImageId)
  if (maskIdx <= 0) return images
  const next = [...images]
  const [maskImage] = next.splice(maskIdx, 1)
  next.unshift(maskImage)
  return next
}

function showTaskCompletionNotification(title: string, body: string, tag = 'task-completion') {
  const settings = normalizeSettings(useStore.getState().settings)
  if (!settings.taskCompletionNotification) return
  showBrowserNotification(title, { body, tag })
}

// 失败通知用独立 tag，避免与成功通知互相覆盖；批量任务在整批结束时汇总失败数量
function showTaskFailureNotification(task: TaskRecord) {
  if (batchTaskIds.has(task.id)) return
  showTaskCompletionNotification('图像生成失败', '请回到应用查看详情。', 'task-failure')
}

export function getPersistedState(state: AppState) {
  return createPersistedState(state)
}

function mergePersistedState(persistedState: unknown, currentState: AppState): AppState {
  const state = normalizePersistedState(persistedState, currentState)
  if (!state) return currentState
  return { ...currentState, ...state, activeFavoriteCollectionId: null, favoritePickerTaskIds: null }
}

// ===== Store 类型 =====

interface AppState {

  // 设置
  settings: AppSettings
  previousPresetConfig: PresetConfig | null
  setSettings: (s: Partial<AppSettings>) => void
  setPresetImportedSettings: (
    importedSettings: Partial<AppSettings> | unknown,
    transform?: (settings: AppSettings) => Partial<AppSettings>,
  ) => Promise<void>
  dismissedPresetProfileIds: string[]
  dismissPresetProfile: (id: string) => void
  restorePresetProfile: (id: string) => void
  dismissedPresetConnectionIds: string[]
  dismissPresetConnection: (id: string) => void
  restorePresetConnection: (id: string) => void

  // 输入
  prompt: string
  setPrompt: (p: string) => void
  /**
   * 输入框最后一次的选区（可见文本偏移），供画板等外部入口插入胶囊并覆盖选中内容；未聚焦过时为 null。
   * 同时记下当时的提示词，提示词被其他途径替换后选区即失效，使用前需比对。
   */
  promptSelection: { start: number; end: number; prompt: string } | null
  setPromptSelection: (selection: { start: number; end: number }) => void
  inputImages: InputImage[]
  /** 通过链接添加的参考图 id 到原链接，供只接受链接参考图的自定义服务商使用 */
  imageSourceUrls: Record<string, string>
  addInputImage: (img: InputImage) => void
  replaceInputImage: (idx: number, img: InputImage) => void
  removeInputImage: (idx: number) => void
  clearInputImages: () => void
  setInputImages: (imgs: InputImage[], options?: { equivalentImageIds?: Record<string, string> }) => void
  moveInputImage: (fromIdx: number, toIdx: number) => void
  maskDraft: MaskDraft | null
  setMaskDraft: (draft: MaskDraft | null) => void
  clearMaskDraft: () => void
  maskEditorImageId: string | null
  setMaskEditorImageId: (id: string | null) => void

  // 参数
  params: TaskParams
  paramsByProfile: Record<string, TaskParams>
  setParams: (p: Partial<TaskParams>) => void
  reusedTaskApiProfileId: string | null
  reusedTaskApiProfileName: string | null
  reusedTaskApiProfileMissing: boolean
  /** 临时复用其他配置时使用的模型，只在本次复用中生效，不写入该配置 */
  reusedTaskApiModel: string | null
  setReusedTaskApiProfile: (profileId: string | null, missing?: boolean, profileName?: string | null, model?: string | null) => void
  setReusedTaskApiModel: (model: string) => void
  /** 正在进行的批量提交进度，仅保存在内存中 */
  batchProgress: BatchProgress | null
  setBatchProgress: (progress: BatchProgress | null) => void

  // 任务列表
  tasks: TaskRecord[]
  setTasks: (t: TaskRecord[]) => void
  favoriteCollections: FavoriteCollection[]
  setFavoriteCollections: (collections: FavoriteCollection[]) => void
  defaultFavoriteCollectionId: string | null
  setDefaultFavoriteCollectionId: (id: string | null) => void
  activeFavoriteCollectionId: string | null
  isManageCollectionsModalOpen: boolean
  setActiveFavoriteCollectionId: (id: string | null) => void
  openManageCollectionsModal: () => void
  closeManageCollectionsModal: () => void
  favoritePickerTaskIds: string[] | null
  openFavoritePicker: (taskIds: string[]) => void
  closeFavoritePicker: () => void
  streamPreviews: Record<string, string>
  streamPreviewSlots: Record<string, Record<string, string>>
  setTaskStreamPreview: (taskId: string, image?: string, requestIndex?: number) => void

  // 搜索和筛选
  searchQuery: string
  setSearchQuery: (q: string) => void
  filterStatus: 'all' | 'running' | 'done' | 'error'
  setFilterStatus: (status: AppState['filterStatus']) => void
  filterFavorite: boolean
  setFilterFavorite: (f: boolean) => void

  // 多选
  selectionMode: boolean
  setSelectionMode: (enabled: boolean) => void
  selectedTaskIds: string[]
  setSelectedTaskIds: (ids: string[] | ((prev: string[]) => string[])) => void
  toggleTaskSelection: (id: string, force?: boolean) => void
  clearSelection: () => void
  selectedFavoriteCollectionIds: string[]
  setSelectedFavoriteCollectionIds: (ids: string[] | ((prev: string[]) => string[])) => void
  toggleFavoriteCollectionSelection: (id: string, force?: boolean) => void
  clearFavoriteCollectionSelection: () => void

  // UI
  detailTaskId: string | null
  setDetailTaskId: (id: string | null) => void
  lightboxImageId: string | null
  lightboxImageList: string[]
  /** 预览参考图时对应的提示词，按图片在列表中的位置取其评论；为空时不显示评论 */
  lightboxCommentPrompt: string | null
  setLightboxImageId: (id: string | null, list?: string[], commentPrompt?: string | null) => void
  /** 画板；baseImageSrc 为画布底图，replaceImageId 为完成后要替换的参考图 */
  sketchBoard: SketchBoardRequest | null
  setSketchBoard: (board: SketchBoardRequest | null) => void
  showSettings: boolean
  settingsTabRequest: SettingsTab | null
  setShowSettings: (v: boolean, tab?: SettingsTab) => void

  // Toast
  toast: { message: string; type: ToastType } | null
  showToast: (message: string, type?: ToastType) => void

  // Confirm dialog
  confirmDialog: {
    title: string
    message: string
    checkbox?: {
      label: string
      defaultChecked?: boolean
      disabled?: boolean
      tone?: 'primary' | 'danger'
    }
    confirmText?: string
    cancelText?: string
    showCancel?: boolean
    buttons?: Array<{
      label: string
      tone?: 'primary' | 'secondary' | 'danger' | 'warning'
      action: (checkboxChecked?: boolean) => void
    }>
    icon?: 'info' | 'copy'
    minConfirmDelayMs?: number
    messageAlign?: 'left' | 'center'
    tone?: 'danger' | 'warning'
    awaitAction?: boolean
    action?: (checkboxChecked?: boolean) => void | boolean | Promise<void | boolean>
    cancelAction?: (checkboxChecked?: boolean) => void
  } | null
  setConfirmDialog: (d: AppState['confirmDialog']) => void
}

function isImageReferencedByState(state: AppState, imageId: string) {
  return state.inputImages.some((img) => img.id === imageId) || state.tasks.some((task) =>
    task.inputImageIds.includes(imageId) ||
    task.outputImages.includes(imageId) ||
    task.transparentOriginalImages?.includes(imageId) ||
    task.streamPartialImageIds?.includes(imageId) ||
    task.maskTargetImageId === imageId ||
    task.maskImageId === imageId,
  )
}

export async function deleteImageIfUnreferenced(imageId: string) {
  if (isImageReferencedByState(useStore.getState(), imageId)) return
  try {
    await deleteStoredImageIfUnreferenced(imageId)
  } catch {
    // 清理是内存/存储优化，失败不影响替换结果。
  }
}

function forgetImageSourceUrl(imageId: string) {
  if (!(imageId in useStore.getState().imageSourceUrls)) return
  useStore.setState((s) => {
    const imageSourceUrls = { ...s.imageSourceUrls }
    delete imageSourceUrls[imageId]
    return { imageSourceUrls }
  })
}

async function deleteStoredImageIfUnreferenced(imageId: string) {
  if (isImageReferencedByState(useStore.getState(), imageId)) return
  const [image, thumbnail] = await Promise.all([getImage(imageId), getStoredImageThumbnail(imageId)])
  if (isImageReferencedByState(useStore.getState(), imageId)) return

  await deleteImage(imageId)
  if (!isImageReferencedByState(useStore.getState(), imageId)) {
    deleteImageCacheEntry(imageId)
    forgetImageSourceUrl(imageId)
    return
  }

  if (image) {
    await putImage(image)
    cacheImage(image.id, image.dataUrl)
  }
  if (thumbnail) {
    await putImageThumbnail(thumbnail)
    cacheThumbnail(thumbnail.id, {
      dataUrl: thumbnail.thumbnailDataUrl,
      width: thumbnail.width,
      height: thumbnail.height,
      thumbnailVersion: thumbnail.thumbnailVersion,
    })
  }
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({

      // Settings
      settings: { ...DEFAULT_SETTINGS },
      previousPresetConfig: null,
      dismissedPresetProfileIds: [],
      dismissPresetProfile: (id) => set((state) => ({
        dismissedPresetProfileIds: state.dismissedPresetProfileIds.includes(id)
          ? state.dismissedPresetProfileIds
          : [...state.dismissedPresetProfileIds, id],
      })),
      restorePresetProfile: (id) => set((state) => ({
        dismissedPresetProfileIds: state.dismissedPresetProfileIds.filter((item) => item !== id),
      })),
      dismissedPresetConnectionIds: [],
      dismissPresetConnection: (id) => set((state) => ({
        dismissedPresetConnectionIds: state.dismissedPresetConnectionIds.includes(id)
          ? state.dismissedPresetConnectionIds
          : [...state.dismissedPresetConnectionIds, id],
      })),
      restorePresetConnection: (id) => set((state) => ({
        dismissedPresetConnectionIds: state.dismissedPresetConnectionIds.filter((item) => item !== id),
      })),
      setSettings: (s) => set((st) => {
        const previous = normalizeSettings(st.settings)
        const merged = normalizeSettings({ ...previous, ...s })
        const effectiveDismissedPresetConnectionIds = st.dismissedPresetConnectionIds.filter((id) =>
          !isPresetConnectionDeletionPrevented(id, previous.profiles),
        )
        const settings = normalizeSettings(enforcePresetConfigPolicy(merged, {
          dismissedPresetConnectionIds: effectiveDismissedPresetConnectionIds,
        }))
        const shouldClearReusedProfile = st.reusedTaskApiProfileId && settings.activeProfileId === st.reusedTaskApiProfileId
        return {
          settings,
          ...switchHomeParams(st.params, st.paramsByProfile, previous.profiles.find((profile) => profile.id === st.reusedTaskApiProfileId) ?? getActiveApiProfile(previous), settings.profiles.find((profile) => profile.id === st.reusedTaskApiProfileId) ?? getActiveApiProfile(settings)),
          ...(shouldClearReusedProfile
            ? { reusedTaskApiProfileId: null, reusedTaskApiProfileName: null, reusedTaskApiProfileMissing: false, reusedTaskApiModel: null }
            : {}),
        }
      }),
      setPresetImportedSettings: async (importedSettings, transform) => {
        set((state) => {
          const presetIds = getPresetProfileIds()
          const presetConnectionIds = getPresetConnectionIds()
          const dismissedPresetProfileIds = state.dismissedPresetProfileIds.filter((id) => presetIds.has(id))
          const deletionPrevented = isPresetConfigDeletionPrevented()
          const remainingPresetProfiles = (getPresetConfig()?.profiles ?? state.settings.profiles)
            .filter((profile) => !dismissedPresetProfileIds.includes(profile.id))
          const dismissedPresetConnectionIds = state.dismissedPresetConnectionIds
            .filter((id) => presetConnectionIds.has(id))
          const effectiveDismissedPresetConnectionIds = dismissedPresetConnectionIds
            .filter((id) => !isPresetConnectionDeletionPrevented(id, remainingPresetProfiles))
          const merged = mergePresetImportedSettings(state.settings, importedSettings, {
            lockPresetParams: isPresetConfigParamsLocked(),
            dismissedPresetProfileIds: deletionPrevented ? [] : dismissedPresetProfileIds,
            dismissedPresetConnectionIds: effectiveDismissedPresetConnectionIds,
            previousPresetConfig: state.previousPresetConfig,
            usedPresetProfileIds: state.tasks.flatMap((task) => task.apiProfileId ? [task.apiProfileId] : []),
          })
          const settings = normalizeSettings(enforcePresetConfigPolicy(
            normalizeSettings(transform?.(merged.settings) ?? merged.settings),
            { dismissedPresetConnectionIds: effectiveDismissedPresetConnectionIds },
          ))
          const shouldClearReusedProfile = state.reusedTaskApiProfileId && settings.activeProfileId === state.reusedTaskApiProfileId
          return {
            settings,
            ...switchHomeParams(state.params, state.paramsByProfile, state.settings.profiles.find((profile) => profile.id === state.reusedTaskApiProfileId) ?? getActiveApiProfile(state.settings), settings.profiles.find((profile) => profile.id === state.reusedTaskApiProfileId) ?? getActiveApiProfile(settings)),
            previousPresetConfig: getPresetConfig() ? merged.presetConfig : null,
            dismissedPresetProfileIds,
            dismissedPresetConnectionIds,
            reusedTaskApiProfileId: shouldClearReusedProfile ? null : state.reusedTaskApiProfileId,
            ...(shouldClearReusedProfile
              ? { reusedTaskApiProfileName: null, reusedTaskApiProfileMissing: false, reusedTaskApiModel: null }
              : {}),
          }
        })
      },

      // Input
      prompt: '',
      setPrompt: (prompt) => set({ prompt }),
      promptSelection: null,
      setPromptSelection: (selection) => set((s) => ({ promptSelection: { ...selection, prompt: s.prompt } })),
      inputImages: [],
      imageSourceUrls: {},
      addInputImage: (img) =>
        set((s) => {
          if (s.inputImages.find((i) => i.id === img.id)) return s
          return { inputImages: [...s.inputImages, img] }
        }),
      replaceInputImage: (idx, img) => {
        let removedImageId: string | null = null
        set((s) => {
          if (idx < 0 || idx >= s.inputImages.length) return s
          const previous = s.inputImages[idx]
          if (!previous || previous.id === img.id) return s
          if (s.inputImages.some((item, itemIdx) => itemIdx !== idx && item.id === img.id)) return s
          removedImageId = previous.id
          const inputImages = s.inputImages.map((item, itemIdx) => itemIdx === idx ? img : item)
          return updateInputDraftImages(s, inputImages, {
            equivalentImageIds: { [previous.id]: img.id },
            clearMissingMask: previous.id === s.maskDraft?.targetImageId,
          })
        })
        if (removedImageId) void deleteImageIfUnreferenced(removedImageId)
      },
      removeInputImage: (idx) =>
        set((s) => {
          const removed = s.inputImages[idx]
          const inputImages = s.inputImages.filter((_, i) => i !== idx)
          return updateInputDraftImages(s, inputImages, {
            clearMissingMask: removed?.id === s.maskDraft?.targetImageId,
          })
        }),
      clearInputImages: () =>
        set((s) => {
          for (const img of s.inputImages) deleteCachedImage(img.id)
          return {
            ...updateInputDraftImages(s, []),
            maskDraft: null,
            maskEditorImageId: null,
          }
        }),
      setInputImages: (imgs, options) =>
        set((s) => {
          const inputImages = orderImagesWithMaskFirst(imgs, s.maskDraft?.targetImageId)
          return updateInputDraftImages(s, inputImages, {
            equivalentImageIds: options?.equivalentImageIds,
          })
        }),
      moveInputImage: (fromIdx, toIdx) =>
        set((s) => {
          const images = [...s.inputImages]
          if (fromIdx < 0 || fromIdx >= images.length) return s
          const maskTargetImageId = s.maskDraft?.targetImageId
          if (maskTargetImageId && images[fromIdx]?.id === maskTargetImageId) return s
          const minTargetIdx = maskTargetImageId && images.some((img) => img.id === maskTargetImageId) ? 1 : 0
          const targetIdx = Math.max(minTargetIdx, Math.min(images.length, toIdx))
          const insertIdx = fromIdx < targetIdx ? targetIdx - 1 : targetIdx
          if (insertIdx === fromIdx) return s
          const [moved] = images.splice(fromIdx, 1)
          images.splice(insertIdx, 0, moved)
          return updateInputDraftImages(s, images, { clearMissingMask: false })
        }),
      maskDraft: null,
      setMaskDraft: (maskDraft) =>
        set((s) => {
          const inputImages = orderImagesWithMaskFirst(s.inputImages, maskDraft?.targetImageId)
          return {
            maskDraft,
            inputImages,
            prompt: remapImageCommentsForOrder(s.prompt, s.inputImages, inputImages),
          }
        }),
      clearMaskDraft: () => set({ maskDraft: null }),
      maskEditorImageId: null,
      setMaskEditorImageId: (maskEditorImageId) => {
        const state = useStore.getState()
        const profile = state.settings.profiles.find((item) => item.id === state.reusedTaskApiProfileId) ?? getActiveApiProfile(state.settings)
        if (maskEditorImageId && profile.connectionId === GEMINI_CONNECTION_ID) {
          state.showToast('Gemini 暂不支持蒙版编辑，请使用画板或文字描述修改区域', 'info')
          return
        }
        if (maskEditorImageId) dismissAllTooltips()
        set({ maskEditorImageId })
      },

      // Params
      params: { ...DEFAULT_PARAMS, ...getActiveApiProfile(DEFAULT_SETTINGS).paramDefaults },
      paramsByProfile: {},
      setParams: (p) => set((s) => ({ params: { ...s.params, ...p } })),
      reusedTaskApiProfileId: null,
      reusedTaskApiProfileName: null,
      reusedTaskApiProfileMissing: false,
      reusedTaskApiModel: null,
      setReusedTaskApiProfile: (profileId, missing = false, profileName = null, model = null) => set((state) => ({
        ...switchHomeParams(
          state.params,
          state.paramsByProfile,
          state.settings.profiles.find((profile) => profile.id === state.reusedTaskApiProfileId) ?? getActiveApiProfile(state.settings),
          state.settings.profiles.find((profile) => profile.id === profileId) ?? getActiveApiProfile(state.settings),
        ),
        reusedTaskApiProfileId: profileId,
        reusedTaskApiProfileName: profileName,
        reusedTaskApiProfileMissing: missing,
        reusedTaskApiModel: profileId ? model : null,
      })),
      setReusedTaskApiModel: (reusedTaskApiModel) => set({ reusedTaskApiModel }),
      batchProgress: null,
      setBatchProgress: (batchProgress) => set({ batchProgress }),

      // Tasks
      tasks: [],
      setTasks: (tasks) => set({ tasks }),
      favoriteCollections: [createDefaultFavoriteCollection()],
      setFavoriteCollections: (favoriteCollections) => set((state) => {
        const nextCollections = ensureDefaultFavoriteCollection(normalizeFavoriteCollections(favoriteCollections))
        return {
          favoriteCollections: nextCollections,
          defaultFavoriteCollectionId: resolveDefaultFavoriteCollectionId(nextCollections, state.defaultFavoriteCollectionId),
        }
      }),
      defaultFavoriteCollectionId: DEFAULT_FAVORITE_COLLECTION_ID,
      setDefaultFavoriteCollectionId: (defaultFavoriteCollectionId) => set((state) => (
        defaultFavoriteCollectionId === null || state.favoriteCollections.some((collection) => collection.id === defaultFavoriteCollectionId)
          ? { defaultFavoriteCollectionId }
          : state
      )),
      activeFavoriteCollectionId: null,
      isManageCollectionsModalOpen: false,
      setActiveFavoriteCollectionId: (activeFavoriteCollectionId) => set({ activeFavoriteCollectionId, selectionMode: false, selectedTaskIds: [], selectedFavoriteCollectionIds: [] }),
      openManageCollectionsModal: () => set({ isManageCollectionsModalOpen: true }),
      closeManageCollectionsModal: () => set({ isManageCollectionsModalOpen: false }),
      favoritePickerTaskIds: null,
      openFavoritePicker: (taskIds) => {
        if (!taskIds.length) return
        dismissAllTooltips()
        set({ favoritePickerTaskIds: Array.from(new Set(taskIds)).filter(Boolean) })
      },
      closeFavoritePicker: () => set({ favoritePickerTaskIds: null }),
      streamPreviews: {},
      streamPreviewSlots: {},
      setTaskStreamPreview: (taskId, image, requestIndex = 0) => set((s) => {
        if (image) {
          if (!s.tasks.some((task) => task.id === taskId)) return s
          const slotKey = String(requestIndex)
          const currentSlots = s.streamPreviewSlots[taskId] ?? {}
          if (s.streamPreviews[taskId] === image && currentSlots[slotKey] === image) return s
          return {
            streamPreviews: { ...s.streamPreviews, [taskId]: image },
            streamPreviewSlots: {
              ...s.streamPreviewSlots,
              [taskId]: { ...currentSlots, [slotKey]: image },
            },
          }
        }

        if (!(taskId in s.streamPreviews) && !(taskId in s.streamPreviewSlots)) return s
        const next = { ...s.streamPreviews }
        const nextSlots = { ...s.streamPreviewSlots }
        delete next[taskId]
        delete nextSlots[taskId]
        return { streamPreviews: next, streamPreviewSlots: nextSlots }
      }),

      // Search & Filter
      searchQuery: '',
      setSearchQuery: (searchQuery) => set({ searchQuery, selectedTaskIds: [], selectedFavoriteCollectionIds: [] }),
      filterStatus: 'all',
      setFilterStatus: (filterStatus) => set({ filterStatus, selectedTaskIds: [] }),
      filterFavorite: false,
      setFilterFavorite: (filterFavorite) => set(filterFavorite ? { filterFavorite, selectionMode: false, selectedTaskIds: [], selectedFavoriteCollectionIds: [] } : { filterFavorite, activeFavoriteCollectionId: null, selectionMode: false, selectedTaskIds: [], selectedFavoriteCollectionIds: [] }),

      // 多选状态仅保存在内存中，直到用户主动完成或退出。
      selectionMode: false,
      setSelectionMode: (selectionMode) => set(selectionMode ? { selectionMode } : { selectionMode, selectedTaskIds: [], selectedFavoriteCollectionIds: [] }),
      selectedTaskIds: [],
      setSelectedTaskIds: (updater) => set((s) => {
        const ids = typeof updater === 'function' ? updater(s.selectedTaskIds) : updater
        return { selectedTaskIds: ids, selectionMode: s.selectionMode || ids.length > 0 }
      }),
      toggleTaskSelection: (id, force) => set((s) => {
        const isSelected = s.selectedTaskIds.includes(id)
        const shouldSelect = force !== undefined ? force : !isSelected
        if (shouldSelect === isSelected) return s
        return {
          selectionMode: true,
          selectedTaskIds: shouldSelect
            ? [...s.selectedTaskIds, id]
            : s.selectedTaskIds.filter((x) => x !== id)
        }
      }),
      clearSelection: () => set({ selectedTaskIds: [] }),
      selectedFavoriteCollectionIds: [],
      setSelectedFavoriteCollectionIds: (updater) => set((s) => {
        const ids = typeof updater === 'function' ? updater(s.selectedFavoriteCollectionIds) : updater
        return { selectedFavoriteCollectionIds: ids, selectionMode: s.selectionMode || ids.length > 0 }
      }),
      toggleFavoriteCollectionSelection: (id, force) => set((s) => {
        const isSelected = s.selectedFavoriteCollectionIds.includes(id)
        const shouldSelect = force !== undefined ? force : !isSelected
        if (shouldSelect === isSelected) return s
        return {
          selectionMode: true,
          selectedFavoriteCollectionIds: shouldSelect
            ? [...s.selectedFavoriteCollectionIds, id]
            : s.selectedFavoriteCollectionIds.filter((x) => x !== id)
        }
      }),
      clearFavoriteCollectionSelection: () => set({ selectedFavoriteCollectionIds: [] }),

      // UI
      detailTaskId: null,
      setDetailTaskId: (detailTaskId) => {
        if (detailTaskId) dismissAllTooltips()
        set({ detailTaskId })
      },
      lightboxImageId: null,
      lightboxImageList: [],
      lightboxCommentPrompt: null,
      setLightboxImageId: (lightboxImageId, list, commentPrompt = null) => {
        if (lightboxImageId) dismissAllTooltips()
        set({
          lightboxImageId,
          lightboxImageList: list ?? (lightboxImageId ? [lightboxImageId] : []),
          lightboxCommentPrompt: lightboxImageId ? commentPrompt : null,
        })
      },
      sketchBoard: null,
      setSketchBoard: (sketchBoard) => {
        if (sketchBoard) dismissAllTooltips()
        set({ sketchBoard })
      },
      showSettings: false,
      settingsTabRequest: null,
      setShowSettings: (showSettings, settingsTabRequest) => {
        if (showSettings) dismissAllTooltips()
        set({
          showSettings,
          ...(settingsTabRequest ? { settingsTabRequest } : {}),
          ...(!showSettings ? { settingsTabRequest: null } : {}),
        })
      },

      // Toast
      toast: null,
      showToast: (message, type = 'info') => {
        const toastMessage = getToastMessage(message, type)
        const toast = { message: toastMessage, type }
        set({ toast })
        setTimeout(() => {
          set((s) => (s.toast === toast ? { toast: null } : s))
        }, 3000)
      },

      // Confirm
      confirmDialog: null,
      setConfirmDialog: (confirmDialog) => {
        if (confirmDialog) dismissAllTooltips()
        set({ confirmDialog })
      },
    }),
    {
      name: 'ai-image-studio',
      version: 4,
      // 旧版本直接丢弃，不映射旧字段。
      migrate: () => ({}),
      partialize: getPersistedState,
      merge: mergePersistedState,
    },
  ),
)

// ===== Actions =====

let uid = 0
function genId(): string {
  return Date.now().toString(36) + (++uid).toString(36) + Math.random().toString(36).slice(2, 6)
}

function isAsyncCustomConnectionTask(settings: AppSettings, connection: string, hasInputImages: boolean) {
  const customConnection = getCustomConnectionDefinition(settings, connection)
  if (!customConnection?.poll) return false
  const submitMapping = hasInputImages && customConnection.editSubmit ? customConnection.editSubmit : customConnection.submit
  return Boolean(submitMapping.taskIdPath)
}

function clearOpenAIWatchdogTimer(taskId: string) {
  const timer = openAIWatchdogTimers.get(taskId)
  if (timer) clearTimeout(timer)
  openAIWatchdogTimers.delete(taskId)
}

function failOpenAITaskIfStillRunning(taskId: string, error: string, now = Date.now()) {
  const task = useStore.getState().tasks.find((item) => item.id === taskId)
  if (!task || task.status !== 'running') return false

  updateTaskInStore(taskId, {
    ...createTaskErrorPatch(task, error, now),
    elapsed: Math.max(0, now - (task.startedAt ?? task.createdAt)),
  })
  showTaskFailureNotification(task)
  return true
}

function scheduleOpenAIWatchdog(taskId: string, timeoutSeconds: number, profile?: TimeoutStreamingHintProfile | null) {
  clearOpenAIWatchdogTimer(taskId)
  const task = useStore.getState().tasks.find((item) => item.id === taskId)
  if (!task || task.status !== 'running') return

  const timeoutMs = Math.max(0, timeoutSeconds * 1000)
  const remainingMs = Math.max(0, timeoutMs - (Date.now() - (task.startedAt ?? task.createdAt)))
  const timer = setTimeout(() => {
    openAIWatchdogTimers.delete(taskId)
    const failed = failOpenAITaskIfStillRunning(taskId, createOpenAITimeoutError(timeoutSeconds, profile))
    if (failed) useStore.getState().showToast('OpenAI 任务请求超时', 'error')
  }, remainingMs)
  openAIWatchdogTimers.set(taskId, timer)
}

function usesConcurrentImageRequests(settings: AppSettings, profile: ApiProfile, params: TaskParams, hasInputImages: boolean) {
  const n = params.n > 0 ? params.n : 1
  if (n <= 1) return false
  if (profile.connectionId === GEMINI_CONNECTION_ID) return true
  if (isOpenAIConnection(profile.connectionId)) {
    return profile.codexCli || profile.streamImages
  }
  return profile.codexCli && !isAsyncCustomConnectionTask(settings, profile.connectionId, hasInputImages)
}

export function taskHasOutputErrors(task: Pick<TaskRecord, 'outputErrors'>) {
  return Boolean(task.outputErrors?.length)
}

export function taskMatchesFilterStatus(task: TaskRecord, filterStatus: AppState['filterStatus']) {
  if (filterStatus === 'all') return true
  if (filterStatus === 'error') return task.status === 'error' || taskHasOutputErrors(task)
  return task.status === filterStatus
}

export function taskMatchesSearchQuery(task: TaskRecord, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const prompt = getTaskPromptText(task.prompt || '').toLowerCase()
  const paramStr = JSON.stringify(task.params).toLowerCase()
  const errorStr = [task.error, ...(task.outputErrors ?? []).map((item) => item.error)].filter(Boolean).join('\n').toLowerCase()
  return prompt.includes(q) || paramStr.includes(q) || errorStr.includes(q)
}

function getCustomRecoveryProfile(settings: AppSettings, task: TaskRecord) {
  const taskProfile = getTaskApiProfile(settings, task)
  if (taskProfile && taskProfile.connectionId === task.apiConnectionId && !isOpenAIConnection(taskProfile.connectionId)) return taskProfile
  return null
}

export function getTaskApiProfile(settings: AppSettings, task: TaskRecord): ApiProfile | null {
  const normalized = normalizeSettings(settings)
  if (!task.apiProfileId) return null
  const profile = normalized.profiles.find((item) => item.id === task.apiProfileId)
  // 任务记录的模型仍在配置的模型列表中时，沿用任务提交时的模型
  return profile ? resolveApiProfileModel(profile, task.apiModel) : null
}

function createSettingsForApiProfile(settings: AppSettings, profile: ApiProfile): AppSettings {
  const normalized = normalizeSettings(settings)
  return normalizeSettings({
    ...normalized,
    profiles: normalized.profiles.map((item) => item.id === profile.id ? profile : item),
    activeProfileId: profile.id,
  })
}

function getReusedTaskApiProfile(settings: AppSettings, profileId: string | null, model: string | null): ApiProfile | null {
  if (!profileId) return null
  const profile = normalizeSettings(settings).profiles.find((item) => item.id === profileId)
  return profile ? resolveApiProfileModel(profile, model ?? undefined) : null
}

function getTaskApiProfileName(task: TaskRecord) {
  return task.apiProfileName || task.apiModel || '未知配置'
}

function isNetworkRecoverableError(err: unknown) {
  if (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError') return true
  const message = err instanceof Error ? err.message : String(err)
  return /abort|network|failed to fetch|fetch failed|load failed|timeout|连接|断开|中断/i.test(message)
}

function isApiRequestNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) {
    const message = err.message.toLowerCase()
    return /failed to fetch|fetch failed|load failed|networkerror|network request failed/i.test(message)
  }
  return false
}

function getApiRequestNetworkErrorHint(
  err: unknown,
  createdAt: number,
  usesApiProxy: boolean,
  profile?: Pick<ApiProfile, 'connectionId' | 'streamImages' | 'streamPartialImages'> | null,
): string | null {
  if (!isApiRequestNetworkError(err)) return null

  const elapsedSeconds = Math.max(0, (Date.now() - createdAt) / 1000)

  if (elapsedSeconds <= 15) {
    if (usesApiProxy) {
      return '提示：请求立即失败，请检查 API 代理服务是否正常运行。'
    }
    const unsupportedApiHint = profile && isOpenAIConnection(profile.connectionId)
      ? '\n· API 不支持 Images API'
      : ''
    return `提示：请求立即失败，可能原因：\n· API 服务器不可达或地址有误，请检查 API URL 是否正确、服务是否正常运行${unsupportedApiHint}\n· 接口不支持浏览器跨域请求，可使用 Docker 部署版或本地运行版并配置 API 代理解决`
  }

  if (elapsedSeconds >= 55 && elapsedSeconds <= 75) {
    return `提示：请求等待约 60 秒后被断开，这通常是 Nginx 等反向代理的默认超时，而非接口本身报错。可调大代理的超时时间（如 proxy_read_timeout），或降低图片尺寸/质量后重试。${getTimeoutStreamingHint(profile)}`
  }

  if (elapsedSeconds >= 110 && elapsedSeconds <= 140) {
    return `提示：请求等待约 120 秒后被断开，这通常是 Cloudflare 等 CDN/网关的超时限制，而非接口本身报错。如果使用 Cloudflare，可考虑升级套餐或使用不经过 CDN 的直连地址。${getTimeoutStreamingHint(profile)}`
  }

  return `提示：请求等待较长时间后被断开，通常是反向代理或网关的超时限制，而非接口本身报错。可检查代理超时设置，或降低图片尺寸/质量后重试。${getTimeoutStreamingHint(profile)}`
}

function getRawErrorPayload(err: unknown): Pick<Partial<TaskRecord>, 'rawImageUrls' | 'rawResponsePayload'> {
  if (!(err instanceof Error)) return {}

  const rawImageUrls = 'rawImageUrls' in err ? (err as { rawImageUrls?: unknown }).rawImageUrls : undefined
  const rawResponsePayload = 'rawResponsePayload' in err ? (err as { rawResponsePayload?: unknown }).rawResponsePayload : undefined
  return {
    rawImageUrls: Array.isArray(rawImageUrls) && rawImageUrls.length ? rawImageUrls.filter((url): url is string => typeof url === 'string') : undefined,
    rawResponsePayload: typeof rawResponsePayload === 'string' ? rawResponsePayload : undefined,
  }
}

function clearCustomRecoveryTimer(taskId: string) {
  const timer = customRecoveryTimers.get(taskId)
  if (timer) clearTimeout(timer)
  customRecoveryTimers.delete(taskId)
}

function scheduleCustomRecovery(taskId: string, delayMs = CUSTOM_RECOVERY_POLL_MS) {
  if (customRecoveryTimers.has(taskId)) return
  if (!useStore.getState().tasks.some((task) => task.id === taskId)) return
  const timer = setTimeout(() => {
    customRecoveryTimers.delete(taskId)
    recoverCustomTask(taskId)
  }, delayMs)
  customRecoveryTimers.set(taskId, timer)
}

async function readImageSizeParam(dataUrl: string): Promise<Partial<TaskParams> | undefined> {
  if (typeof Image === 'undefined') return undefined

  return new Promise((resolve) => {
    let settled = false
    const image = new Image()
    const finish = (params: Partial<TaskParams> | undefined) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(params)
    }
    const timer = setTimeout(() => finish(undefined), 2000)
    image.onload = () => {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        finish({ size: `${image.naturalWidth}x${image.naturalHeight}` })
      } else {
        finish(undefined)
      }
    }
    image.onerror = () => finish(undefined)
    image.src = dataUrl
    if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
      finish({ size: `${image.naturalWidth}x${image.naturalHeight}` })
    }
  })
}

async function readImageSizeParamsList(images: string[]): Promise<Array<Partial<TaskParams> | undefined>> {
  return Promise.all(images.map((image) => readImageSizeParam(image)))
}

async function resolveImageSizeParamsList(
  images: string[],
  preferred?: Array<Partial<TaskParams> | undefined>,
  sizes?: Array<{ width?: number; height?: number } | undefined>,
): Promise<Array<Partial<TaskParams> | undefined>> {
  const withStoredSizes = images.map((_, index) => addImageSizeParam(preferred?.[index], sizes?.[index]))
  if (withStoredSizes.every(hasActualSizeParam)) {
    return withStoredSizes
  }
  const fallback = await readImageSizeParamsList(images)
  return images.map((_, index) => {
    const params = withStoredSizes[index]
    const fallbackParams = fallback[index]
    if (hasActualSizeParam(params)) return params
    if (fallbackParams?.size) return { ...(params ?? {}), size: fallbackParams.size }
    return hasActualParams(params) ? params : fallbackParams
  })
}

/** 初始化：从 IndexedDB 加载任务，按需恢复输入图片，并清理孤立图片 */
export async function initStore() {
  const storedTasks = await getAllTasks()
  const { tasks: markedTasks, interruptedTasks } = markInterruptedRunningTasks(storedTasks, Date.now())
  const interruptedTaskIds = new Set(interruptedTasks.map((task) => task.id))
  const favoriteState = useStore.getState()
  const normalizedFavorites = normalizeLoadedFavoriteState(markedTasks, favoriteState.favoriteCollections, favoriteState.defaultFavoriteCollectionId)
  const tasks = normalizedFavorites.tasks
  if (normalizedFavorites.collections !== favoriteState.favoriteCollections) {
    favoriteState.setFavoriteCollections(normalizedFavorites.collections)
  }
  if (normalizedFavorites.defaultFavoriteCollectionId !== favoriteState.defaultFavoriteCollectionId) {
    useStore.getState().setDefaultFavoriteCollectionId(normalizedFavorites.defaultFavoriteCollectionId)
  }
  await Promise.all(tasks
    .filter((task) => normalizedFavorites.changed || interruptedTaskIds.has(task.id))
    .map((task) => putTask(task)))
  useStore.getState().setTasks(tasks)
  for (const task of tasks) {
    if (
      task.customTaskId &&
      (task.status === 'running' || task.customRecoverable)
    ) {
      scheduleCustomRecovery(task.id, 0)
    }
  }

  const state = useStore.getState()
  const referencedIds = new Set(state.inputImages.map((img) => img.id))
  for (const task of tasks) addTaskReferencedImageIds(referencedIds, task)
  const imageIds = await getAllImageIds()
  const referencedImageIds: string[] = []
  for (const id of imageIds) {
    if (referencedIds.has(id)) referencedImageIds.push(id)
    else await deleteImage(id)
  }
  const imageSourceUrls = useStore.getState().imageSourceUrls
  if (Object.keys(imageSourceUrls).some((id) => !referencedIds.has(id))) {
    useStore.setState({ imageSourceUrls: Object.fromEntries(Object.entries(imageSourceUrls).filter(([id]) => referencedIds.has(id))) })
  }
  scheduleThumbnailBackfill(referencedImageIds)

  const images: InputImage[] = []
  for (const img of state.inputImages) {
    const dataUrl = img.dataUrl || (await getImage(img.id))?.dataUrl
    if (!dataUrl) continue
    images.push({ id: img.id, dataUrl })
    cacheImage(img.id, dataUrl)
  }
  useStore.setState(updateInputDraftImages(state, images))
}

export async function submitTask(options: { allowFullMask?: boolean; useCurrentApiProfileWhenReusedMissing?: boolean } = {}) {
  const state = useStore.getState()
  const { settings, prompt, inputImages, maskDraft, params, reusedTaskApiProfileId, reusedTaskApiProfileName, reusedTaskApiProfileMissing, reusedTaskApiModel, showToast, setConfirmDialog } = state

  const normalizedSettings = normalizeSettings(settings)
  let activeProfile = getActiveApiProfile(settings)
  let requestSettings = createSettingsForApiProfile(normalizedSettings, activeProfile)
  if (normalizedSettings.reuseTaskApiProfileTemporarily && (reusedTaskApiProfileId || reusedTaskApiProfileMissing)) {
    const reusedProfile = getReusedTaskApiProfile(normalizedSettings, reusedTaskApiProfileId, reusedTaskApiModel)
    if (!reusedProfile) {
      if (options.useCurrentApiProfileWhenReusedMissing) {
        useStore.getState().setReusedTaskApiProfile(null)
      } else {
        setConfirmDialog({
          title: '找不到 API 配置',
      message: `找不到复用任务所使用的 API 配置「${reusedTaskApiProfileName || '未知配置'}」，要使用当前的 API 配置「${activeProfile.name}」提交任务吗？`,
      confirmText: '使用当前配置提交',
      cancelText: '放弃提交',
      action: () => {
        void submitTask({ ...options, useCurrentApiProfileWhenReusedMissing: true })
      },
        })
        return
      }
    } else {
      activeProfile = reusedProfile
      requestSettings = createSettingsForApiProfile(normalizedSettings, reusedProfile)
    }
  }

  if (validateApiProfile(activeProfile, requestSettings)) {
    showToast(`请先完善请求 API 配置：${validateApiProfile(activeProfile, requestSettings)}`, 'error')
    useStore.getState().setShowSettings(true)
    return
  }

  if (!prompt.trim()) {
    showToast('请输入提示词', 'error')
    return
  }

  const batchPrompts = normalizedSettings.showBatchPrompt && normalizedSettings.batchPromptEnabled ? splitBatchPrompts(prompt) : []
  if (useStore.getState().batchProgress) {
    showToast('批量任务进行中，请等待完成或停止后再提交', 'error')
    return
  }
  // 检查通过后立即占位，避免后续 await 期间重复提交启动第二批
  const batchId = batchPrompts.length ? beginBatch(batchPrompts.length) : 0

  let orderedInputImages = inputImages
  let maskImageId: string | null = null
  let maskTargetImageId: string | null = null

  if (maskDraft) {
    try {
      orderedInputImages = orderInputImagesForMask(inputImages, maskDraft.targetImageId)
      const coverage = await validateMaskMatchesImage(maskDraft.maskDataUrl, orderedInputImages[0].dataUrl)
      if (coverage === 'full' && !options.allowFullMask) {
        setConfirmDialog({
          title: '确认编辑整张图片？',
          message: '当前遮罩覆盖了整张图片，提交后可能会重绘全部内容。是否继续？',
          confirmText: '继续提交',
          tone: 'warning',
          action: () => {
            void submitTask({ allowFullMask: true })
          },
        })
        endBatch(batchId)
        return
      }
      maskImageId = await storeImage(maskDraft.maskDataUrl, 'mask')
      cacheImage(maskImageId, maskDraft.maskDataUrl)
      maskTargetImageId = maskDraft.targetImageId
    } catch (err) {
      if (!inputImages.some((img) => img.id === maskDraft.targetImageId)) {
        useStore.getState().clearMaskDraft()
      }
      showToast(err instanceof Error ? err.message : String(err), 'error')
      endBatch(batchId)
      return
    }
  }

  // 持久化输入图片到 IndexedDB（此前只在内存缓存中）
  try {
    for (const img of orderedInputImages) {
      await storeImage(img.dataUrl)
    }
  } catch (err) {
    console.error('保存参考图失败', err)
    endBatch(batchId)
    showToast(`保存参考图失败：${err instanceof Error ? err.message : String(err)}`, 'error')
    return
  }

  const normalizedParams = normalizeParamsForSettings(normalizeHomeParams(params, activeProfile, getCustomConnectionDefinition(requestSettings, activeProfile.connectionId), orderedInputImages.length > 0), requestSettings)
  const shouldUseTransparentOutput = (normalizedParams.output_format === 'default' || normalizedParams.output_format === 'png' || normalizedParams.output_format === 'webp') && normalizedParams.transparent_output
  const taskParams = shouldUseTransparentOutput
    ? getTransparentRequestParams(normalizedParams)
    : { ...normalizedParams, transparent_output: false }
  const normalizedParamPatch = getChangedParams(params, taskParams)
  if (Object.keys(normalizedParamPatch).length) {
    useStore.getState().setParams(normalizedParamPatch)
  }

  const startTask = async (taskPrompt: string) => {
    // 按点击提交时所在的收藏夹页决定；排队期间该收藏夹被删除时改用默认收藏夹
    const favoritePatch = normalizedSettings.saveTasksToActiveFavoriteCollection
      ? getNewTaskFavoritePatch({
        filterFavorite: state.filterFavorite,
        activeFavoriteCollectionId: state.activeFavoriteCollectionId,
        favoriteCollections: useStore.getState().favoriteCollections,
        defaultFavoriteCollectionId: useStore.getState().defaultFavoriteCollectionId,
      })
      : null
    const transparentMeta = taskParams.transparent_output && activeProfile.transparentBackgroundMethod === 'local'
      ? createTransparentOutputMeta(taskPrompt)
      : null
    const task: TaskRecord = {
      id: genId(),
      prompt: taskPrompt,
      params: taskParams,
      apiConnectionId: activeProfile.connectionId,
      apiProfileId: activeProfile.id,
      apiProfileName: activeProfile.name,
      apiModel: activeProfile.model,
      inputImageIds: orderedInputImages.map((i) => i.id),
      maskTargetImageId,
      maskImageId,
      transparentOutput: transparentMeta?.transparentOutput,
      transparentPrompt: transparentMeta?.effectivePrompt,
      outputImages: [],
      status: 'running',
      error: null,
      createdAt: Date.now(),
      finishedAt: null,
      elapsed: null,
      ...favoritePatch,
    }

    useStore.getState().setTasks([task, ...useStore.getState().tasks])
    await putTask(task)
    if (batchId) batchTaskIds.add(task.id)
    // 异步调用 API
    executeTask(task.id)
    return task.id
  }

  if (batchPrompts.length) {
    useStore.getState().showToast(`已开始批量提交 ${batchPrompts.length} 条提示词`, 'success')
  } else {
    await startTask(prompt.trim())
    useStore.getState().showToast('任务已提交', 'success')
  }

  if (settings.clearInputAfterSubmit) {
    useStore.getState().setPrompt('')
    useStore.getState().clearInputImages()
  }
  useStore.getState().setReusedTaskApiProfile(null)

  if (batchPrompts.length) {
    const limit = normalizedSettings.batchPromptMode === 'queue'
      ? 1
      : normalizedSettings.batchPromptConcurrencyLimited ? normalizedSettings.batchPromptConcurrency : batchPrompts.length
    await runBatchPrompts(batchId, batchPrompts, limit, startTask)
  }
}

// 当前批量的标识，停止或结束时递增使旧批量失效；批量任务不单独弹出完成提示和失败详情
let activeBatchId = 0
const batchTaskIds = new Set<string>()

function beginBatch(total: number) {
  activeBatchId += 1
  useStore.getState().setBatchProgress({ total, started: 0, finished: 0 })
  return activeBatchId
}

function endBatch(batchId: number) {
  if (!batchId || batchId !== activeBatchId) return
  activeBatchId += 1
  // 停止后仍在运行的任务恢复单独的完成提示和失败详情
  batchTaskIds.clear()
  useStore.getState().setBatchProgress(null)
}

/** 等待任务结束（完成、失败或被删除）或批量被停止；断线待恢复的任务也视为结束，避免卡住队列 */
function waitForTaskSettled(taskId: string, isCancelled: () => boolean) {
  const isSettled = (tasks: TaskRecord[]) => isCancelled() || tasks.find((item) => item.id === taskId)?.status !== 'running'
  return new Promise<void>((resolve) => {
    if (isSettled(useStore.getState().tasks)) {
      resolve()
      return
    }
    const unsubscribe = useStore.subscribe((state) => {
      if (!isSettled(state.tasks)) return
      unsubscribe()
      resolve()
    })
  })
}

async function runBatchPrompts(batchId: number, prompts: string[], limit: number, startTask: (taskPrompt: string) => Promise<string>) {
  const isStopped = () => batchId !== activeBatchId
  const total = prompts.length
  let started = 0
  let finished = 0
  let failed = 0
  await runWithConcurrency(prompts, limit, async (taskPrompt) => {
    started += 1
    useStore.getState().setBatchProgress({ total, started, finished })
    try {
      const taskId = await startTask(taskPrompt)
      await waitForTaskSettled(taskId, isStopped)
      if (useStore.getState().tasks.find((item) => item.id === taskId)?.status === 'error') failed += 1
    } catch (err) {
      failed += 1
      console.error('批量提交任务失败', err)
    }
    finished += 1
    if (!isStopped()) useStore.getState().setBatchProgress({ total, started, finished })
  }, isStopped)
  if (isStopped()) return

  endBatch(batchId)
  const message = failed > 0 ? `批量生成完成：成功 ${total - failed} 条，失败 ${failed} 条` : `批量生成完成，共 ${total} 条`
  useStore.getState().showToast(message, failed > 0 ? 'error' : 'success')
  showTaskCompletionNotification('批量生成完成', `${message}。`)
}

/** 停止批量提交：立即结束批量状态，不再启动剩余提示词，已开始的任务继续执行 */
export function stopBatchPrompts() {
  const progress = useStore.getState().batchProgress
  if (!progress) return
  endBatch(activeBatchId)
  useStore.getState().showToast(`已停止批量提交，共提交 ${progress.started} / ${progress.total} 条，已开始的任务会继续完成`, 'info')
}

function addTaskReferencedImageIds(target: Set<string>, task: TaskRecord) {
  for (const id of task.inputImageIds || []) target.add(id)
  if (task.maskImageId) target.add(task.maskImageId)
  for (const id of task.outputImages || []) target.add(id)
  for (const id of task.transparentOriginalImages || []) {
    if (id) target.add(id)
  }
  for (const id of task.streamPartialImageIds || []) target.add(id)
}

async function storeTaskOutputImages(task: TaskRecord, images: string[]) {
  const outputIds: string[] = []
  const outputDataUrls: string[] = []
  const outputImageSizes: Array<{ width?: number; height?: number }> = []
  const transparentOriginalImageIds: string[] = []
  const storedImageIds: string[] = []

  try {
    for (const dataUrl of images) {
      let outputDataUrl = dataUrl
      if (task.transparentOutput) {
        const original = await storeImageWithSize(dataUrl, 'generated')
        storedImageIds.push(original.id)
        cacheImage(original.id, dataUrl)

        try {
          outputDataUrl = task.params.output_format === 'webp'
            ? await removeKeyedBackgroundFromDataUrl(dataUrl, undefined, 'webp', task.params.output_compression)
            : await removeKeyedBackgroundFromDataUrl(dataUrl)
          transparentOriginalImageIds.push(original.id)
        } catch (err) {
          console.warn('透明背景后处理失败，已回退为原始输出', err)
          outputIds.push(original.id)
          outputDataUrls.push(dataUrl)
          outputImageSizes.push(original)
          transparentOriginalImageIds.push('')
          continue
        }
      }

      const stored = await storeImageWithSize(outputDataUrl, 'generated')
      storedImageIds.push(stored.id)
      cacheImage(stored.id, outputDataUrl)
      outputIds.push(stored.id)
      outputDataUrls.push(outputDataUrl)
      outputImageSizes.push(stored)
    }

    return {
      outputIds,
      outputDataUrls,
      outputImageSizes,
      transparentOriginalImageIds: transparentOriginalImageIds.length ? transparentOriginalImageIds : undefined,
    }
  } catch (err) {
    await deleteUnreferencedImageIds(storedImageIds)
    throw err
  }
}

async function deleteUnreferencedImageIds(imageIds: Iterable<string>) {
  const candidates = Array.from(new Set(Array.from(imageIds).filter(Boolean)))
  if (candidates.length === 0) return

  const { tasks, inputImages } = useStore.getState()
  const stillUsed = new Set<string>()
  for (const task of tasks) addTaskReferencedImageIds(stillUsed, task)
  for (const img of inputImages) stillUsed.add(img.id)

  for (const imgId of candidates) {
    if (stillUsed.has(imgId)) continue
    await deleteStoredImageIfUnreferenced(imgId)
  }
}

async function persistTaskStreamPartialImage(taskId: string, dataUrl: string, execution?: symbol) {
  try {
    const imgId = await storeImage(dataUrl, 'generated')
    cacheImage(imgId, dataUrl)

    const latestTask = useStore.getState().tasks.find((task) => task.id === taskId)
    if (!latestTask || latestTask.status === 'done' || (execution && taskExecutions.get(taskId) !== execution)) {
      await deleteUnreferencedImageIds([imgId])
      return
    }

    const currentIds = latestTask.streamPartialImageIds || []
    if (currentIds.includes(imgId)) return
    updateTaskInStore(taskId, { streamPartialImageIds: [...currentIds, imgId] })
  } catch (err) {
    console.error(err)
  }
}

async function executeTask(taskId: string) {
  const { settings } = useStore.getState()
  const task = useStore.getState().tasks.find((t) => t.id === taskId)
  if (!task) return
  const execution = Symbol(taskId)
  taskExecutions.set(taskId, execution)
  const taskProfile = getTaskApiProfile(settings, task)
  if (!taskProfile && task.apiProfileId) {
    updateTaskInStore(taskId, {
      ...createTaskErrorPatch(task, '找不到此任务所使用的 API 配置。', Date.now()),
      customRecoverable: false,
    })
    showTaskFailureNotification(task)
    taskExecutions.delete(taskId)
    return
  }
  const activeProfile = taskProfile ?? getActiveApiProfile(settings)
  const requestSettings = createSettingsForApiProfile(settings, activeProfile)
  const taskConnection = taskProfile?.connectionId ?? task.apiConnectionId ?? activeProfile.connectionId
  let customTaskInfo: { taskId: string } | null = task.customTaskId
    ? { taskId: task.customTaskId }
    : null

  if (
    !isAsyncCustomConnectionTask(requestSettings, taskConnection, task.inputImageIds.length > 0) &&
    !usesConcurrentImageRequests(requestSettings, activeProfile, task.params, task.inputImageIds.length > 0)
  ) {
    scheduleOpenAIWatchdog(taskId, activeProfile.timeout, activeProfile)
  }

  try {
    // 获取输入图片 data URLs
    const inputDataUrls: string[] = []
    for (const imgId of task.inputImageIds) {
      const dataUrl = await ensureImageCached(imgId)
      if (!dataUrl) throw new Error('输入图片已不存在')
      inputDataUrls.push(dataUrl)
    }
    let maskDataUrl: string | undefined
    if (task.maskImageId) {
      maskDataUrl = await ensureImageCached(task.maskImageId)
      if (!maskDataUrl) throw new Error('遮罩图片已不存在')
    }

    const requestPrompt = task.transparentOutput && task.transparentPrompt
      ? task.transparentPrompt
      : task.prompt

    const result = await callImageApi({
      settings: requestSettings,
      prompt: getTaskPromptText(requestPrompt),
      params: task.params,
      inputImageDataUrls: inputDataUrls,
      inputImageUrls: task.inputImageIds.map((id) => useStore.getState().imageSourceUrls[id] ?? null),
      maskDataUrl,
      onCustomTaskEnqueued: (request) => {
        if (taskExecutions.get(taskId) !== execution) return
        customTaskInfo = request
        updateTaskInStore(taskId, {
          customTaskId: request.taskId,
          customRecoverable: false,
        })
      },
      onPartialImage: (partial) => {
        if (taskExecutions.get(taskId) !== execution) return
        useStore.getState().setTaskStreamPreview(taskId, partial.image, partial.requestIndex)
        void persistTaskStreamPartialImage(taskId, partial.image, execution)
      },
    })

    const latestBeforeSuccess = useStore.getState().tasks.find((t) => t.id === taskId)
    if (taskExecutions.get(taskId) !== execution) return
    if (!latestBeforeSuccess || latestBeforeSuccess.status !== 'running') {
      useStore.getState().setTaskStreamPreview(taskId)
      return
    }

    // 存储输出图片
    const { outputIds, outputDataUrls, outputImageSizes, transparentOriginalImageIds } = await storeTaskOutputImages(task, result.images)
    const isAsyncCustomTask = !isOpenAIConnection(taskConnection) && Boolean(customTaskInfo)
    const actualParamsList = await resolveImageSizeParamsList(
      outputDataUrls,
      isAsyncCustomTask ? undefined : result.actualParamsList,
      outputImageSizes,
    )
    const actualParams = deriveGalleryActualParams(isAsyncCustomTask, result.actualParams, actualParamsList, outputIds.length)
    const shouldStoreRevisedPrompts = !isAsyncCustomTask
    const actualParamsByImage = mapActualParamsByImage(outputIds, actualParamsList)
    const revisedPrompts = activeProfile.codexCli
      ? result.revisedPrompts?.map((prompt) => prompt == null ? prompt : stripInjectedCodexCliSizePrompt(prompt, requestPrompt, task.params.size))
      : result.revisedPrompts
    const revisedPromptByImage = shouldStoreRevisedPrompts ? mapRevisedPromptsByImage(outputIds, revisedPrompts) : undefined

    // 更新任务
    const latestBeforeUpdate = useStore.getState().tasks.find((t) => t.id === taskId)
    if (taskExecutions.get(taskId) !== execution || !latestBeforeUpdate || latestBeforeUpdate.status !== 'running') {
      if (taskExecutions.get(taskId) === execution) useStore.getState().setTaskStreamPreview(taskId)
      await deleteUnreferencedImageIds([...outputIds, ...(transparentOriginalImageIds ?? [])])
      return
    }
    const partialImageIdsToClean = latestBeforeUpdate.streamPartialImageIds || []
    clearOpenAIWatchdogTimer(taskId)
    useStore.getState().setTaskStreamPreview(taskId)
    updateTaskInStore(taskId, {
      outputImages: outputIds,
      transparentOriginalImages: transparentOriginalImageIds,
      outputErrors: result.failedRequests?.length ? result.failedRequests : undefined,
      streamPartialImageIds: undefined,
      rawImageUrls: result.rawImageUrls?.length ? result.rawImageUrls : undefined,
      actualParams,
      actualParamsByImage,
      revisedPromptByImage,
      ...createTaskDonePatch(task, Date.now()),
      customRecoverable: false,
    })
    void deleteUnreferencedImageIds(partialImageIdsToClean)

    const failedCount = result.failedRequests?.length ?? 0
    const completionMessage = failedCount > 0
      ? `生成完成：成功 ${outputIds.length} 张，失败 ${failedCount} 张`
      : `生成完成，共 ${outputIds.length} 张图片`
    // 批量任务只在整批结束时统一提示
    if (!batchTaskIds.has(taskId)) {
      useStore.getState().showToast(completionMessage, failedCount > 0 ? 'error' : 'success')
    showTaskCompletionNotification('图像生成完成', `${completionMessage}。`)
    }
    const currentMask = useStore.getState().maskDraft
    if (
      maskDataUrl &&
      currentMask &&
      currentMask.targetImageId === task.maskTargetImageId &&
      currentMask.maskDataUrl === maskDataUrl
    ) {
      useStore.getState().clearMaskDraft()
    }
  } catch (err) {
    if (taskExecutions.get(taskId) !== execution) return
    clearOpenAIWatchdogTimer(taskId)
    const latestTask = useStore.getState().tasks.find((t) => t.id === taskId)
    if (!latestTask || latestTask.status !== 'running') return
    useStore.getState().setTaskStreamPreview(taskId)
    const latestCustomTaskInfo = customTaskInfo ?? (latestTask.customTaskId ? { taskId: latestTask.customTaskId } : null)
    if (latestCustomTaskInfo && isNetworkRecoverableError(err)) {
      updateTaskInStore(taskId, {
        ...createTaskErrorPatch(task, '与自定义异步任务的连接已断开，之后会继续查询任务结果。', Date.now()),
        customTaskId: latestCustomTaskInfo.taskId,
        customRecoverable: true,
      })
      scheduleCustomRecovery(taskId)
    } else {
      let errorMessage = err instanceof Error ? err.message : String(err)
      const settings = useStore.getState().settings
      const profile = getTaskApiProfile(settings, latestTask)
      const activeProfile = getActiveApiProfile(settings)
      const usesApiProxy = profile?.apiProxy ?? activeProfile.apiProxy
      const hintProfile = profile ?? {
        connectionId: latestTask.apiConnectionId ?? activeProfile.connectionId,
        streamImages: activeProfile.streamImages,
        streamPartialImages: activeProfile.streamPartialImages,
      }
      const networkErrorHint = getApiRequestNetworkErrorHint(err, latestTask.startedAt ?? latestTask.createdAt, usesApiProxy, hintProfile)
      if (networkErrorHint && !errorMessage.includes(IMAGE_FETCH_CORS_HINT)) {
        errorMessage += `\n${networkErrorHint}`
      }
      updateTaskInStore(taskId, {
        ...createTaskErrorPatch(task, errorMessage, Date.now()),
        ...getRawErrorPayload(err),
        customRecoverable: false,
      })
      showTaskFailureNotification(latestTask)
      // 批量任务不自动打开失败详情，避免连续弹窗打断
      if (!batchTaskIds.has(taskId)) useStore.getState().setDetailTaskId(taskId)
    }
  } finally {
    if (taskExecutions.get(taskId) === execution) taskExecutions.delete(taskId)
    // 释放输入图片的内存缓存（已持久化到 IndexedDB，后续按需从 DB 加载）
    if (!taskExecutions.has(taskId)) {
      for (const imgId of task.inputImageIds) deleteCachedImage(imgId)
    }
  }
}

export function updateTaskInStore(taskId: string, patch: Partial<TaskRecord>) {
  const { tasks, setTasks, defaultFavoriteCollectionId } = useStore.getState()
  const updated = tasks.map((t) =>
    t.id === taskId ? { ...t, ...normalizeFavoritePatch(t, patch, defaultFavoriteCollectionId) } : t,
  )
  const task = updated.find((t) => t.id === taskId)
  setTasks(updated)
  if (task) putTask(task)
}

export function createFavoriteCollection(name: string) {
  const normalizedName = normalizeFavoriteCollectionName(name)
  if (!normalizedName) return null
  if (Array.from(normalizedName).length > 60) {
    useStore.getState().showToast('收藏夹名称最多 60 个字符', 'error')
    return null
  }
  const state = useStore.getState()
  const existing = state.favoriteCollections.find((collection) => collection.name === normalizedName)
  if (existing) return existing
  const now = Date.now()
  const collection: FavoriteCollection = { id: genId(), name: normalizedName, createdAt: now, updatedAt: now }
  state.setFavoriteCollections([...state.favoriteCollections, collection])
  state.showToast(`已创建收藏夹「${normalizedName}」`, 'success')
  return collection
}

export function renameFavoriteCollection(collectionId: string, name: string) {
  const normalizedName = normalizeFavoriteCollectionName(name)
  if (!normalizedName || collectionId === ALL_FAVORITES_COLLECTION_ID) return
  if (Array.from(normalizedName).length > 60) {
    useStore.getState().showToast('收藏夹名称最多 60 个字符', 'error')
    return
  }
  const { favoriteCollections, setFavoriteCollections, showToast } = useStore.getState()
  setFavoriteCollections(favoriteCollections.map((collection) =>
    collection.id === collectionId ? { ...collection, name: normalizedName, updatedAt: Date.now() } : collection,
  ))
  showToast('收藏夹名称已更新', 'success')
}

export async function updateTasksFavoriteCollections(taskIds: string[], collectionIds: string[]) {
  const ids = normalizeFavoriteCollectionIds(collectionIds)
  const uniqueTaskIds = Array.from(new Set(taskIds)).filter(Boolean)
  if (!uniqueTaskIds.length) return
  const { tasks, setTasks, clearSelection, showToast, defaultFavoriteCollectionId } = useStore.getState()
  const idSet = new Set(uniqueTaskIds)
  const changedTaskIds = new Set<string>()
  const updated = tasks.map((task) => {
    if (!idSet.has(task.id)) return task
    if (sameFavoriteCollectionIds(getTaskFavoriteCollectionIds(task, defaultFavoriteCollectionId), ids)) return task
    changedTaskIds.add(task.id)
    return { ...task, favoriteCollectionIds: ids, isFavorite: ids.length > 0 }
  })
  if (!changedTaskIds.size) {
    clearSelection()
    return
  }
  setTasks(updated)
  await Promise.all(updated.filter((task) => changedTaskIds.has(task.id)).map((task) => putTask(task)))
  clearSelection()
  showToast(ids.length ? '收藏夹已更新' : '已取消收藏', 'success')
}

export async function deleteFavoriteCollection(collectionId: string, deleteTasks = false) {
  const state = useStore.getState()
  const collection = state.favoriteCollections.find((item) => item.id === collectionId)
  const result = deleteFavoriteCollectionState({
    collections: state.favoriteCollections,
    defaultFavoriteCollectionId: state.defaultFavoriteCollectionId,
    activeFavoriteCollectionId: state.activeFavoriteCollectionId,
    selectedFavoriteCollectionIds: state.selectedFavoriteCollectionIds,
    selectedTaskIds: state.selectedTaskIds,
    tasks: state.tasks,
    collectionId,
    deleteTasks,
  })
  if (!collection || !result) return

  useStore.setState({
    favoriteCollections: result.collections,
    defaultFavoriteCollectionId: result.defaultFavoriteCollectionId,
    activeFavoriteCollectionId: result.activeFavoriteCollectionId,
    selectedFavoriteCollectionIds: result.selectedFavoriteCollectionIds,
    selectedTaskIds: result.selectedTaskIds,
  })
  if (result.updatedTasks.length) {
    const patches = new Map(result.updatedTasks.map((task) => [task.id, task]))
    const updated = useStore.getState().tasks.map((task) => {
      const patch = patches.get(task.id)
      return patch ? { ...task, favoriteCollectionIds: patch.favoriteCollectionIds, isFavorite: patch.isFavorite } : task
    })
    useStore.getState().setTasks(updated)
    await Promise.all(updated.filter((task) => patches.has(task.id)).map((task) => putTask(task)))
  }
  if (result.taskIdsToDelete.length) await removeMultipleTasks(result.taskIdsToDelete)
  useStore.getState().showToast(`已删除收藏夹「${collection.name}」`, 'success')
}

/** 按重试方式新建任务或覆盖原任务 */
export async function retryTask(task: TaskRecord) {
  const state = useStore.getState()
  const { settings, tasks } = state
  const source = tasks.find((item) => item.id === task.id)
  if (!source || source.status === 'running' || source.customRecoverable) return
  const activeProfile = getActiveApiProfile(settings)
  const normalizedParams = normalizeParamsForSettings(source.params, settings)
  const shouldUseTransparentOutput = (normalizedParams.output_format === 'default' || normalizedParams.output_format === 'png' || normalizedParams.output_format === 'webp') && normalizedParams.transparent_output
  const taskParams = shouldUseTransparentOutput
    ? getTransparentRequestParams(normalizedParams)
    : { ...normalizedParams, transparent_output: false }
  const transparentMeta = taskParams.transparent_output && activeProfile.transparentBackgroundMethod === 'local'
    ? createTransparentOutputMeta(source.prompt.trim())
    : null
  const overwrite = (
    settings.retryMode === 'overwriteAll' || (settings.retryMode === 'overwriteFailed' && source.status === 'error')
  )
  const taskId = overwrite ? source.id : genId()
  const startedAt = Date.now()
  const favoritePatch = !overwrite && settings.saveTasksToActiveFavoriteCollection
    ? getNewTaskFavoritePatch(state, getTaskFavoriteCollectionIds(source, state.defaultFavoriteCollectionId))
    : null
  const newTask: TaskRecord = {
    ...(overwrite ? source : {}),
    ...favoritePatch,
    id: taskId,
    prompt: source.prompt,
    params: taskParams,
    apiConnectionId: activeProfile.connectionId,
    apiProfileId: activeProfile.id,
    apiProfileName: activeProfile.name,
    apiModel: activeProfile.model,
    inputImageIds: [...source.inputImageIds],
    maskTargetImageId: source.maskTargetImageId ?? null,
    maskImageId: source.maskImageId ?? null,
    transparentOutput: transparentMeta?.transparentOutput,
    transparentPrompt: transparentMeta?.effectivePrompt,
    outputImages: [],
    outputErrors: undefined,
    transparentOriginalImages: undefined,
    actualParams: undefined,
    actualParamsByImage: undefined,
    revisedPromptByImage: undefined,
    rawImageUrls: undefined,
    rawResponsePayload: undefined,
    streamPartialImageIds: undefined,
    customTaskId: undefined,
    customRecoverable: false,
    status: 'running',
    error: null,
    createdAt: overwrite ? source.createdAt : startedAt,
    startedAt,
    finishedAt: null,
    elapsed: null,
  }

  if (overwrite) {
    taskExecutions.delete(taskId)
    // 覆盖后不再属于原批量，完成时应正常提示
    batchTaskIds.delete(taskId)
    clearOpenAIWatchdogTimer(taskId)
    clearCustomRecoveryTimer(taskId)
    useStore.getState().setTaskStreamPreview(taskId)
  }
  useStore.getState().setTasks(overwrite
    ? tasks.map((item) => item.id === taskId ? newTask : item)
    : [newTask, ...tasks])
  await putTask(newTask)
  if (overwrite) {
    void deleteUnreferencedImageIds([
      ...source.outputImages,
      ...(source.transparentOriginalImages ?? []),
      ...(source.streamPartialImageIds ?? []),
    ])
  }

  executeTask(taskId)
}

/** 复用配置 */
export async function reuseConfig(task: TaskRecord) {
  const { settings, setPrompt, setParams, setInputImages, setMaskDraft, clearMaskDraft, showToast, setConfirmDialog, setReusedTaskApiProfile } = useStore.getState()
  const normalizedSettings = normalizeSettings(settings)
  const currentProfile = getActiveApiProfile(settings)
  const taskProfile = normalizedSettings.reuseTaskApiProfileTemporarily ? getTaskApiProfile(normalizedSettings, task) : null
  const matchedProfile = taskProfile && (!isPresetConfigOnlyEnabled() || isPresetProfile(taskProfile.id)) ? taskProfile : null
  const shouldTemporarilyReuseProfile = Boolean(matchedProfile && matchedProfile.id !== currentProfile.id)
  const missingReusedProfile = normalizedSettings.reuseTaskApiProfileTemporarily && !matchedProfile
  const taskProfileName = matchedProfile?.name ?? getTaskApiProfileName(task)
  // 复用当前配置时，任务所用模型仍在模型列表中则同步切换首页选中的模型；临时复用其他配置时模型只随复用状态生效
  const currentProfileRecord = normalizedSettings.profiles.find((item) => item.id === currentProfile.id)
  if (!shouldTemporarilyReuseProfile && task.apiModel && currentProfileRecord && currentProfileRecord.selectedModel !== task.apiModel && splitModelList(currentProfileRecord.model).includes(task.apiModel)) {
    useStore.getState().setSettings({
      profiles: normalizedSettings.profiles.map((item) => item.id === currentProfile.id ? { ...item, selectedModel: task.apiModel } : item),
    })
  }
  const reuseSettings = normalizeSettings(useStore.getState().settings)
  const paramsSettings = shouldTemporarilyReuseProfile && matchedProfile ? createSettingsForApiProfile(reuseSettings, matchedProfile) : reuseSettings

  setReusedTaskApiProfile(
    shouldTemporarilyReuseProfile && matchedProfile ? matchedProfile.id : null,
    missingReusedProfile,
    taskProfileName,
    shouldTemporarilyReuseProfile && matchedProfile ? matchedProfile.model : null,
  )
  setParams(normalizeParamsForSettings(task.params, paramsSettings))
  clearMaskDraft()

  // 恢复输入图片
  const imgs: InputImage[] = []
  for (const imgId of task.inputImageIds) {
    const dataUrl = await ensureImageCached(imgId)
    if (dataUrl) {
      imgs.push({ id: imgId, dataUrl })
    }
  }
  setInputImages(imgs)
  // 部分参考图可能已被删除，按图片 id 重新对齐评论，避免错位到其他图片
  setPrompt(remapImageCommentsForOrder(task.prompt, task.inputImageIds.map((id) => ({ id, dataUrl: '' })), useStore.getState().inputImages))
  const maskTargetImageId = task.maskTargetImageId ?? (task.maskImageId ? task.inputImageIds[0] : null)
  if (maskTargetImageId && task.maskImageId && imgs.some((img) => img.id === maskTargetImageId)) {
    const maskDataUrl = await ensureImageCached(task.maskImageId)
    if (maskDataUrl) {
      setMaskDraft({
        targetImageId: maskTargetImageId,
        maskDataUrl,
        updatedAt: Date.now(),
      })
    } else {
      clearMaskDraft()
    }
  } else {
    clearMaskDraft()
  }
  if (missingReusedProfile) {
    setConfirmDialog({
      title: '找不到 API 配置',
      message: `找不到复用任务所使用的 API 配置「${taskProfileName}」，要使用当前的 API 配置「${currentProfile.name}」提交任务吗？`,
      confirmText: '使用当前配置提交',
      cancelText: '放弃提交',
      action: () => {
        void submitTask({ useCurrentApiProfileWhenReusedMissing: true })
      },
    })
    return
  }

  showToast(
    shouldTemporarilyReuseProfile && matchedProfile
      ? `已临时复用该任务的 API 配置「${matchedProfile.name}」`
      : '已复用配置到输入框',
    'success',
  )
}

/** 编辑输出：将输出图加入输入 */
export async function editOutputs(task: TaskRecord) {
  const { inputImages, addInputImage, showToast } = useStore.getState()
  if (!task.outputImages?.length) return

  let added = 0
  for (const imgId of task.outputImages) {
    if (inputImages.find((i) => i.id === imgId)) continue
    const dataUrl = await ensureImageCached(imgId)
    if (dataUrl) {
      addInputImage({ id: imgId, dataUrl })
      added++
    }
  }
  showToast(`已添加 ${added} 张输出图到输入`, 'success')
}

async function removeTasks(taskIds: string[]) {
  const toDelete = new Set(taskIds)
  const deletedTasks = useStore.getState().tasks.filter((task) => toDelete.has(task.id))
  useStore.setState((state) => {
    const streamPreviews = { ...state.streamPreviews }
    const streamPreviewSlots = { ...state.streamPreviewSlots }
    for (const id of toDelete) {
      delete streamPreviews[id]
      delete streamPreviewSlots[id]
    }
    return {
      tasks: state.tasks.filter((task) => !toDelete.has(task.id)),
      selectedTaskIds: state.selectedTaskIds.filter((id) => !toDelete.has(id)),
      streamPreviews,
      streamPreviewSlots,
    }
  })
  const imageIds = new Set<string>()
  for (const task of deletedTasks) {
    addTaskReferencedImageIds(imageIds, task)
    clearCustomRecoveryTimer(task.id)
    clearOpenAIWatchdogTimer(task.id)
    taskExecutions.delete(task.id)
  }
  if (deletedTasks.length) {
    try {
      await commitTaskDeletion(deletedTasks.map((task) => task.id))
    } catch (err) {
      console.warn('批量删除任务失败，尝试逐条删除', err)
      await Promise.all(deletedTasks.map((task) => dbDeleteTask(task.id)))
    }
  }
  await deleteUnreferencedImageIds(imageIds)
  return deletedTasks.length
}

/** 删除多条任务 */
export async function removeMultipleTasks(taskIds: string[]) {
  if (!taskIds.length) return

  const deletedCount = await removeTasks(taskIds)
  if (deletedCount === 0) return
  useStore.getState().showToast(`已删除 ${deletedCount} 个任务`, 'success')
}

/** 删除所有失败任务 */
export async function clearFailedTasks(taskIds?: string[]) {
  const targetTaskIds = taskIds ? new Set(taskIds) : null
  const failedTasks = useStore.getState().tasks
    .filter((task) => taskMatchesFilterStatus(task, 'error') && (!targetTaskIds || targetTaskIds.has(task.id)))
  const failedTaskIds = failedTasks
    .filter((task) => task.status === 'error')
    .map((task) => task.id)
  const partialFailedTaskIds = new Set(
    failedTasks
      .filter((task) => task.status !== 'error' && taskHasOutputErrors(task))
      .map((task) => task.id),
  )

  if (failedTaskIds.length) await removeMultipleTasks(failedTaskIds)
  if (partialFailedTaskIds.size) {
    const { tasks, setTasks, selectedTaskIds, setSelectedTaskIds, showToast } = useStore.getState()
    const updated = tasks.map((task) => partialFailedTaskIds.has(task.id) ? { ...task, outputErrors: undefined } : task)
    setTasks(updated)
    const nextSelectedTaskIds = selectedTaskIds.filter((id) => !partialFailedTaskIds.has(id))
    if (nextSelectedTaskIds.length !== selectedTaskIds.length) setSelectedTaskIds(nextSelectedTaskIds)
    await Promise.all(updated.filter((task) => partialFailedTaskIds.has(task.id)).map((task) => putTask(task)))
    showToast(`已清除 ${partialFailedTaskIds.size} 条部分失败记录`, 'success')
  }
}

/** 删除单条任务 */
export async function removeTask(task: TaskRecord) {
  const deletedCount = await removeTasks([task.id])
  if (deletedCount === 0) return
  useStore.getState().showToast('任务已删除', 'success')
}

/** 清空数据选项 */
export interface ClearOptions {
  clearConfig?: boolean
  clearTasks?: boolean
}

/** 清空数据 */
export async function clearData(options: ClearOptions = { clearConfig: true, clearTasks: true }) {
  const { setTasks, clearInputImages, clearMaskDraft, setSettings, setParams, showToast } = useStore.getState()
  // 清空后剩余的批量提示词已没有对应的任务、配置或图片，直接结束批量
  if (useStore.getState().batchProgress) endBatch(activeBatchId)

  if (options.clearTasks) {
    await dbClearTasks()
    await clearImages()
    clearImageCaches()
    setTasks([])
    clearInputImages()
    clearMaskDraft()
    useStore.setState({ imageSourceUrls: {} })
  }

  if (options.clearConfig) {
    const presetConfig = getPresetConfig()
    useStore.setState({
      dismissedPresetProfileIds: [],
      dismissedPresetConnectionIds: [],
    })
    if (presetConfig) {
      useStore.setState({ settings: { ...DEFAULT_SETTINGS } })
      await useStore.getState().setPresetImportedSettings(presetConfig)
    } else {
      setSettings({ ...DEFAULT_SETTINGS })
    }
    setParams({ ...DEFAULT_PARAMS, ...getActiveApiProfile(useStore.getState().settings).paramDefaults })
    useStore.setState({ paramsByProfile: {} })
  }

  showToast('所选数据已清空', 'success')
}

async function completeRecoveredCustomTask(task: TaskRecord, result: Awaited<ReturnType<typeof getCustomQueuedImageResult>>) {
  const latest = useStore.getState().tasks.find((item) => item.id === task.id)
  if (!latest || latest.status === 'done') return
  if (latest.status !== 'running' && !latest.customRecoverable) return

  const { outputIds, outputDataUrls, outputImageSizes, transparentOriginalImageIds } = await storeTaskOutputImages(task, result.images)
  const actualParamsList = await resolveImageSizeParamsList(outputDataUrls, undefined, outputImageSizes)
  const latestBeforeUpdate = useStore.getState().tasks.find((item) => item.id === task.id)
  if (!latestBeforeUpdate || latestBeforeUpdate.status === 'done' || (latestBeforeUpdate.status !== 'running' && !latestBeforeUpdate.customRecoverable)) {
    await deleteUnreferencedImageIds([...outputIds, ...(transparentOriginalImageIds ?? [])])
    return
  }

  updateTaskInStore(task.id, {
    outputImages: outputIds,
    transparentOriginalImages: transparentOriginalImageIds,
    actualParams: firstActualParams(actualParamsList),
    actualParamsByImage: mapActualParamsByImage(outputIds, actualParamsList),
    revisedPromptByImage: undefined,
    ...createTaskDonePatch(task, Date.now()),
    customRecoverable: false,
  })
  useStore.getState().showToast(`自定义异步任务已恢复，共 ${outputIds.length} 张图片`, 'success')
  showTaskCompletionNotification('图像生成完成', `自定义异步任务已恢复，共 ${outputIds.length} 张图片。`)
}

async function recoverCustomTask(taskId: string) {
  const { settings, tasks } = useStore.getState()
  const task = tasks.find((item) => item.id === taskId)
  if (!task || !task.customTaskId || task.status === 'done') return

  const profile = getCustomRecoveryProfile(settings, task)
  const customConnection = profile ? getCustomConnectionDefinition(settings, profile.connectionId) : null
  if (!profile || !customConnection?.poll) {
    clearCustomRecoveryTimer(taskId)
    updateTaskInStore(taskId, {
      ...createTaskErrorPatch(task, '异步任务的接入方式已不可用，请重新选择。', Date.now()),
      customRecoverable: false,
    })
    showTaskFailureNotification(task)
    return
  }

  try {
    const result = await getCustomQueuedImageResult(profile, customConnection, task.customTaskId, task.params)
    clearCustomRecoveryTimer(taskId)
    await completeRecoveredCustomTask(task, result)
  } catch (err) {
    clearCustomRecoveryTimer(taskId)
    if (!useStore.getState().tasks.some((item) => item.id === taskId)) return
    updateTaskInStore(taskId, {
      ...createTaskErrorPatch(task, err instanceof Error ? err.message : String(err), Date.now()),
      ...getRawErrorPayload(err),
      customRecoverable: false,
    })
    showTaskFailureNotification(task)
  }
}

/** 导出选项 */
export interface ExportOptions {
  exportConfig?: boolean
  exportTasks?: boolean
}

/** 导出数据为 ZIP */
export async function exportData(options: ExportOptions = { exportConfig: true, exportTasks: true }) {
  // 导出全程可取消：取消后放弃后续分片的下载
  const signal = startDataProgress('export', true)
  let savedParts = 0
  try {
    const state = useStore.getState()
    if (options.exportTasks && hasActiveDataOperations(state.tasks)) throw new Error('当前有任务正在进行，请完成或停止后再导出。')
    const tasks = options.exportTasks ? await getAllTasks() : []
    const imageIds = options.exportTasks ? await getAllImageIds() : []
    const { settings, favoriteCollections, defaultFavoriteCollectionId } = state
    const exportedAt = Date.now()
    const params = {
      options,
      exportedAt,
      settings,
      tasks,
      imageTasks: tasks,
      imageSourceUrls: state.imageSourceUrls,
      favoriteCollections,
      defaultFavoriteCollectionId,
    }
    const imageSizes = []
    for (const [idx, id] of imageIds.entries()) {
      throwIfAborted(signal)
      updateDataProgress('统计图片', idx, imageIds.length, 'image')
      const image = await getImage(id)
      if (!image) continue
      const thumbnail = await getImageThumbnail(id)
      imageSizes.push({ id, bytes: getExportImageEstimatedBytes(image, thumbnail) })
    }
    updateDataProgress('统计图片', imageIds.length, imageIds.length, 'image')
    throwIfAborted(signal)
    const plan = getExportZipPlan(params, imageSizes)
    const backupId = `${exportedAt}`
    const imageTotal = plan.reduce((sum, part) => sum + part.imageIds.length, 0)
    let imagesRead = 0

    for (let index = 0; index < plan.length; index++) {
      const partNumber = index + 1
      const partLabel = plan.length > 1 ? `（第 ${partNumber} / ${plan.length} 个分片）` : ''
      throwIfAborted(signal)
      const images: StoredImage[] = []
      const thumbnailsByImageId = new Map<string, StoredImageThumbnail>()
      for (const id of plan[index].imageIds) {
        throwIfAborted(signal)
        updateDataProgress(`读取图片${partLabel}`, imagesRead, imageTotal, 'image')
        const image = await getImage(id)
        imagesRead++
        if (!image) continue
        images.push(image)
        const thumbnail = await getImageThumbnail(id)
        if (!thumbnail?.thumbnailDataUrl) continue
        thumbnailsByImageId.set(id, thumbnail)
        cacheThumbnail(id, {
          dataUrl: thumbnail.thumbnailDataUrl,
          width: thumbnail.width,
          height: thumbnail.height,
          thumbnailVersion: thumbnail.thumbnailVersion,
        })
      }
      updateDataProgress(`读取图片${partLabel}`, imagesRead, imageTotal, 'image')
      throwIfAborted(signal)
      updateDataProgress(`打包${partLabel}`)

      const result = await buildExportZip({
        ...params,
        tasks: plan[index].tasks,
        images,
        thumbnailsByImageId,
        includeManifestData: plan[index].includeBaseData,
        backupPart: plan.length > 1 ? { id: backupId, index: partNumber, total: plan.length } : undefined,
      })
      throwIfAborted(signal)
      updateDataProgress(`保存文件${partLabel}`)
      const blob = createExportBlob(result.bytes)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const suffix = plan.length > 1 ? `_${String(plan.length).padStart(2, '0')}parts_part${String(partNumber).padStart(2, '0')}` : ''
      a.href = url
      a.download = `ai-image-studio-backup_${formatExportFileTime(new Date(exportedAt))}${suffix}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      savedParts++
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      if (partNumber < plan.length) await new Promise((resolve) => setTimeout(resolve, 150))
    }
    useStore.getState().showToast(plan.length > 1 ? `已请求下载 ${plan.length} 个 ZIP，请确认浏览器已允许多文件下载` : '数据已导出', 'success')
  } catch (e) {
    if (signal.aborted) {
      useStore.getState().showToast(savedParts ? `已取消导出，已下载的 ${savedParts} 个分片不是完整备份，可以删除` : '已取消导出', 'info')
      return
    }
    console.error('exportData failed', e)
    const detail = e instanceof Error ? e.message.trim() : String(e).trim()
    useStore.getState().showToast(detail ? `导出失败，${detail}` : '导出失败，未知错误', 'error')
  } finally {
    endDataProgress()
  }
}

/** 导入选项 */
export interface ImportOptions {
  importConfig?: boolean
  importTasks?: boolean
}

export async function restoreExplicitPresetConfig(ids: { connectionIds: string[], profileIds: string[] }) {
  const presetConnectionIds = getPresetConnectionIds()
  const presetProfileIds = getPresetProfileIds()
  const connectionIds = ids.connectionIds.filter((id) => presetConnectionIds.has(id))
  const profileIds = ids.profileIds.filter((id) => presetProfileIds.has(id))
  if (!connectionIds.length && !profileIds.length) return false

  const state = useStore.getState()
  for (const id of connectionIds) state.restorePresetConnection(id)
  for (const id of profileIds) state.restorePresetProfile(id)
  const presetConfig = getPresetConfig()
  if (presetConfig) await useStore.getState().setPresetImportedSettings(presetConfig)
  return true
}

/** 导入 ZIP 数据 */
export async function importData(input: File | File[], options: ImportOptions = { importConfig: true, importTasks: true }): Promise<boolean> {
  // 只允许在解析备份阶段取消；开始写入后取消会留下半份数据
  const signal = startDataProgress('import', true)
  try {
    const state = useStore.getState()
    if (options.importTasks && hasActiveDataOperations(state.tasks)) throw new Error('当前有任务正在进行，请完成或停止后再导入。')
    const files = Array.isArray(input) ? input : [input]
    if (!files.length) throw new Error('没有选择备份文件。')
    if (files.some((file) => file.size >= MAX_EXPORT_ZIP_BYTES)) {
      throw new Error('单个 ZIP 不能达到或超过 2 GB，请选择分片备份。')
    }

    const selected = [] as Array<{ file: File; manifest: Awaited<ReturnType<typeof readExportZipManifest>> }>
    for (const [idx, file] of files.entries()) {
      updateDataProgress('解析备份', idx, files.length > 1 ? files.length : 0, files.length > 1 ? 'file' : undefined)
      const manifest = await readExportZipManifest(new Uint8Array(await file.arrayBuffer()), options.importTasks)
      selected.push({ file, manifest })
      throwIfAborted(signal)
    }
    const multipart = selected.some((part) => part.manifest.backupPart != null)
    if (multipart) {
      if (selected.some((part) => !part.manifest.backupPart)) throw new Error('不能混合选择分片备份和普通备份。')
      const first = selected[0].manifest.backupPart!
      const indexes = new Set(selected.map((part) => part.manifest.backupPart!.index))
      const validSet = selected.every((part) => {
        const backupPart = part.manifest.backupPart!
        return backupPart.id === first.id && backupPart.total === first.total && backupPart.index >= 1 && backupPart.index <= first.total
      })
      if (!validSet || indexes.size !== selected.length) throw new Error('所选分片不属于同一批备份或包含重复分片。')
      if (options.importTasks && (selected.length !== first.total || indexes.size !== first.total)) {
        throw new Error(`分片备份不完整，请一次选择同一备份的全部 ${first.total} 个 ZIP。`)
      }
      selected.sort((a, b) => a.manifest.backupPart!.index - b.manifest.backupPart!.index)
    }

    const settingsManifests = selected.filter((part) => part.manifest.settings)
    if (options.importConfig && !options.importTasks && !settingsManifests.length) throw new Error('所选备份不包含配置数据。')
    const importedTasks = selected.flatMap((part) => part.manifest.tasks ?? [])
    const hasTaskData = selected.some((part) => part.manifest.tasks != null || part.manifest.imageFiles != null)

    // 先关闭取消再检查，确保点了取消就不会进入写入阶段
    setDataProgressCancelable(false)
    throwIfAborted(signal)

    const importedImageIds: string[] = []
    if (options.importTasks && hasTaskData) {
      // 原图和缩略图合并计数，分片交替写入时进度条也只增不减
      const fileTotal = selected.reduce((sum, part) => sum + Object.keys(part.manifest.imageFiles ?? {}).length + Object.keys(part.manifest.thumbnailFiles ?? {}).length, 0)
      let filesDone = 0
      for (const [idx, part] of selected.entries()) {
        updateDataProgress(selected.length > 1 ? `读取备份（第 ${idx + 1} / ${selected.length} 个）` : '读取备份', filesDone, fileTotal, 'file')
        const { manifest, files: zipFiles } = await readExportZip(new Uint8Array(await part.file.arrayBuffer()))
        for (const [id, info] of Object.entries(manifest.imageFiles ?? {})) {
          // 先计入当前文件，写到最后一个时进度到 100%
          updateDataProgress('写入图片和缩略图', ++filesDone, fileTotal, 'file')
          const dataUrl = readExportZipFileAsDataUrl(zipFiles, info.path)
          if (!dataUrl) continue
          await putImage({
            id,
            dataUrl,
            createdAt: info.createdAt,
            source: info.source,
            width: info.width,
            height: info.height,
          })
          cacheImage(id, dataUrl)
          // 备份文件来自外部，只接受 http(s) 链接
          if (isHttpUrl(info.sourceUrl)) {
            const sourceUrl = info.sourceUrl
            useStore.setState((s) => ({ imageSourceUrls: { ...s.imageSourceUrls, [id]: sourceUrl } }))
          }
          importedImageIds.push(id)
        }

        for (const [id, info] of Object.entries(manifest.thumbnailFiles ?? {})) {
          updateDataProgress('写入图片和缩略图', ++filesDone, fileTotal, 'file')
          const thumbnailDataUrl = readExportZipFileAsDataUrl(zipFiles, info.path)
          if (!thumbnailDataUrl) continue
          await putImageThumbnail({
            id,
            thumbnailDataUrl,
            width: info.width,
            height: info.height,
            thumbnailVersion: info.thumbnailVersion,
          })
          cacheThumbnail(id, {
            dataUrl: thumbnailDataUrl,
            width: info.width,
            height: info.height,
            thumbnailVersion: info.thumbnailVersion,
          })
        }
      }

      updateDataProgress('写入任务和收藏夹')
      for (const task of importedTasks) {
        // startedAt 来自导入文件，非法值会让计时和“重试于”显示异常
        await putTask(Number.isFinite(task.startedAt) || task.startedAt === undefined ? task : { ...task, startedAt: undefined })
      }

      const tasks = await getAllTasks()
      const state = useStore.getState()
      const importedFavoriteCollections = selected.flatMap((part) => part.manifest.favoriteCollections ?? [])
      const mergedFavorites = mergeFavoriteCollections(state.favoriteCollections, importedFavoriteCollections)
      const favoriteCollections = mergedFavorites.collections
      const importedDefaultFavoriteCollectionId = selected
        .map((part) => part.manifest.defaultFavoriteCollectionId)
        .find((id) => id != null && favoriteCollections.some((collection) => collection.id === id))
      const defaultFavoriteCollectionId = mergedFavorites.importedCollections.length
        ? resolveDefaultFavoriteCollectionId(favoriteCollections, importedDefaultFavoriteCollectionId)
        : state.defaultFavoriteCollectionId
      const normalizedFavorites = normalizeLoadedFavoriteState(tasks, favoriteCollections, defaultFavoriteCollectionId)
      useStore.setState({
        tasks: normalizedFavorites.tasks,
        favoriteCollections: normalizedFavorites.collections,
        defaultFavoriteCollectionId: normalizedFavorites.defaultFavoriteCollectionId,
      })
      if (normalizedFavorites.changed) await Promise.all(normalizedFavorites.tasks.map((task) => putTask(task)))
      scheduleThumbnailBackfill(importedImageIds)
    }

    if (options.importConfig && settingsManifests.length) {
      updateDataProgress('写入配置')
      const state = useStore.getState()
      const connectionIds = new Set(settingsManifests.flatMap((part) =>
        part.manifest.settings?.customConnections?.map((connection) => connection.id) ?? [],
      ))
      const profileIds = new Set(settingsManifests.flatMap((part) =>
        part.manifest.settings?.profiles.map((profile) => profile.id) ?? [],
      ))
      const presetConnectionIds = getPresetConnectionIds()
      const presetProfileIds = getPresetProfileIds()
      for (const id of connectionIds) {
        if (presetConnectionIds.has(id)) state.restorePresetConnection(id)
      }
      for (const id of profileIds) {
        if (presetProfileIds.has(id)) state.restorePresetProfile(id)
      }
      const current = useStore.getState()
      const settings = settingsManifests.reduce(
        (current, part) => mergeImportedSettings(current, part.manifest.settings, { preserveInternalIds: true }),
        current.settings,
      )
      current.setSettings(settings)
    }

    let msg = '数据已成功导入'
    if (options.importTasks && hasTaskData) {
      msg = `已导入 ${importedTasks.length} 个任务`
    } else if (options.importConfig && settingsManifests.length) {
      msg = '配置已成功导入'
    }

    useStore.getState().showToast(msg, 'success')
    return true
  } catch (e) {
    if (signal.aborted) {
      useStore.getState().showToast('已取消导入，未写入任何数据', 'info')
      return false
    }
    console.error('importData failed', e)
    const detail = e instanceof Error ? e.message.trim() : String(e).trim()
    useStore.getState().showToast(detail ? `导入失败，${detail}` : '导入失败，未知错误', 'error')
    return false
  } finally {
    endDataProgress()
  }
}

/** 添加图片到输入（文件上传） */
export async function addImageFromFile(file: File): Promise<void> {
  const image = await createInputImageFromFile(file)
  if (!image) return
  useStore.getState().addInputImage(image)
}

export async function createInputImageFromFile(file: File): Promise<InputImage | null> {
  if (!file.type.startsWith('image/')) return null
  const dataUrl = await fileToDataUrl(file)
  const id = await storeImage(dataUrl, 'upload')
  cacheImage(id, dataUrl)
  // 本地添加的图片即使与链接添加的内容相同，也不再沿用当时的链接，以免提交已过期的链接
  forgetImageSourceUrl(id)
  return { id, dataUrl }
}

/** 添加图片到输入（右键菜单、添加链接）—— 支持 data/blob/http URL */
export async function addImageFromUrl(src: string): Promise<void> {
  const res = await fetch(src)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const blob = await res.blob()
  if (!blob.type.startsWith('image/')) throw new Error('不是有效的图片')
  const dataUrl = await blobToDataUrl(blob)
  const id = await storeImage(dataUrl, 'upload')
  cacheImage(id, dataUrl)
  // 内容相同的图片共用一个 id，记录最近一次添加的链接
  if (isHttpUrl(src)) useStore.setState((s) => ({ imageSourceUrls: { ...s.imageSourceUrls, [id]: src } }))
  useStore.getState().addInputImage({ id, dataUrl })
}
