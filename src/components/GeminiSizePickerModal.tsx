import { useRef, useState } from 'react'
import type { TaskParams } from '../types'
import { getGeminiImageOptions, normalizeGeminiParams } from '../lib/gemini'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'

const buttonClass = (active: boolean) => `rounded-xl border px-3 py-2 text-sm transition ${active
  ? 'border-blue-400 bg-blue-50 text-blue-600 dark:border-blue-500/50 dark:bg-blue-500/10 dark:text-blue-300'
  : 'border-transparent bg-black/[0.04] text-gray-600 hover:bg-black/[0.07] dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1]'
}`

export default function GeminiSizePickerModal({ params, model, onSelect, onClose }: {
  params: TaskParams
  model: string
  onSelect: (params: Partial<TaskParams>) => void
  onClose: () => void
}) {
  const normalized = normalizeGeminiParams(params, model)
  const [ratio, setRatio] = useState(normalized.aspect_ratio ?? 'auto')
  const [resolution, setResolution] = useState(normalized.image_size ?? 'auto')
  const options = getGeminiImageOptions(model)
  const modalRef = useRef<HTMLDivElement>(null)
  const mouseDownTargetRef = useRef<EventTarget | null>(null)
  usePreventBackgroundScroll(true)
  useCloseOnEscape(true, onClose)

  // 按下和抬起都在弹窗外才关闭，避免在弹窗内拖选文本时误关
  const isOutside = (target: EventTarget | null) => Boolean(modalRef.current && target && !modalRef.current.contains(target as Node))
  const resolutionLabel = (value: string) => value === 'auto' ? '默认' : value === '512' ? '0.5K' : value
  const preview = ratio === 'auto' && resolution === 'auto'
    ? '自动'
    : `${ratio === 'auto' ? '自动' : ratio} · ${resolutionLabel(resolution)}`

  return (
    <div
      data-no-drag-select
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      onMouseDown={(e) => { mouseDownTargetRef.current = e.target }}
      onMouseUp={(e) => {
        if (isOutside(mouseDownTargetRef.current) && isOutside(e.target)) onClose()
        mouseDownTargetRef.current = null
      }}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-xs animate-overlay-in" />
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="设置 Gemini 图像尺寸"
        className="relative z-10 w-full max-w-md rounded-3xl border border-white/50 bg-white/95 p-5 shadow-2xl ring-1 ring-black/5 animate-modal-in dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">设置图像尺寸</h3>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">实际像素由模型决定，兼容渠道以服务商支持为准</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
            aria-label="关闭"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-5">
          <section>
            <div className="mb-2 text-xs font-medium text-gray-400 dark:text-gray-500">分辨率</div>
            <div className="flex gap-2">
              {['auto', ...options.resolutions].map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={resolution === value}
                  className={`${buttonClass(resolution === value)} flex-1`}
                  onClick={() => setResolution(value)}
                >
                  {resolutionLabel(value)}
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-2 text-xs font-medium text-gray-400 dark:text-gray-500">宽高比</div>
            <div className="grid grid-cols-5 gap-2">
              {['auto', ...options.ratios].map((value) => {
                const [w, h] = value === 'auto' ? [1, 1] : value.split(':').map(Number)
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={ratio === value}
                    className={`${buttonClass(ratio === value)} flex flex-col items-center justify-center gap-1.5 !px-1 !py-2.5`}
                    onClick={() => setRatio(value)}
                  >
                    <div className="flex h-5 w-5 items-center justify-center">
                      {value === 'auto' ? (
                        <svg className="h-4 w-4 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      ) : (
                        <div
                          className="rounded-[3px] border-[1.5px] border-current opacity-60"
                          style={{
                            width: w >= h ? '100%' : `${(w / h) * 100}%`,
                            height: h >= w ? '100%' : `${(h / w) * 100}%`,
                          }}
                        />
                      )}
                    </div>
                    <span className="text-xs">{value === 'auto' ? '自动' : value}</span>
                  </button>
                )
              })}
            </div>
          </section>

          <div className="rounded-2xl bg-gray-50 px-4 py-3 dark:bg-white/[0.03]">
            <div className="text-xs text-gray-400 dark:text-gray-500">将使用</div>
            <div className="mt-1 text-lg font-semibold text-gray-800 dark:text-gray-100">
              {preview.split(' · ').map((part, idx) => (
                <span key={idx} className={/[一-鿿]/.test(part) ? undefined : 'font-mono'}>
                  {idx > 0 && ' · '}{part}
                </span>
              ))}
            </div>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">自动和默认不发送对应参数</p>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl bg-gray-100 px-4 py-2.5 text-sm text-gray-600 transition hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => { onSelect({ aspect_ratio: ratio, image_size: resolution }); onClose() }}
            className="flex-1 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-600"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  )
}
