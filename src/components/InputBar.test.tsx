// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../store'
import { getImageCommentToken } from '../lib/promptImageComments'
import InputBar from './InputBar'

const initial = useStore.getInitialState()
useStore.persist.setOptions({ storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } })
const images = [
  { id: 'image-a', dataUrl: 'data:image/png;base64,a' },
  { id: 'image-b', dataUrl: 'data:image/png;base64,b' },
]
let el: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  })
  useStore.setState({ ...initial, inputImages: images, settings: { ...initial.settings, enterSubmit: false } }, true)
  el = document.createElement('div')
  document.body.appendChild(el)
  root = createRoot(el)
})

afterEach(async () => {
  await act(async () => root.unmount())
  el.remove()
  window.getSelection()?.removeAllRanges()
  useStore.setState(initial, true)
  vi.unstubAllGlobals()
})

describe('prompt input', () => {
  it('treats @ as plain text without intercepting navigation or inserting image references', async () => {
    await act(async () => root.render(<InputBar />))
    const input = el.querySelector<HTMLElement>('[contenteditable="true"]')!
    expect(input.getAttribute('aria-label')).toBe('描述你想生成的图片...')
    await act(async () => {
      input.focus()
      input.textContent = '@'
      const range = document.createRange()
      range.selectNodeContents(input)
      range.collapse(false)
      window.getSelection()!.removeAllRanges()
      window.getSelection()!.addRange(range)
      input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    })
    expect(useStore.getState().prompt).toBe('@')
    expect(el.textContent).not.toContain('选择图片引用')
    expect(input.querySelector('span')).toBeNull()
    for (const key of ['Tab', 'ArrowDown', 'ArrowUp', 'Escape']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      await act(async () => input.dispatchEvent(event))
      expect(event.defaultPrevented).toBe(false)
    }
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })))
    expect(useStore.getState().prompt).toBe('@\n')
    await act(async () => el.querySelector('[data-input-image-index="0"]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })))
    expect(useStore.getState().prompt).toBe('@\n')
    expect(useStore.getState().inputImages).toEqual(images)
  })

  it('keeps board comments editable as capsules without an @ prefix', async () => {
    const token = getImageCommentToken(0, [{ x: 0.5, y: 0.5, text: '改成红色' }])
    useStore.setState({ prompt: `前${token}后` })
    await act(async () => root.render(<InputBar />))
    const input = el.querySelector<HTMLElement>('[contenteditable="true"]')!
    const tag = input.querySelector<HTMLElement>('.comment-tag')!
    expect(tag.textContent).toBe('图1 评论')
    expect(tag.dataset.commentText).toBe(token)
    await act(async () => {
      input.append('新增文字')
      input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    })
    expect(useStore.getState().prompt).toBe(`前${token}后新增文字`)
    await act(async () => {
      tag.remove()
      input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    })
    expect(useStore.getState().prompt).toBe('前后新增文字')
  })
})
