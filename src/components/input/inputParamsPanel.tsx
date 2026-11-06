import { useEffect, useRef, useState } from 'react'
import type { ApiProfile, AppSettings, BatchProgress, BatchPromptMode, TaskParams } from '../../types'
import { DEFAULT_BATCH_PROMPT_CONCURRENCY, normalizeBatchPromptConcurrency } from '../../lib/batchPrompts'
import { getGeminiImageOptions } from '../../lib/gemini'
import { getHomeParamState } from '../../lib/homeParams'
import { dismissAllTooltips } from '../../lib/tooltipDismiss'
import Select from '../Select'
import ButtonTooltip from './buttonTooltip'
import ParamPopoverChip, { CHIP_BASE_CLASS, CHIP_IDLE_CLASS } from './paramPopoverChip'

const CHIP_CLASS = `${CHIP_BASE_CLASS} ${CHIP_IDLE_CLASS}`
const ROW_CLASS = 'relative flex items-center justify-between gap-3'
const ROW_LABEL_CLASS = 'text-gray-500 dark:text-gray-400'
const CONTROL_DISABLED_CLASS = 'px-3 py-1.5 rounded-xl border border-transparent bg-black/[0.04] dark:bg-white/[0.04] opacity-50 cursor-not-allowed text-xs transition-all duration-200'

type BatchSettingsPatch = Partial<Pick<AppSettings, 'batchPromptEnabled' | 'batchPromptMode' | 'batchPromptConcurrencyLimited' | 'batchPromptConcurrency'>>

function Switch({ checked, disabled, label, onToggle }: { checked: boolean; disabled?: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
    >
      <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-[14px]' : 'translate-x-[2px]'}`} />
    </button>
  )
}

/** 输入为空或无效时保留原值 */
function parseConcurrency(input: string, fallback: number) {
  const parsed = Number(input)
  return input.trim() && Number.isFinite(parsed) ? normalizeBatchPromptConcurrency(parsed) : fallback
}

/** 并发数输入框：随弹层挂载，打开时从已保存的值初始化，聚焦输入时实时提示过高的并发数 */
function ConcurrencyInput({ value, disabled, onCommit }: { value: number; disabled: boolean; onCommit: (value: number) => void }) {
  const [input, setInput] = useState(String(value))
  const [focused, setFocused] = useState(false)
  const latestRef = useRef({ input, value, onCommit })
  latestRef.current = { input, value, onCommit }

  // 直接关闭弹层时输入框被卸载而不会触发 blur，卸载时补一次提交
  useEffect(() => () => {
    const latest = latestRef.current
    const next = parseConcurrency(latest.input, latest.value)
    if (next !== latest.value) latest.onCommit(next)
  }, [])

  const commit = () => {
    const next = parseConcurrency(input, value)
    setInput(String(next))
    if (next !== value) onCommit(next)
  }

  return (
    <>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          commit()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
        disabled={disabled}
        type="number"
        min={1}
        className={`w-28 px-3 py-1.5 rounded-xl border border-transparent focus:border-blue-300 dark:focus:border-blue-500/50 focus:outline-hidden text-xs transition-all duration-200 ${
          disabled ? 'bg-black/[0.03] dark:bg-white/[0.04] opacity-50 cursor-not-allowed' : 'bg-black/[0.04] dark:bg-white/[0.06]'
        }`}
      />
      <ButtonTooltip
        visible={focused && Number(input) > DEFAULT_BATCH_PROMPT_CONCURRENCY}
        text={`并发数超过 ${DEFAULT_BATCH_PROMPT_CONCURRENCY} 可能导致浏览器卡顿或触发服务商限流`}
      />
    </>
  )
}

interface HintTooltipState {
  visible: boolean
  show: () => void
  hide: () => void
  clearTimer: () => void
  startTouch: () => void
}

export default function InputParamsPanel({
  params,
  setParams,
  activeProfile,
  modelOptions,
  onModelChange,
  displaySize,
  qualityOptions,
  selectClass,
  showTransparentOutputControl,
  transparentOutputEnabled,
  transparentOutputHint,
  onTransparentOutputMenuOpenChange,
  compressionHint,
  compressionDisabled,
  outputCompressionInput,
  setOutputCompressionInput,
  commitOutputCompression,
  outputImageLimit,
  nInput,
  setNInputFocused,
  commitN,
  handleNInputChange,
  handleNLimitIncreaseAttempt,
  hideNLimitHint,
  nLimitHint,
  nLimitHintText,
  streamConcurrentByN,
  streamConcurrentHint,
  sizeHint,
  homeParamState,
  onOpenSizePicker,
  showBatch,
  batchEnabled,
  batchMode,
  batchConcurrencyLimited,
  batchConcurrency,
  batchPromptCount,
  batchProgress,
  onBatchChange,
  onStopBatch,
}: {
  params: TaskParams
  setParams: (patch: Partial<TaskParams>) => void
  activeProfile: ApiProfile
  modelOptions: Array<{ label: string; value: string }>
  onModelChange: (model: string) => void
  displaySize: string
  qualityOptions: Array<{ label: string; value: string }>
  selectClass: string
  showTransparentOutputControl: boolean
  transparentOutputEnabled: boolean
  transparentOutputHint: HintTooltipState
  onTransparentOutputMenuOpenChange: (open: boolean) => void
  compressionHint: HintTooltipState
  compressionDisabled: boolean
  outputCompressionInput: string
  setOutputCompressionInput: (value: string) => void
  commitOutputCompression: () => void
  outputImageLimit: number
  nInput: string
  setNInputFocused: (focused: boolean) => void
  commitN: () => void
  handleNInputChange: (value: string) => void
  handleNLimitIncreaseAttempt: (preventDefault: () => void) => void
  hideNLimitHint: () => void
  nLimitHint: HintTooltipState
  nLimitHintText: string
  streamConcurrentByN: boolean
  streamConcurrentHint: HintTooltipState
  sizeHint: HintTooltipState
  homeParamState: ReturnType<typeof getHomeParamState>
  onOpenSizePicker: () => void
  showBatch: boolean
  batchEnabled: boolean
  batchMode: BatchPromptMode
  batchConcurrencyLimited: boolean
  batchConcurrency: number
  batchPromptCount: number
  batchProgress: BatchProgress | null
  onBatchChange: (patch: BatchSettingsPatch) => void
  onStopBatch: () => void
}) {
  const native = activeProfile.transparentBackgroundMethod === 'api'
  const visible = homeParamState.visible.filter((key) =>
    (key !== 'output_compression' || !compressionDisabled) &&
    (key !== 'transparent_output' || native || showTransparentOutputControl),
  )
  const prefix = (text: string) => <span className="mr-1.5 text-gray-400 dark:text-gray-500">{text}</span>

  const batchSummary = batchProgress
    ? `${batchProgress.finished}/${batchProgress.total}`
    : batchEnabled ? `${batchPromptCount} 条` : undefined

  return (
    <div className="flex flex-1 flex-wrap sm:flex-nowrap items-center gap-2 min-w-0 text-xs">
      {modelOptions.length > 1 && <div className="min-w-0 max-w-full sm:shrink-[0.01] max-sm:flex-auto">
        <Select
          value={activeProfile.model}
          onChange={(val) => onModelChange(String(val))}
          options={modelOptions}
          showValueTooltips
          menuClassName="min-w-max"
          className={CHIP_CLASS}
        />
      </div>}
      {homeParamState.available.includes('size') && <div
        className="relative max-sm:flex-auto sm:shrink-0"
        onMouseEnter={sizeHint.show}
        onMouseLeave={sizeHint.hide}
        onTouchStart={sizeHint.startTouch}
        onTouchEnd={sizeHint.clearTimer}
        onTouchCancel={sizeHint.hide}
        onClick={sizeHint.show}
      >
        <button
          type="button"
          onClick={() => { dismissAllTooltips(); onOpenSizePicker() }}
          className={`flex w-full items-center ${CHIP_CLASS}`}
        >
          {prefix('尺寸')}
          {/* 等宽字体缺中文字形会回退到别的字体，中文片段保持与其他参数一致 */}
          {displaySize.split(' · ').map((part, idx) => (
            <span key={idx} className={/[一-鿿]/.test(part) ? undefined : 'font-mono'}>
              {idx > 0 && ' · '}{part}
            </span>
          ))}
        </button>
        <ButtonTooltip
          visible={activeProfile.codexCli && sizeHint.visible}
          text="兼容模式不发送 size，尺寸要求会写入提示词，结果由接口决定"
        />
      </div>}

      {visible.length > 0 && <ParamPopoverChip label="更多设置" className="sm:shrink-0">
        {visible.includes('n') && <label
          className={ROW_CLASS}
          onMouseEnter={() => { streamConcurrentHint.show() }}
          onMouseLeave={() => { hideNLimitHint(); streamConcurrentHint.hide() }}
          onTouchStart={() => { streamConcurrentHint.startTouch() }}
          onTouchEnd={() => { streamConcurrentHint.clearTimer() }}
          onTouchCancel={() => {
            hideNLimitHint()
            streamConcurrentHint.hide()
          }}
          onClick={() => { streamConcurrentHint.show() }}
        >
          <span className={ROW_LABEL_CLASS}>数量</span>
          <input
            value={nInput}
            onChange={(e) => handleNInputChange(e.target.value)}
            onFocus={() => setNInputFocused(true)}
            onBlur={() => {
              setNInputFocused(false)
              commitN()
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp') {
                handleNLimitIncreaseAttempt(() => e.preventDefault())
              }
            }}
            onWheel={(e) => {
              if (e.deltaY < 0) {
                handleNLimitIncreaseAttempt(() => e.preventDefault())
              }
            }}
            type={'number'}
            min={1}
            max={outputImageLimit}
            className="w-28 rounded-xl bg-black/[0.04] px-3 py-1.5 text-xs focus:outline-hidden dark:bg-white/[0.06] disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <ButtonTooltip visible={nLimitHint.visible} text={nLimitHintText} />
          <ButtonTooltip visible={streamConcurrentByN && streamConcurrentHint.visible && !nLimitHint.visible} text="数量大于 1 时会将多图生成拆分为并发单图" />
        </label>}
        {visible.includes('quality') && <div className={ROW_CLASS}>
          <span className={ROW_LABEL_CLASS}>质量</span>
          <div className="w-28"><Select value={params.quality} onChange={(val) => setParams({ quality: val as TaskParams['quality'] })} options={qualityOptions} className={selectClass} /></div>
        </div>}
        {visible.includes('output_format') && <div className={ROW_CLASS}>
          <span className={ROW_LABEL_CLASS}>格式</span>
          <div className="w-28">
            <Select
              value={params.output_format}
              onChange={(val) => {
                setParams({
                  output_format: val as TaskParams['output_format'],
                  ...(val === 'png' ? { output_compression: null } : {}),
                  ...(val === 'jpeg' ? { transparent_output: false, ...(params.background === 'transparent' ? { background: 'opaque' as const } : {}) } : {}),
                })
              }}
              options={[
                { label: '接口默认', value: 'default' },
                { label: 'PNG', value: 'png' },
                { label: 'JPEG', value: 'jpeg' },
                { label: 'WebP', value: 'webp' },
              ]}
              className={selectClass}
            />
          </div>
        </div>}
        {visible.includes('transparent_output') && (
          <div
            className={ROW_CLASS}
            onMouseEnter={transparentOutputHint.show}
            onMouseLeave={transparentOutputHint.hide}
            onTouchStart={transparentOutputHint.startTouch}
            onTouchEnd={transparentOutputHint.clearTimer}
            onTouchCancel={transparentOutputHint.hide}
            onClick={transparentOutputHint.show}
          >
            <span className={ROW_LABEL_CLASS}>{native ? '背景' : '本地去背景'}</span>
            <div className="w-28">
              <Select
                value={native ? params.background ?? 'default' : transparentOutputEnabled ? 'on' : 'off'}
                onChange={(val) => {
                  setParams({
                    transparent_output: native ? val === 'transparent' : val === 'on',
                    ...(native ? { background: val as TaskParams['background'], ...(val === 'transparent' && params.output_format === 'jpeg' ? { output_format: 'png' as const } : {}) } : {}),
                    ...(params.output_format === 'png' ? { output_compression: null } : {}),
                  })
                }}
                options={native ? [{ label: '接口默认', value: 'default' }, { label: '不透明', value: 'opaque' }, { label: '透明', value: 'transparent' }] : [{ label: '关闭', value: 'off' }, { label: '开启', value: 'on' }]}
                className={selectClass}
                onOpenChange={onTransparentOutputMenuOpenChange}
              />
            </div>
            <ButtonTooltip
              visible={transparentOutputHint.visible}
              text={native ? '接口默认不发送 background；不透明和透明会明确指定背景' : '生成后在浏览器中去除纯色背景'}
            />
          </div>
        )}
        {visible.includes('output_compression') && (
          <label
            className={ROW_CLASS}
            onMouseEnter={compressionHint.show}
            onMouseLeave={compressionHint.hide}
            onTouchStart={compressionHint.startTouch}
            onTouchEnd={compressionHint.clearTimer}
            onTouchCancel={compressionHint.hide}
            onClick={compressionHint.show}
          >
            <span className={ROW_LABEL_CLASS}>压缩参数</span>
            <input
              value={outputCompressionInput}
              onChange={(e) => setOutputCompressionInput(e.target.value)}
              onBlur={commitOutputCompression}
              disabled={compressionDisabled}
              type="number"
              min={0}
              max={100}
              placeholder="0-100"
              className={`w-28 px-3 py-1.5 rounded-xl border border-transparent focus:border-blue-300 dark:focus:border-blue-500/50 focus:outline-hidden text-xs transition-all duration-200 ${
                compressionDisabled
                  ? 'bg-black/[0.03] dark:bg-white/[0.04] opacity-50 cursor-not-allowed'
                  : 'bg-black/[0.04] dark:bg-white/[0.06]'
                }`}
            />
            <ButtonTooltip
              visible={compressionHint.visible}
              text="仅 JPEG 和 WebP 发送 output_compression；留空使用接口默认值"
            />
          </label>
        )}
        {visible.includes('moderation') && <div className={ROW_CLASS}>
          <span className={ROW_LABEL_CLASS}>内容审核级别</span>
          <div className="w-28">
            <Select
              value={params.moderation}
              onChange={(val) => {
                setParams({ moderation: val as TaskParams['moderation'] })
              }}
              options={[
                { label: '接口默认', value: 'default' },
                { label: '标准（auto）', value: 'auto' },
                { label: '较宽松', value: 'low' },
              ]}
              className={selectClass}
            />
          </div>
        </div>}
        {visible.includes('thinking_level') && <div className={ROW_CLASS}>
          <span className={ROW_LABEL_CLASS}>思考强度</span>
          <div className="w-28"><Select value={params.thinking_level ?? 'default'} onChange={(value) => setParams({ thinking_level: value as TaskParams['thinking_level'] })} options={[{ label: '接口默认', value: 'default' }, ...getGeminiImageOptions(activeProfile.model).thinkingLevels.map((value) => ({ label: value === 'minimal' ? '快速' : value === 'medium' ? '适中' : '深入', value }))]} className={selectClass} /></div>
        </div>}
      </ParamPopoverChip>}
      {showBatch && (
        <ParamPopoverChip label="批量" summary={batchSummary} active={batchEnabled || Boolean(batchProgress)} className="sm:shrink-0">
          <div className={ROW_CLASS}>
            <span className={ROW_LABEL_CLASS}>多提示词批量提交</span>
            <Switch
              checked={batchEnabled}
              disabled={Boolean(batchProgress)}
              label="多提示词批量提交"
              onToggle={() => onBatchChange({ batchPromptEnabled: !batchEnabled })}
            />
          </div>
          {batchEnabled && (
            <>
              <div className={ROW_CLASS}>
                <span className={ROW_LABEL_CLASS}>执行方式</span>
                <div className="w-28">
                  <Select
                    value={batchMode}
                    onChange={(val) => onBatchChange({ batchPromptMode: val as BatchPromptMode })}
                    options={[
                      { label: '排队', value: 'queue' },
                      { label: '并发', value: 'concurrent' },
                    ]}
                    disabled={Boolean(batchProgress)}
                    className={batchProgress ? CONTROL_DISABLED_CLASS : selectClass}
                  />
                </div>
              </div>
              {batchMode === 'concurrent' && (
                <div className={ROW_CLASS}>
                  <span className={ROW_LABEL_CLASS}>限制并发数</span>
                  <Switch
                    checked={batchConcurrencyLimited}
                    disabled={Boolean(batchProgress)}
                    label="限制并发数"
                    onToggle={() => onBatchChange({ batchPromptConcurrencyLimited: !batchConcurrencyLimited })}
                  />
                </div>
              )}
              {batchMode === 'concurrent' && batchConcurrencyLimited && (
                <label className={ROW_CLASS}>
                  <span className={ROW_LABEL_CLASS}>并发数</span>
                  <ConcurrencyInput
                    value={batchConcurrency}
                    disabled={Boolean(batchProgress)}
                    onCommit={(value) => onBatchChange({ batchPromptConcurrency: value })}
                  />
                </label>
              )}
              {batchMode === 'concurrent' && !batchConcurrencyLimited && (
                <p className="rounded-lg bg-amber-500/[0.1] px-2.5 py-2 text-[11px] leading-relaxed text-amber-700 dark:bg-amber-500/[0.14] dark:text-amber-400/90">
                  不限制并发时会同时发出全部请求，提示词较多时可能导致浏览器卡顿甚至崩溃，也容易触发服务商限流。
                </p>
              )}
              <p className="text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">
                提示词之间空两行分隔，当前共 {batchPromptCount} 条；参考图和参数对每条提示词都生效。
              </p>
            </>
          )}
          {batchProgress && (
            <div className={ROW_CLASS}>
              <span className={ROW_LABEL_CLASS}>
                已完成 {batchProgress.finished} / {batchProgress.total}
              </span>
              <button
                type="button"
                onClick={onStopBatch}
                className="rounded-xl bg-red-500/[0.12] px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/[0.18] dark:bg-red-500/[0.18] dark:text-red-400/90 dark:hover:bg-red-500/[0.25]"
              >
                停止批量
              </button>
            </div>
          )}
        </ParamPopoverChip>
      )}
    </div>
  )
}
