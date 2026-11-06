import { useState, type ComponentProps, type Ref } from 'react'
import { DEFAULT_STREAM_PARTIAL_IMAGES, REASONING_EFFORT_VALUES, type ApiProfile, type CustomConnectionDefinition, type ReasoningEffort } from '../../types'
import { DEFAULT_IMAGES_MODEL, DEFAULT_RESPONSES_MODEL, DEFAULT_API_BASE_URL, isOpenAIConnection, normalizeStreamPartialImages } from '../../lib/apiProfiles'
import { customConnectionSupportsNativeTransparentBackground } from '../../lib/customConnectionCapabilities'
import Select from '../Select'
import { ChevronDownIcon } from '../icons'
import SettingLabel from './SettingLabel'
import SettingSwitch from './SettingSwitch'
import ProfileParamsEditor from './ProfileParamsEditor'

const INPUT_CLASS_NAME = 'w-full rounded-xl border border-transparent bg-black/[0.04] px-3 py-2.5 text-sm text-gray-700 outline-hidden transition focus:border-blue-300 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white/[0.06] dark:text-gray-200 dark:focus:border-blue-500/50'

interface ApiProfileEditorProps {
  profile: ApiProfile
  nameInputRef: Ref<HTMLInputElement>
  customConnection: CustomConnectionDefinition | null
  locked: boolean
  presetOnly: boolean
  connectionAvailable: boolean
  connectionOptions: ComponentProps<typeof Select>['options']
  onConnectionChange: (value: string | number) => void
  onConnectionReorder: NonNullable<ComponentProps<typeof Select>['onReorder']>
  onChange: (patch: Partial<ApiProfile>, commit?: boolean) => void
  onCommit: (patch: Partial<ApiProfile>) => void
  apiProxyAvailable: boolean
  apiProxyLocked: boolean
  apiProxyEnabled: boolean
  apiProxyChecked: boolean
  timeoutInput: string
  onTimeoutChange: (value: string) => void
  onTimeoutBlur: () => void
}

export default function ApiProfileEditor(props: ApiProfileEditorProps) {
  const [showKey, setShowKey] = useState(false)
  const profile = props.profile
  const nativeTransparent = !props.customConnection || customConnectionSupportsNativeTransparentBackground(props.customConnection)
  const model = profile.connectionId === 'openai-responses' ? DEFAULT_RESPONSES_MODEL : DEFAULT_IMAGES_MODEL
  const connectionOptions = props.presetOnly
    ? props.connectionOptions.filter((option) => option.value === profile.connectionId)
    : props.connectionOptions

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block min-w-0">
          <SettingLabel label="配置名称" />
          <input ref={props.nameInputRef} aria-label="配置名称" value={profile.name} onChange={(e) => props.onChange({ name: e.target.value })} onBlur={(e) => props.onCommit({ name: e.target.value })} disabled={props.locked} className={INPUT_CLASS_NAME} />
        </label>
        <div className="min-w-0">
          <SettingLabel label="接入方式" help="内置接入按 OpenAI 官方协议发送参数。第三方需兼容相应字段；字段有差异时可使用自定义 HTTP 接口。" />
          <Select
            value={!props.connectionAvailable ? '接入已失效，请重新选择' : profile.connectionId}
            onChange={props.onConnectionChange}
            onReorder={props.onConnectionReorder}
            options={connectionOptions}
            disabled={props.locked || props.presetOnly}
            className={INPUT_CLASS_NAME}
          />
        </div>
      </div>
      {props.connectionAvailable && <div>
        <SettingLabel label="API 地址" help={'通常填写服务商提供的基础地址。末尾带 / 时按原地址拼接接口，不自动补 /v1。'} />
        <input aria-label="API 地址" value={profile.baseUrl} onChange={(e) => props.onChange({ baseUrl: e.target.value })} onBlur={(e) => props.onCommit({ baseUrl: e.target.value })} disabled={props.apiProxyEnabled || props.locked} placeholder={DEFAULT_API_BASE_URL} className={INPUT_CLASS_NAME} />
        {props.apiProxyEnabled && <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-500">已启用部署代理，实际 API 地址由部署端决定。</p>}
      </div>}
      {props.apiProxyAvailable && <SettingSwitch label="使用部署代理" help="请求经部署服务器转发，可绕过浏览器跨域限制。启用后 API 地址由部署端决定。" checked={props.apiProxyChecked} disabled={props.apiProxyLocked || props.locked} onChange={() => props.onChange({ apiProxy: !profile.apiProxy }, true)} />}
      <div>
        <SettingLabel label="API Key" />
        <div className="relative">
          <input aria-label="API Key" autoComplete="off" value={profile.apiKey} onChange={(e) => props.onChange({ apiKey: e.target.value })} onBlur={(e) => props.onCommit({ apiKey: e.target.value })} type={showKey ? 'text' : 'password'} placeholder={'sk-...'} className={`${INPUT_CLASS_NAME} pr-14`} />
          <button type="button" onClick={() => setShowKey(!showKey)} aria-label={showKey ? '隐藏 API Key' : '显示 API Key'} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-blue-500">{showKey ? '隐藏' : '显示'}</button>
        </div>
      </div>
      <div>
        <SettingLabel label={profile.connectionId === 'openai-responses' ? '请求模型' : '模型 ID'} help={profile.connectionId === 'openai-responses' ? '对应 Responses 请求的 model。官方接口需使用支持生图工具的文本模型；兼容接口按服务商提供的模型 ID 填写。' : '填写服务商提供的模型 ID。'} />
        <input aria-label={profile.connectionId === 'openai-responses' ? '请求模型' : '模型 ID'} value={profile.model} onChange={(e) => props.onChange({ model: e.target.value })} onBlur={(e) => props.onCommit({ model: e.target.value })} disabled={props.locked} placeholder={model} className={INPUT_CLASS_NAME} />
        <p className="mt-1.5 text-xs text-gray-400">多个模型用逗号分隔，可在首页切换。</p>
      </div>
      <ProfileParamsEditor profile={profile} connection={props.customConnection} locked={props.locked} onChange={props.onChange} />
      <details className="group border-t border-gray-100 pt-4 dark:border-white/[0.08]">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-gray-600 dark:text-gray-300 [&::-webkit-details-marker]:hidden">连接与兼容设置<ChevronDownIcon className="h-4 w-4 transition-transform group-open:rotate-180" /></summary>
        <div className="mt-5 space-y-5">
          {profile.connectionId === 'openai-responses' && <div>
            <SettingLabel label="图像生成模型（可选）" help="指定生图工具使用的模型。留空时不发送工具模型 ID，由接口决定。" />
            <input aria-label="图像生成模型" value={profile.imageGenerationModel ?? ''} onChange={(e) => props.onChange({ imageGenerationModel: e.target.value })} onBlur={(e) => props.onCommit({ imageGenerationModel: e.target.value })} disabled={props.locked} placeholder="留空使用 API 默认值" className={INPUT_CLASS_NAME} />
          </div>}
          {profile.connectionId === 'openai-responses' && <div>
            <SettingLabel label="文本模型推理强度" help="仅 Responses：设置外层文本模型的 reasoning.effort，不是图片质量。留空不发送；填写时需确认文本模型支持该档位。" />
            <Select value={profile.reasoningEffort ?? ''} onChange={(value) => props.onChange({ reasoningEffort: value ? value as ReasoningEffort : undefined }, true)} options={[{ label: '默认', value: '' }, ...REASONING_EFFORT_VALUES.map((value) => ({ label: value, value }))]} disabled={props.locked} className={INPUT_CLASS_NAME} />
          </div>}
          {isOpenAIConnection(profile.connectionId) && <>
            <SettingSwitch label="流式传输" help="逐步接收结果，需要接口支持。开启后，本应用会将多图拆成并发单图请求；Responses 多图始终拆分。" checked={!!profile.streamImages} disabled={props.locked} onChange={() => props.onChange({ streamImages: !profile.streamImages }, true)} />
            {profile.streamImages && <div>
              <SettingLabel label="中间预览图" help="请求 0–3 张生成中的预览图，实际数量由接口决定。预览图可能额外计费，不能保证避免连接超时。" />
              <Select value={normalizeStreamPartialImages(profile.streamPartialImages)} onChange={(value) => props.onChange({ streamPartialImages: normalizeStreamPartialImages(value, DEFAULT_STREAM_PARTIAL_IMAGES) }, true)} options={[{ label: '不请求', value: 0 }, { label: '1 张', value: 1 }, { label: '2 张', value: 2 }, { label: '3 张', value: 3 }]} disabled={props.locked} className={INPUT_CLASS_NAME} />
            </div>}
          </>}
          <div>
            <SettingLabel label="透明背景实现方式" help="首页或默认值开启透明背景后生效。API 原生发送 background: transparent；本地后处理会添加纯色背景提示词，再在浏览器中去除背景。" />
            <Select value={profile.transparentBackgroundMethod} onChange={(value) => props.onChange({ transparentBackgroundMethod: value as ApiProfile['transparentBackgroundMethod'] }, true)} options={[{ label: 'API 原生', value: 'api' }, { label: '本地后处理', value: 'local' }]} disabled={props.locked || !nativeTransparent} className={INPUT_CLASS_NAME} />
            {!nativeTransparent && <p className="mt-1.5 text-xs text-gray-400">此服务商未配置原生透明背景，使用本地后处理。</p>}
          </div>
          {props.connectionAvailable && <>
            {profile.connectionId !== 'openai-responses' && <SettingSwitch label="兼容选项：请求 Base64" help="额外添加 response_format: b64_json（自定义接口仅 POST 生效）。官方 GPT Image 无需此字段；只在服务商要求时启用。自定义模板中的同名字段会被覆盖。" checked={!!profile.responseFormatB64Json} disabled={props.locked} onChange={() => props.onChange({ responseFormatB64Json: !profile.responseFormatB64Json }, true)} />}
            <SettingSwitch label="Codex CLI 兼容模式" help="省略 size 和 quality，并将尺寸写入提示词。仅在渠道明确要求时开启；此模式不能保证任意 Codex 转发服务兼容。" checked={profile.codexCli} disabled={props.locked} onChange={() => props.onChange({ codexCli: !profile.codexCli }, true)} />
            <label className="block">
              <SettingLabel label="请求超时（秒）" />
              <input aria-label="请求超时（秒）" value={props.timeoutInput} onChange={(e) => props.onTimeoutChange(e.target.value)} onBlur={props.onTimeoutBlur} type="number" min={10} max={600} disabled={props.locked} className={INPUT_CLASS_NAME} />
            </label>
          </>}
        </div>
      </details>
    </div>
  )
}
