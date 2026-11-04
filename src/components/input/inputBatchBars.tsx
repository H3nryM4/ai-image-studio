import { useMemo, useState } from 'react'
import { deleteFavoriteCollection, removeMultipleTasks, taskMatchesFilterStatus, taskMatchesSearchQuery, useStore } from '../../store'
import { ALL_FAVORITES_COLLECTION_ID, getTaskFavoriteCollectionIds } from '../../lib/favoriteState'
import { downloadImageEntriesAsZip, downloadImageIds, formatExportFileTime, getTaskOutputImageZipEntries } from '../../lib/downloadImages'
import { getCollectionTasks } from '../favorites/favoriteUtils'
import { CloseIcon, DownloadIcon, FavoriteIcon, TrashIcon } from '../icons'
import { TooltipButton } from '../TooltipButton'

const ACTION_CLASS = 'flex min-h-11 w-full min-w-0 items-center justify-center gap-1.5 rounded-full px-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-30 sm:px-3'

export default function InputBatchBars() {
  const selectionMode = useStore((s) => s.selectionMode)
  const setSelectionMode = useStore((s) => s.setSelectionMode)
  const tasks = useStore((s) => s.tasks)
  const collections = useStore((s) => s.favoriteCollections)
  const defaultFavoriteCollectionId = useStore((s) => s.defaultFavoriteCollectionId)
  const filterFavorite = useStore((s) => s.filterFavorite)
  const activeFavoriteCollectionId = useStore((s) => s.activeFavoriteCollectionId)
  const filterStatus = useStore((s) => s.filterStatus)
  const searchQuery = useStore((s) => s.searchQuery)
  const settings = useStore((s) => s.settings)
  const selectedTaskIds = useStore((s) => s.selectedTaskIds)
  const selectedCollectionIds = useStore((s) => s.selectedFavoriteCollectionIds)
  const setSelectedTaskIds = useStore((s) => s.setSelectedTaskIds)
  const setSelectedCollectionIds = useStore((s) => s.setSelectedFavoriteCollectionIds)
  const clearCollectionSelection = useStore((s) => s.clearFavoriteCollectionSelection)
  const openFavoritePicker = useStore((s) => s.openFavoritePicker)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)
  const showToast = useStore((s) => s.showToast)
  const [downloading, setDownloading] = useState(false)
  const inOverview = filterFavorite && !activeFavoriteCollectionId

  const visibleTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return tasks.filter((task) => {
      if (filterFavorite) {
        if (!task.isFavorite) return false
        if (activeFavoriteCollectionId && activeFavoriteCollectionId !== ALL_FAVORITES_COLLECTION_ID && !getTaskFavoriteCollectionIds(task, defaultFavoriteCollectionId).includes(activeFavoriteCollectionId)) return false
      }
      return taskMatchesFilterStatus(task, filterStatus) && taskMatchesSearchQuery(task, q)
    })
  }, [tasks, searchQuery, filterStatus, filterFavorite, activeFavoriteCollectionId, defaultFavoriteCollectionId])

  const collectionCards = useMemo(() => [
    { id: ALL_FAVORITES_COLLECTION_ID, name: '全部', tasks: getCollectionTasks(ALL_FAVORITES_COLLECTION_ID, tasks, defaultFavoriteCollectionId) },
    ...collections.map((collection) => ({ ...collection, tasks: getCollectionTasks(collection.id, tasks, defaultFavoriteCollectionId) })),
  ], [collections, tasks, defaultFavoriteCollectionId])
  const visibleCollections = searchQuery.trim()
    ? collectionCards.filter((collection) => collection.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : collectionCards
  const selectedTasks = visibleTasks.filter((task) => selectedTaskIds.includes(task.id))
  const selectedCollections = visibleCollections.filter((collection) => selectedCollectionIds.includes(collection.id))
  const deletableCollections = selectedCollections.filter((collection) => collection.id !== ALL_FAVORITES_COLLECTION_ID)
  const visibleIds = inOverview ? visibleCollections.map((collection) => collection.id) : visibleTasks.map((task) => task.id)
  const selectedIds = inOverview ? selectedCollections.map((collection) => collection.id) : selectedTasks.map((task) => task.id)
  const count = selectedIds.length
  const imageCount = (inOverview ? selectedCollections.flatMap((collection) => collection.tasks) : selectedTasks)
    .reduce((sum, task) => sum + task.outputImages.length, 0)
  const canDelete = inOverview ? deletableCollections.length > 0 && deletableCollections.length < collections.length : count > 0
  const deleteLabel = `删除 ${inOverview ? deletableCollections.length : count} 个${inOverview ? '收藏夹' : '任务'}`

  const downloadSelected = async () => {
    setDownloading(true)
    const timeStr = formatExportFileTime(new Date())
    const route = inOverview ? 'favorite-collection-selection' : 'task-selection'
    const useZip = settings.zipDownloadRoutes.includes(route)
    const groups = inOverview ? selectedCollections : [{ id: 'tasks', name: '', tasks: selectedTasks }]
    let successCount = 0
    let failCount = 0
    let archiveCount = 0
    try {
      for (const group of groups) {
        const entries = getTaskOutputImageZipEntries(group.tasks)
        if (!entries.length) continue
        const name = inOverview ? group.id === ALL_FAVORITES_COLLECTION_ID ? `favorites-all-${timeStr}` : `favorites-${group.name}-${timeStr}` : `batch-${timeStr}`
        const result = useZip
          ? await downloadImageEntriesAsZip(entries, name)
          : await downloadImageIds(entries.map((entry) => entry.imageId), name)
        successCount += result.successCount
        failCount += result.failCount
        if (result.successCount > 0) archiveCount++
        if (groups.length > 1) await new Promise((resolve) => window.setTimeout(resolve, 100))
      }
      if (successCount === 0) showToast('下载失败', 'error')
      else if (failCount > 0) showToast(`部分下载失败：成功 ${successCount}，失败 ${failCount}`, 'error')
      else showToast(useZip && archiveCount > 1 ? `下载成功：${archiveCount} 个压缩包，${successCount} 张图片` : `下载成功：${successCount} 张图片`, 'success')
    } catch (err) {
      console.error('批量下载失败', err)
      showToast('下载失败', 'error')
    } finally {
      setDownloading(false)
    }
  }

  const deleteSelected = () => {
    if (!inOverview) {
      setConfirmDialog({
        title: `删除 ${count} 个任务`,
        message: `确定删除选中的 ${count} 个任务吗？共包含 ${imageCount} 张生成图片，未被其他任务引用的图片资源也会清理。此操作无法撤销。`,
        confirmText: '删除',
        tone: 'danger',
        action: () => removeMultipleTasks(selectedIds),
      })
      return
    }
    const collectionImageCount = new Set(deletableCollections.flatMap((collection) => collection.tasks.flatMap((task) => task.outputImages))).size
    setConfirmDialog({
      title: `删除 ${deletableCollections.length} 个收藏夹`,
      message: `确定删除选中的 ${deletableCollections.length} 个收藏夹吗？${selectedCollections.some((collection) => collection.id === ALL_FAVORITES_COLLECTION_ID) ? '「全部」是汇总视图，会予以保留。' : ''}`,
      confirmText: '删除',
      tone: 'danger',
      checkbox: collectionImageCount > 0 ? { label: `同时删除收藏夹中的图片（${collectionImageCount} 张）`, tone: 'danger' } : undefined,
      action: async (deleteImages = false) => {
        for (const collection of deletableCollections) await deleteFavoriteCollection(collection.id, deleteImages)
        clearCollectionSelection()
      },
    })
  }

  if (!selectionMode) return null

  return (
    <div data-no-drag-select aria-label="批量操作">
      <div className="mb-1 flex min-h-9 items-center justify-between gap-3 px-3">
        <p role="status" aria-live="polite" className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-gray-500 dark:text-gray-400">
          {count > 0 ? <>
            <span className="font-medium text-gray-700 dark:text-gray-200">已选 {count} 个{inOverview ? '收藏夹' : '任务'}</span>
            <span>·</span>
            <span>{imageCount} 张图片</span>
          </> : `点击卡片选择${inOverview ? '收藏夹' : '任务'}`}
        </p>
        <TooltipButton
          tooltip="退出多选"
          wrapperClassName="relative inline-flex shrink-0"
          onClick={() => setSelectionMode(false)}
          className="flex h-11 w-11 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-200/60 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
        >
          <CloseIcon className="h-4 w-4" aria-hidden="true" />
        </TooltipButton>
      </div>
      <div className="flex flex-col rounded-3xl border border-gray-200/50 bg-white/90 p-1.5 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-gray-800/90 sm:flex-row sm:items-center sm:justify-center sm:rounded-full">
        <div className="grid grid-cols-2 sm:flex sm:flex-[2] sm:items-center">
          <TooltipButton
            tooltip="全选当前结果"
            wrapperClassName="relative inline-flex min-w-0 sm:flex-1"
            disabled={visibleIds.length === 0 || count === visibleIds.length}
            onClick={() => inOverview ? setSelectedCollectionIds(visibleIds) : setSelectedTaskIds(visibleIds)}
            className={`${ACTION_CLASS} text-gray-600 hover:bg-blue-50 dark:text-gray-300 dark:hover:bg-blue-500/10`}
          >
            <svg className="h-4 w-4 shrink-0 text-blue-500 dark:text-blue-400" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="4" /><path d="M8 12l3 3 5-6" />
            </svg>
            全选
          </TooltipButton>
          <TooltipButton
            tooltip="反选当前结果"
            wrapperClassName="relative inline-flex min-w-0 sm:flex-1"
            disabled={visibleIds.length === 0}
            onClick={() => {
              const next = visibleIds.filter((id) => !selectedIds.includes(id))
              if (inOverview) setSelectedCollectionIds(next)
              else setSelectedTaskIds(next)
            }}
            className={`${ACTION_CLASS} text-gray-600 hover:bg-purple-50 dark:text-gray-300 dark:hover:bg-purple-500/10`}
          >
            <svg className="h-4 w-4 shrink-0 text-purple-500 dark:text-purple-400" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="4" strokeDasharray="3 3" /><path d="M8 12h8m-3-3 3 3-3 3" />
            </svg>
            反选
          </TooltipButton>
        </div>
        <div aria-hidden="true" className="mx-3 my-1 h-px bg-gray-200/70 dark:bg-white/10 sm:mx-1 sm:my-0 sm:h-5 sm:w-px" />
        <div className={`grid ${inOverview ? 'grid-cols-2' : 'grid-cols-3'} sm:flex ${inOverview ? 'sm:flex-[2]' : 'sm:flex-[3]'} sm:items-center`}>
          <TooltipButton
            tooltip={downloading ? '正在下载图片' : imageCount > 0 ? `下载 ${imageCount} 张图片` : '请选择包含图片的任务或收藏夹'}
            wrapperClassName="relative inline-flex min-w-0 sm:flex-1"
            disabled={imageCount === 0 || downloading}
            onClick={() => void downloadSelected()}
            className={`${ACTION_CLASS} text-gray-600 hover:bg-green-50 dark:text-gray-300 dark:hover:bg-green-500/10`}
          >
            <DownloadIcon className="h-4 w-4 shrink-0 text-green-500 dark:text-green-400" />
            <span className="truncate">{downloading ? '下载中…' : imageCount ? `下载 ${imageCount} 张` : '下载图片'}</span>
          </TooltipButton>
          {!inOverview && (
            <TooltipButton
              tooltip="编辑选中任务的收藏夹"
              wrapperClassName="relative inline-flex min-w-0 sm:flex-1"
              disabled={count === 0}
              onClick={() => openFavoritePicker(selectedIds)}
              className={`${ACTION_CLASS} text-gray-600 hover:bg-yellow-50 dark:text-gray-300 dark:hover:bg-yellow-500/10`}
            >
              <FavoriteIcon filled={count > 0 && selectedTasks.every((task) => task.isFavorite)} className="h-4 w-4 shrink-0 text-yellow-500 dark:text-yellow-400" />收藏夹
            </TooltipButton>
          )}
          <TooltipButton
            tooltip={inOverview && !canDelete && count > 0 ? deletableCollections.length === 0 ? '「全部」是汇总视图，无法删除' : '至少保留一个收藏夹' : deleteLabel}
            wrapperClassName="relative inline-flex min-w-0 sm:flex-1"
            disabled={!canDelete}
            onClick={deleteSelected}
            className={`${ACTION_CLASS} text-gray-600 hover:bg-red-50 dark:text-gray-300 dark:hover:bg-red-500/10`}
          >
            <TrashIcon className="h-4 w-4 shrink-0 text-red-500 dark:text-red-400" />删除
          </TooltipButton>
        </div>
      </div>
    </div>
  )
}
