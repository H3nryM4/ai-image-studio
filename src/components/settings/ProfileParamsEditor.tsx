import { DEFAULT_HOME_PARAMS, DEFAULT_PARAMS, type ApiProfile, type CustomConnectionDefinition, type HomeParam, type TaskParams } from '../../types'
import { getHomeParamState, HOME_PARAM_OPTIONS } from '../../lib/homeParams'
import { isGptImage25Model } from '../../lib/imageModels'
import { GEMINI_CONNECTION_ID, getGeminiImageOptions } from '../../lib/gemini'
import Select from '../Select'
import { ChevronDownIcon } from '../icons'
import SettingLabel from './SettingLabel'
import SettingSwitch from './SettingSwitch'
import { SETTING_CONTROL_CLASS_NAME } from './settingStyles'

export default function ProfileParamsEditor({ profile, connection, locked, onChange }: {
  profile: ApiProfile
  connection: CustomConnectionDefinition | null
  locked: boolean
  onChange: (patch: Partial<ApiProfile>, commit?: boolean) => void
}) {
  const available = new Set([
    ...getHomeParamState(profile, connection).available,
    ...getHomeParamState(profile, connection, true).available,
  ])
  const defaults = { ...DEFAULT_PARAMS, ...profile.paramDefaults }
  const selected = profile.homeParams ?? DEFAULT_HOME_PARAMS
  const native = profile.transparentBackgroundMethod === 'api'
  const qualityValues = ['default', 'auto', 'low', 'medium', 'high', ...(isGptImage25Model(profile.model) ? ['xhigh', 'max'] : [])]
  const options = {
    quality: qualityValues.map((value) => ({ label: value === 'default' ? '接口默认' : value === 'auto' ? '自动（auto）' : value, value })),
    output_format: ['default', 'png', 'jpeg', 'webp'].map((value) => ({ label: value === 'default' ? '接口默认' : value.toUpperCase(), value })),
    transparent_output: native ? [{ label: '接口默认', value: 'default' }, { label: '不透明', value: 'opaque' }, { label: '透明', value: 'transparent' }] : [{ label: '关闭', value: 'false' }, { label: '开启', value: 'true' }],
    thinking_level: [{ label: '接口默认', value: 'default' }, ...getGeminiImageOptions(profile.model).thinkingLevels.map((value) => ({ label: value === 'minimal' ? '快速' : value === 'medium' ? '适中' : '深入', value }))],
    n: Array.from({ length: 10 }, (_, idx) => ({ label: String(idx + 1), value: idx + 1 })),
    moderation: [{ label: '接口默认', value: 'default' }, { label: '标准（auto）', value: 'auto' }, { label: '较宽松', value: 'low' }],
  }
  const help = {
    quality: '设置生成质量，可用档位取决于图像模型。',
    output_format: '设置输出图片格式。PNG 不发送压缩参数，JPEG 不启用透明背景。',
    transparent_output: profile.connectionId === GEMINI_CONNECTION_ID ? '使用本地去背景：添加纯色背景要求，生成后在浏览器中移除背景。不是 Gemini 原生透明输出。' : native ? '接口默认不发送 background；不透明发送 opaque，透明发送 transparent。' : '通过纯色背景提示词和浏览器后处理去除背景。',
    output_compression: '仅 JPEG 和 WebP 发送压缩参数（0–100）；留空使用接口默认值。',
    moderation: '接口默认不发送参数。“较宽松”不代表关闭审核。',
    thinking_level: '接口默认不发送 thinkingConfig。快速和深入的可用档位由图像模型决定。',
    n: '每次任务的生成数量。Gemini 按此次数请求，最多两个请求并发。',
  }
  const changeDefault = (key: HomeParam, value: string | number | boolean | null) => {
    onChange({ paramDefaults: { ...profile.paramDefaults, [key]: value } }, true)
  }

  return (
    <details className="group border-t border-gray-100 pt-4 dark:border-white/[0.08]">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-gray-600 dark:text-gray-300 [&::-webkit-details-marker]:hidden">生成参数与首页显示<ChevronDownIcon className="h-4 w-4 transition-transform group-open:rotate-180" /></summary>
      <div className="mt-5">
        {/* 表头与下方参数行同列对齐，用小号灰字与参数名区分层级 */}
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-2 dark:border-white/[0.06]">
          <SettingLabel small label="参数" className="mb-0" help={`右侧开关控制是否在首页“更多设置”显示。关闭时使用配置默认值；选择接口默认时不发送对应参数。${connection ? '自定义接口仅列出模板引用的参数；固定值在模板中设置，本地去背景可独立使用。' : ''}`} />
          <div className="flex shrink-0 items-center gap-3 text-xs text-gray-400">
            <span className="w-24 px-3 sm:w-32">默认值</span>
            <span className="w-9 text-center">显示</span>
          </div>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-white/[0.06]">
          {HOME_PARAM_OPTIONS.filter((option) => available.has(option.value)).map((option) => (
            <SettingSwitch key={option.value} label={option.value === 'transparent_output' ? native ? '背景' : '本地去背景' : option.label} help={help[option.value]} switchLabel={`首页显示${option.value === 'transparent_output' ? native ? '背景' : '本地去背景' : option.label}`} checked={selected.includes(option.value)} disabled={locked} className="py-3" onChange={() => onChange({ homeParams: selected.includes(option.value) ? selected.filter((key) => key !== option.value) : [...selected, option.value] }, true)}>
              <div className="w-24 sm:w-32">
                {option.value === 'output_compression' ? <input
                  aria-label="默认压缩参数"
                  key={String(defaults.output_compression)}
                  defaultValue={defaults.output_compression ?? ''}
                  disabled={locked}
                  type="number" min={0} max={100} placeholder="默认"
                  onBlur={(e) => {
                    const value = e.target.value.trim()
                    changeDefault('output_compression', value && Number.isFinite(Number(value)) ? Math.max(0, Math.min(100, Math.round(Number(value)))) : null)
                  }}
                  className={SETTING_CONTROL_CLASS_NAME}
                /> : <Select
                  value={option.value === 'transparent_output' && native ? defaults.background ?? 'default' : String(defaults[option.value] ?? 'default')}
                  options={options[option.value]}
                  disabled={locked}
                  onChange={(value) => {
                    if (option.value === 'transparent_output' && native) {
                      onChange({ paramDefaults: { ...profile.paramDefaults, background: value as TaskParams['background'], transparent_output: value === 'transparent' } }, true)
                      return
                    }
                    changeDefault(option.value, option.value === 'transparent_output' ? value === 'true' : option.value === 'n' ? Number(value) : value)
                  }}
                  className={SETTING_CONTROL_CLASS_NAME}
                />}
              </div>
            </SettingSwitch>
          ))}
        </div>
      </div>
    </details>
  )
}
