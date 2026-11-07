// @vitest-environment jsdom
import { act, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DEFAULT_PARAMS } from '../../types'
import { createDefaultOpenAIProfile } from '../../lib/apiProfiles'
import { getHomeParamState } from '../../lib/homeParams'
import InputParamsPanel from './inputParamsPanel'

let el: HTMLDivElement
let root: Root
const hint = { visible: false, show: vi.fn(), hide: vi.fn(), clearTimer: vi.fn(), startTouch: vi.fn() }

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  el = document.createElement('div')
  document.body.appendChild(el)
  root = createRoot(el)
})

afterEach(async () => {
  await act(async () => root.unmount())
  el.remove()
  vi.unstubAllGlobals()
})

async function render(overrides: Partial<ComponentProps<typeof InputParamsPanel>> = {}) {
  const profile = overrides.activeProfile ?? createDefaultOpenAIProfile()
  const props: ComponentProps<typeof InputParamsPanel> = {
    params: DEFAULT_PARAMS, setParams: vi.fn(), activeProfile: profile,
    modelOptions: [{ label: profile.model, value: profile.model }], onModelChange: vi.fn(),
    homeParamState: getHomeParamState(profile), displaySize: '自动',
    qualityOptions: [{ label: '自动', value: 'auto' }], selectClass: '',
    showTransparentOutputControl: true, transparentOutputEnabled: false,
    transparentOutputHint: hint, onTransparentOutputMenuOpenChange: vi.fn(),
    compressionHint: hint, compressionDisabled: true, outputCompressionInput: '',
    setOutputCompressionInput: vi.fn(), commitOutputCompression: vi.fn(),
    outputImageLimit: 10, nInput: '1', setNInputFocused: vi.fn(), commitN: vi.fn(),
    handleNInputChange: vi.fn(), handleNLimitIncreaseAttempt: vi.fn(), hideNLimitHint: vi.fn(),
    nLimitHint: hint, nLimitHintText: '', streamConcurrentByN: false, streamConcurrentHint: hint,
    sizeHint: hint, onOpenSizePicker: vi.fn(), showBatch: false, batchEnabled: false,
    batchMode: 'queue', batchConcurrencyLimited: true, batchConcurrency: 10,
    batchPromptCount: 0, batchProgress: null, onBatchChange: vi.fn(), onStopBatch: vi.fn(),
    ...overrides,
  }
  await act(async () => root.render(<InputParamsPanel {...props} />))
}

it('keeps the default toolbar compact and exposes quality only after opening more settings', async () => {
  await render()
  expect(el.textContent).not.toContain('gpt-image')
  expect(el.textContent).not.toContain('质量')
  expect(el.textContent).not.toContain('PNG')
  expect(el.textContent).not.toContain('数量')
  await act(async () => [...el.querySelectorAll('button')].find((button) => button.textContent === '更多设置')!.click())
  expect(el.textContent).toContain('质量')
  expect(el.textContent).toContain('数量')
  expect(el.textContent).not.toContain('内容审核级别')
})

it('hides the more settings entry when no parameters are selected', async () => {
  await render({ activeProfile: createDefaultOpenAIProfile({ homeParams: [] }) })
  expect(el.textContent).not.toContain('更多设置')
})

it('shows WebP compression and transparency together', async () => {
  await render({
    activeProfile: createDefaultOpenAIProfile({ homeParams: ['output_compression', 'transparent_output'] }),
    params: { ...DEFAULT_PARAMS, output_format: 'webp' }, compressionDisabled: false,
  })
  await act(async () => [...el.querySelectorAll('button')].find((button) => button.textContent === '更多设置')!.click())
  expect(el.textContent).toContain('背景')
  expect(el.textContent).toContain('压缩参数')
})

it('commits GIF frame settings when the popover closes before blur', async () => {
  const setParams = vi.fn()
  await render({
    activeProfile: createDefaultOpenAIProfile({ model: 'gpt-image-2.6-sunburst', homeParams: ['output_format', 'complexity', 'frame_count', 'frame_duration_ms'] }),
    params: { ...DEFAULT_PARAMS, output_format: 'gif' },
    setParams,
  })
  const toggle = [...el.querySelectorAll('button')].find((button) => button.textContent === '更多设置')!
  await act(async () => toggle.click())
  expect(el.textContent).toContain('复杂度')
  const input = el.querySelector<HTMLInputElement>('input[aria-label="每帧时长（毫秒）"]')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '117')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => toggle.click())
  expect(setParams).toHaveBeenCalledWith({ frame_duration_ms: 120 })
})
