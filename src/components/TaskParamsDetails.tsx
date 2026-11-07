import type { ReactNode } from 'react'
import type { TaskParams, TaskRecord } from '../types'
import { GEMINI_CONNECTION_ID, getGeminiImageOptions } from '../lib/gemini'
import { GROK_CONNECTION_ID, getGrokImageOptions } from '../lib/grok'
import { isVectorOrAnimatedFormat, supportsGptImage26Params } from '../lib/imageModels'
import { DetailParamValue } from '../lib/paramDisplay'

export default function TaskParamsDetails({ task, actualParams, transparentOutputFailed }: {
  task: TaskRecord
  actualParams?: Partial<TaskParams>
  transparentOutputFailed: boolean
}) {
  const gemini = task.apiConnectionId === GEMINI_CONNECTION_ID
  const grok = task.apiConnectionId === GROK_CONNECTION_ID
  const rows: Array<{ label: string; value: ReactNode }> = gemini || grok ? [
    { label: '比例', value: task.params.aspect_ratio === 'auto' || !task.params.aspect_ratio ? '自动' : task.params.aspect_ratio },
    { label: '分辨率', value: task.params.image_size === 'auto' || !task.params.image_size ? '接口默认' : task.params.image_size === '512' ? '0.5K' : task.params.image_size },
  ] : [{ label: '尺寸', value: <DetailParamValue task={task} paramKey="size" actualParams={actualParams} /> }]
  if (!gemini && (!grok || getGrokImageOptions(task.apiModel ?? '').supportsQuality)) rows.push({ label: '质量', value: <DetailParamValue task={task} paramKey="quality" actualParams={actualParams} /> })
  if (!gemini && !grok && supportsGptImage26Params(task.apiModel ?? '')) rows.push({ label: '复杂度', value: <DetailParamValue task={task} paramKey="complexity" actualParams={actualParams} /> })
  rows.push({ label: '格式', value: <DetailParamValue task={task} paramKey="output_format" actualParams={actualParams} /> })
  if (task.params.output_format !== 'jpeg' && (!isVectorOrAnimatedFormat(task.params.output_format) || task.params.background === 'transparent' || task.params.background === 'opaque')) {
    const background = task.transparentOutput ? '本地去背景' : actualParams?.background === 'opaque' || actualParams?.background === 'transparent' ? actualParams.background : task.params.background
    rows.push({ label: '背景', value: <>{background === 'opaque' ? '不透明' : background === 'transparent' ? '透明' : background === '本地去背景' ? background : '接口默认'}{transparentOutputFailed && <span className="ml-1.5 rounded bg-red-50 px-1 py-0.5 text-[10px] font-medium uppercase leading-none text-red-600 dark:bg-red-500/10 dark:text-red-400">failed</span>}</> })
  }
  if (task.params.output_format === 'jpeg' || task.params.output_format === 'webp') rows.push({ label: '压缩率', value: task.params.output_compression ?? '未设置' })
  if (gemini && getGeminiImageOptions(task.apiModel ?? '').thinkingLevels.length) rows.push({ label: '思考强度', value: task.params.thinking_level === 'high' ? '深入' : task.params.thinking_level === 'medium' ? '适中' : task.params.thinking_level === 'minimal' ? '快速' : '接口默认' })
  if (!gemini && !grok) rows.push({ label: '审核', value: <DetailParamValue task={task} paramKey="moderation" actualParams={actualParams} /> })
  if (task.params.output_format === 'gif') rows.push({ label: 'GIF 帧数', value: task.params.frame_count ?? 9 }, { label: '每帧时长', value: `${task.params.frame_duration_ms ?? 200} 毫秒` })
  rows.push({ label: '数量', value: <DetailParamValue task={task} paramKey="n" /> })

  return <div className="mb-4 grid min-w-0 grid-cols-2 gap-2 text-xs">
    {rows.map((row) => <div key={row.label} className="min-w-0 overflow-hidden rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.03]">
      <span className="text-gray-400 dark:text-gray-500">{row.label}</span>
      <div className="mask-edge-r hide-scrollbar mt-0.5 overflow-x-auto whitespace-nowrap pr-2 font-medium text-gray-700 dark:text-gray-300">{row.value}</div>
    </div>)}
  </div>
}
