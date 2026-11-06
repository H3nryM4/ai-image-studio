// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PARAMS } from '../types'
import GeminiSizePickerModal from './GeminiSizePickerModal'

afterEach(() => vi.unstubAllGlobals())

describe('Gemini size picker', () => {
  it('saves independent ratio and resolution choices and limits options when switching models', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    const el = document.createElement('div')
    document.body.appendChild(el)
    const root = createRoot(el)
    const onSelect = vi.fn()
    const onClose = vi.fn()
    try {
      await act(async () => root.render(<GeminiSizePickerModal params={DEFAULT_PARAMS} model="gemini-3.1-flash-image" onSelect={onSelect} onClose={onClose} />))
      await act(async () => {
        Array.from(el.querySelectorAll('button')).find((button) => button.textContent === '16:9')!.click()
        Array.from(el.querySelectorAll('button')).find((button) => button.textContent === '2K')!.click()
      })
      await act(async () => Array.from(el.querySelectorAll('button')).find((button) => button.textContent === '确定')!.click())
      expect(onSelect).toHaveBeenCalledWith({ aspect_ratio: '16:9', image_size: '2K' })
      expect(onClose).toHaveBeenCalledOnce()
      await act(async () => root.render(<GeminiSizePickerModal key="2.5" params={DEFAULT_PARAMS} model="gemini-2.5-flash-image" onSelect={onSelect} onClose={onClose} />))
      const buttons = Array.from(el.querySelectorAll('button')).map((button) => button.textContent)
      expect(buttons).toContain('1K')
      expect(buttons).not.toContain('2K')
      expect(buttons).not.toContain('4K')
    } finally {
      await act(async () => root.unmount())
      el.remove()
    }
  })
})
