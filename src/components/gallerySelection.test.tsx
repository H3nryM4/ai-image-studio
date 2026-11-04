// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskRecord } from '../types'
import { DEFAULT_PARAMS } from '../types'
import { useStore } from '../store'
import { ALL_FAVORITES_COLLECTION_ID } from '../lib/favoriteState'
import { downloadImageEntriesAsZip } from '../lib/downloadImages'
import SearchBar from './SearchBar'
import TaskGrid from './TaskGrid'
import { FavoriteCollectionsView } from './favorites/FavoriteCollectionsView'
import InputBatchBars from './input/inputBatchBars'

vi.mock('../lib/imageCache', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/imageCache')>(),
  ensureImageThumbnailCached: vi.fn(async () => undefined),
  subscribeImageThumbnail: vi.fn(() => () => {}),
}))
vi.mock('../lib/downloadImages', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/downloadImages')>(),
  downloadImageEntriesAsZip: vi.fn(async (entries: unknown[]) => ({ successCount: entries.length, failCount: 0 })),
  downloadImageIds: vi.fn(async (ids: string[]) => ({ successCount: ids.length, failCount: 0 })),
}))

const initial = useStore.getInitialState()
useStore.persist.setOptions({ storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } })
const tasks: TaskRecord[] = [
  { id: 'city', prompt: '城市夜景', outputImages: ['image-1', 'image-2'] },
  { id: 'cabin', prompt: '山间木屋', outputImages: ['image-3'] },
].map((task) => ({
  ...task, params: { ...DEFAULT_PARAMS }, inputImageIds: [], maskTargetImageId: null,
  maskImageId: null, status: 'done', error: null, createdAt: 1, finishedAt: 2, elapsed: 1,
}))
let el: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  useStore.setState({ ...initial, tasks, prompt: '尚未提交的草稿', showToast: vi.fn() }, true)
  vi.clearAllMocks()
  el = document.createElement('div')
  document.body.appendChild(el)
  root = createRoot(el)
})

afterEach(async () => {
  await act(async () => root.unmount())
  el.remove()
  useStore.setState(initial, true)
  vi.unstubAllGlobals()
})

async function renderGallery(collections = false) {
  await act(async () => root.render(<>
    <main data-drag-select-surface><SearchBar />{collections ? <FavoriteCollectionsView /> : <TaskGrid />}</main>
    <InputBatchBars />
  </>))
}

async function clickButton(text: string) {
  const button = Array.from(el.querySelectorAll('button')).find((button) => button.textContent?.trim() === text)
  expect(button, `应显示「${text}」按钮`).toBeDefined()
  await act(async () => button!.click())
}

describe('gallery selection', () => {
  it('selects whole cards and checkboxes, keeps an empty mode, and exits without changing the input draft', async () => {
    await renderGallery()
    expect(el.querySelector('input[type="checkbox"]')).toBeNull()
    await clickButton('多选')
    expect(el.querySelectorAll('input[type="checkbox"]')).toHaveLength(2)
    expect(el.querySelector('[aria-label="批量操作"]')?.textContent).toContain('点击卡片选择任务')

    await act(async () => el.querySelector<HTMLElement>('[data-task-id="city"] p')!.click())
    await act(async () => el.querySelector<HTMLInputElement>('[data-task-id="cabin"] input')!.click())
    expect(useStore.getState().selectedTaskIds).toEqual(['city', 'cabin'])
    expect(useStore.getState().detailTaskId).toBeNull()
    expect(el.querySelector('[role="status"]')?.textContent).toContain('已选 2 个任务·3 张图片')
    expect(el.querySelector('[data-task-id="city"] input')?.getAttribute('type')).toBe('checkbox')

    await act(async () => {
      const blank = el.querySelector('[data-task-grid-root]')!
      blank.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    })
    expect(useStore.getState().selectedTaskIds).toHaveLength(2)

    await act(async () => el.querySelector<HTMLInputElement>('[data-task-id="cabin"] input')!.click())
    expect(useStore.getState().selectedTaskIds).toEqual(['city'])
    expect(useStore.getState().selectionMode).toBe(true)
    expect(el.querySelector('[aria-label="批量操作"]')).not.toBeNull()

    await act(async () => el.querySelector<HTMLInputElement>('[data-task-id="city"] input')!.click())
    expect(useStore.getState().selectedTaskIds).toEqual([])
    expect(useStore.getState().selectionMode).toBe(true)
    expect(el.querySelector('[aria-label="批量操作"]')).not.toBeNull()
    expect(el.querySelector('[aria-label="批量操作"]')?.textContent).toContain('点击卡片选择任务')

    await act(async () => el.querySelector<HTMLButtonElement>('button[aria-label="退出多选"]')!.click())
    expect(useStore.getState().selectionMode).toBe(false)
    expect(el.querySelector('input[type="checkbox"]')).toBeNull()
    expect(useStore.getState().prompt).toBe('尚未提交的草稿')
    await act(async () => el.querySelector<HTMLElement>('[data-task-id="city"] p')!.click())
    expect(useStore.getState().detailTaskId).toBe('city')
  })

  it('enters through Ctrl-click and box selection, and exits selection with Escape', async () => {
    await renderGallery()
    await act(async () => el.querySelector('[data-task-id="city"] p')!.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })))
    expect(useStore.getState().selectionMode).toBe(true)
    expect(useStore.getState().selectedTaskIds).toEqual(['city'])
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(useStore.getState().selectionMode).toBe(false)

    el.querySelectorAll('.task-card-wrapper').forEach((card, idx) => {
      card.getBoundingClientRect = () => new DOMRect(20 + idx * 200, 20, 100, 100)
    })
    await act(async () => {
      el.querySelector('[data-task-grid-root]')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 0, clientY: 0 }))
      document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 150, clientY: 150 }))
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    })
    expect(useStore.getState().selectedTaskIds).toEqual(['city'])
    expect(useStore.getState().selectionMode).toBe(true)
  })

  it('keeps select-all and inversion inside the current search results', async () => {
    await renderGallery()
    await clickButton('多选')
    await clickButton('全选')
    expect(useStore.getState().selectedTaskIds).toHaveLength(2)
    await act(async () => useStore.getState().setSearchQuery('木屋'))
    expect(useStore.getState().selectedTaskIds).toEqual([])
    expect(useStore.getState().selectionMode).toBe(true)
    await clickButton('全选')
    expect(useStore.getState().selectedTaskIds).toEqual(['cabin'])
    await clickButton('反选')
    expect(useStore.getState().selectedTaskIds).toEqual([])
    expect(useStore.getState().selectionMode).toBe(true)
  })

  it('downloads exactly the displayed image count and confirms task deletion with both counts', async () => {
    useStore.setState({ settings: { ...initial.settings, zipDownloadRoutes: ['task-selection'] } })
    await renderGallery()
    await clickButton('多选')
    await clickButton('全选')
    await clickButton('下载 3 张')
    expect(downloadImageEntriesAsZip).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ imageId: 'image-1' }), expect.objectContaining({ imageId: 'image-2' }), expect.objectContaining({ imageId: 'image-3' }),
    ]), expect.any(String))
    expect(useStore.getState().selectedTaskIds).toHaveLength(2)
    await clickButton('删除')
    expect(useStore.getState().confirmDialog).toMatchObject({ title: '删除 2 个任务', tone: 'danger' })
    expect(useStore.getState().confirmDialog?.message).toContain('3 张生成图片')
  })

  it('uses the same selection flow for collections and protects the virtual and last collections', async () => {
    const collections = [{ id: 'a', name: '风景', createdAt: 1, updatedAt: 1 }, { id: 'b', name: '其他', createdAt: 2, updatedAt: 2 }]
    useStore.setState({
      filterFavorite: true, favoriteCollections: collections, defaultFavoriteCollectionId: null,
      tasks: tasks.map((task) => ({ ...task, isFavorite: true, favoriteCollectionIds: ['a'] })),
    })
    await renderGallery(true)
    await clickButton('多选')
    await act(async () => el.querySelector<HTMLInputElement>('input[aria-label="选择收藏夹「风景」"]')!.click())
    expect(useStore.getState().activeFavoriteCollectionId).toBeNull()
    expect(el.querySelector('[role="status"]')?.textContent).toContain('已选 1 个收藏夹·3 张图片')
    await clickButton('删除')
    expect(useStore.getState().confirmDialog?.checkbox?.label).toContain('3 张')
    await act(async () => useStore.getState().clearFavoriteCollectionSelection())
    expect(useStore.getState().selectionMode).toBe(true)
    await act(async () => el.querySelector<HTMLInputElement>('input[aria-label="选择收藏夹「全部」"]')!.click())
    expect(el.querySelector<HTMLButtonElement>('button[aria-label="「全部」是汇总视图，无法删除"]')?.disabled).toBe(true)
    await clickButton('反选')
    expect(useStore.getState().selectedFavoriteCollectionIds).toEqual(['a', 'b'])
    expect(el.querySelector<HTMLButtonElement>('button[aria-label="至少保留一个收藏夹"]')?.disabled).toBe(true)
    await act(async () => useStore.getState().setActiveFavoriteCollectionId(ALL_FAVORITES_COLLECTION_ID))
    expect(useStore.getState().selectionMode).toBe(false)
    expect(useStore.getState().selectedFavoriteCollectionIds).toEqual([])
  })
})
