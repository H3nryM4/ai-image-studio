import { useCallback, useEffect, useRef, useState } from 'react'
import type { TaskParams } from '../../types'
import { normalizeGifParams } from '../../lib/gptImageParams'

export default function GifFrameInput({ param, value, onChange }: {
  param: 'frame_count' | 'frame_duration_ms'
  value: number
  onChange: (patch: Partial<TaskParams>) => void
}) {
  const [input, setInput] = useState(String(value))
  const latest = useRef({ input, value, onChange })
  latest.current = { input, value, onChange }
  useEffect(() => setInput(String(value)), [value])
  const commit = useCallback(() => {
    const current = latest.current
    const parsed = current.input.trim() ? Number(current.input) : NaN
    const next = normalizeGifParams({ [param]: Number.isFinite(parsed) ? parsed : undefined })[param]
    if (next !== current.value) current.onChange({ [param]: next })
    return next
  }, [param])
  // 弹层在 pointerdown 时卸载，浏览器尚未来得及触发 blur。
  useEffect(() => () => { commit() }, [commit])

  return <input
    aria-label={param === 'frame_count' ? 'GIF 帧数' : '每帧时长（毫秒）'}
    value={input}
    onChange={(e) => setInput(e.target.value)}
    type="number"
    min={param === 'frame_count' ? 2 : 20}
    max={param === 'frame_count' ? 16 : 2000}
    step={param === 'frame_count' ? 1 : 10}
    onBlur={() => setInput(String(commit()))}
    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
    className="w-28 rounded-xl bg-black/[0.04] px-3 py-1.5 text-xs focus:outline-hidden dark:bg-white/[0.06]"
  />
}
