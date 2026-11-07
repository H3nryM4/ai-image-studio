// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PARAMS } from '../types'
import ModelSizePickerModal from './ModelSizePickerModal'

afterEach(() => vi.unstubAllGlobals())

describe('model size picker', () => {
  it('saves independent ratio and resolution choices and limits options when switching models', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    const el = document.createElement('div')
    document.body.appendChild(el)
    const root = createRoot(el)
    const onSelect = vi.fn()
    const onClose = vi.fn()
    try {
      await act(async () => root.render(<ModelSizePickerModal params={DEFAULT_PARAMS} model="gemini-3.1-flash-image" onSelect={onSelect} onClose={onClose} />))
      await act(async () => {
        Array.from(el.querySelectorAll('button')).find((button) => button.textContent === '16:9')!.click()
        Array.from(el.querySelectorAll('button')).find((button) => button.textContent === '2K')!.click()
      })
      await act(async () => Array.from(el.querySelectorAll('button')).find((button) => button.textContent === '确定')!.click())
      expect(onSelect).toHaveBeenCalledWith({ aspect_ratio: '16:9', image_size: '2K' })
      expect(onClose).toHaveBeenCalledOnce()
      await act(async () => root.render(<ModelSizePickerModal key="2.5" params={DEFAULT_PARAMS} model="gemini-2.5-flash-image" onSelect={onSelect} onClose={onClose} />))
      const buttons = Array.from(el.querySelectorAll('button')).map((button) => button.textContent)
      expect(buttons).not.toContain('1K')
      expect(buttons).not.toContain('2K')
      expect(buttons).not.toContain('4K')
      expect(el.textContent).not.toContain('分辨率')
      await act(async () => Array.from(el.querySelectorAll('button')).find((button) => button.textContent === '确定')!.click())
      expect(onSelect).toHaveBeenLastCalledWith({ aspect_ratio: 'auto', image_size: 'auto' })
    } finally {
      await act(async () => root.unmount())
      el.remove()
    }
  })

  it('offers Grok ratios and resolutions and keeps automatic dimensions unset', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    const el = document.createElement('div')
    document.body.appendChild(el)
    const root = createRoot(el)
    const onSelect = vi.fn()
    try {
      await act(async () => root.render(<ModelSizePickerModal params={DEFAULT_PARAMS} model="grok-imagine-image-2.0" connectionId="xai-images" onSelect={onSelect} onClose={vi.fn()} />))
      expect(el.querySelector('[aria-label="设置 Grok 图像尺寸"]')).not.toBeNull()
      expect(el.textContent).toContain('自动和默认不发送对应参数')
      const buttons = Array.from(el.querySelectorAll('button'))
      expect(buttons.map((button) => button.textContent)).not.toContain('4K')
      await act(async () => buttons.find((button) => button.textContent === '确定')!.click())
      expect(onSelect).toHaveBeenLastCalledWith({ aspect_ratio: 'auto', image_size: 'auto' })
      await act(async () => {
        buttons.find((button) => button.textContent === '5:2')!.click()
        buttons.find((button) => button.textContent === '2K')!.click()
      })
      await act(async () => buttons.find((button) => button.textContent === '确定')!.click())
      expect(onSelect).toHaveBeenLastCalledWith({ aspect_ratio: '5:2', image_size: '2K' })
    } finally {
      await act(async () => root.unmount())
      el.remove()
    }
  })
})
