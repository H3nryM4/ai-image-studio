import { DEFAULT_HOME_PARAMS, DEFAULT_PARAMS, type ApiProfile, type CustomConnectionDefinition, type HomeParam } from '../../types'
import { getHomeParamState, HOME_PARAM_OPTIONS } from '../../lib/homeParams'
import { getImageGenerationModel, isGptImage25Model } from '../../lib/imageModels'
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
  const qualityValues = ['auto', 'low', 'medium', 'high', ...(isGptImage25Model(getImageGenerationModel(profile)) ? ['xhigh', 'max'] : [])]
  const options = {
    quality: qualityValues.map((value) => ({ label: value === 'auto' ? '自动' : value, value })),
    output_format: ['png', 'jpeg', 'webp'].map((value) => ({ label: value.toUpperCase(), value })),
    transparent_output: [{ label: '关闭', value: 'false' }, { label: '开启', value: 'true' }],
    moderation: [{ label: '默认', value: 'auto' }, { label: '较宽松', value: 'low' }],
  }
  const help = {
    quality: '设置生成质量，可用档位取决于图像模型。',
    output_format: '设置输出图片格式。PNG 不发送压缩参数，JPEG 不启用透明背景。',
    transparent_output: '默认是否生成透明背景。实现方式在“连接与兼容设置”中选择。',
    output_compression: '仅 JPEG 和 WebP 发送压缩参数（0–100）；留空使用接口默认值。',
    moderation: '设置内容审核级别。“较宽松”不代表关闭审核。',
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
          <SettingLabel small label="参数" className="mb-0" help={`右侧开关控制是否在首页“更多设置”显示。关闭时使用配置默认值，隐藏不会取消发送参数。${connection ? '自定义接口仅列出模板引用的参数；固定值在模板中设置，本地去背景可独立使用。' : ''}`} />
          <div className="flex shrink-0 items-center gap-3 text-xs text-gray-400">
            <span className="w-24 px-3 sm:w-32">默认值</span>
            <span className="w-9 text-center">显示</span>
          </div>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-white/[0.06]">
          {HOME_PARAM_OPTIONS.filter((option) => available.has(option.value)).map((option) => (
            <SettingSwitch key={option.value} label={option.label} help={help[option.value]} switchLabel={`首页显示${option.label}`} checked={selected.includes(option.value)} disabled={locked} className="py-3" onChange={() => onChange({ homeParams: selected.includes(option.value) ? selected.filter((key) => key !== option.value) : [...selected, option.value] }, true)}>
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
                  value={String(defaults[option.value])}
                  options={options[option.value]}
                  disabled={locked}
                  onChange={(value) => changeDefault(option.value, option.value === 'transparent_output' ? value === 'true' : value)}
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
