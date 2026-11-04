import type { AppSettings } from '../../types'
import Select from '../Select'
import { ChevronRightIcon } from '../icons'
import SettingLabel from './SettingLabel'
import SettingSwitch from './SettingSwitch'

const SELECT_CLASS_NAME = 'w-full rounded-xl border border-transparent bg-black/[0.04] px-3 py-1.5 text-xs text-gray-700 outline-hidden transition hover:bg-black/[0.07] dark:bg-white/[0.06] dark:text-gray-200 dark:hover:bg-white/[0.1]'

interface GeneralSettingsTabProps {
  draft: AppSettings
  zipDownloadRouteSummary: string
  commitSettings: (nextDraft: AppSettings) => void
  onOpenZipDownloadRouteManager: () => void
  toggleTaskCompletionNotification: () => Promise<void>
}

export default function GeneralSettingsTab({
  draft,
  zipDownloadRouteSummary,
  commitSettings,
  onOpenZipDownloadRouteManager,
  toggleTaskCompletionNotification,
}: GeneralSettingsTabProps) {
  const submitShortcut = navigator.userAgent.includes('Mac') ? '⌘ + Enter' : 'Ctrl + Enter'

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-gray-100 px-4 pb-1 dark:border-white/[0.08]">
        <h4 className="pb-1 pt-4 text-sm font-semibold text-gray-800 dark:text-gray-100">输入与提交</h4>
        <div className="divide-y divide-gray-100 dark:divide-white/[0.06]">
          <div className="hidden items-center justify-between gap-3 py-3 sm:flex">
            <SettingLabel label="提交快捷键" help={`使用 ${submitShortcut} 提交时，Enter 换行；使用 Enter 提交时，Shift + Enter 换行。`} className="mb-0" />
            <div className="w-32 shrink-0">
              <Select
                value={draft.enterSubmit ? 'enter' : 'ctrl-enter'}
                onChange={(val) => commitSettings({ ...draft, enterSubmit: val === 'enter' })}
                options={[
                  { label: submitShortcut, value: 'ctrl-enter' },
                  { label: 'Enter', value: 'enter' },
                ]}
                className={SELECT_CLASS_NAME}
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 py-3 sm:hidden">
            <SettingLabel label="提交方式" help="默认仅点击发送按钮提交。选择回车或按钮后，也可使用键盘回车提交。" className="mb-0" />
            <div className="w-32 shrink-0">
              <Select
                value={draft.enterSubmit ? 'enter' : 'button'}
                onChange={(val) => commitSettings({ ...draft, enterSubmit: val === 'enter' })}
                options={[
                  { label: '发送按钮', value: 'button' },
                  { label: '回车或按钮', value: 'enter' },
                ]}
                className={SELECT_CLASS_NAME}
              />
            </div>
          </div>
          <SettingSwitch
            label="显示批量入口"
            help="在首页参数栏显示「批量」，支持将空两行分隔的多条提示词排队或并发提交。"
            checked={draft.showBatchPrompt}
            onChange={() => commitSettings({ ...draft, showBatchPrompt: !draft.showBatchPrompt })}
            className="py-3"
          />
          <SettingSwitch
            label="提交后清空输入"
            help="成功创建任务后，清空提示词和参考图。"
            checked={draft.clearInputAfterSubmit}
            onChange={() => commitSettings({ ...draft, clearInputAfterSubmit: !draft.clearInputAfterSubmit })}
            className="py-3"
          />
          <SettingSwitch
            label="记住输入内容"
            help="重新打开时恢复提示词和参考图；关闭后使用空输入框。"
            checked={draft.persistInputOnRestart}
            onChange={() => commitSettings({ ...draft, persistInputOnRestart: !draft.persistInputOnRestart })}
            className="py-3"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-gray-100 px-4 pb-1 dark:border-white/[0.08]">
        <h4 className="pb-1 pt-4 text-sm font-semibold text-gray-800 dark:text-gray-100">生成与编辑</h4>
        <div className="divide-y divide-gray-100 dark:divide-white/[0.06]">
          <div className="flex items-center justify-between gap-3 py-3">
            <SettingLabel label="参考图编辑" help="点击参考图的「编辑图片」时，询问编辑方式，或直接打开画板、遮罩。" className="mb-0" />
            <div className="w-32 shrink-0">
              <Select
                value={draft.referenceImageEditAction}
                onChange={(val) => commitSettings({ ...draft, referenceImageEditAction: val as AppSettings['referenceImageEditAction'] })}
                options={[
                  { label: '每次询问', value: 'ask' },
                  { label: '画板', value: 'sketch' },
                  { label: '遮罩', value: 'mask' },
                ]}
                className={SELECT_CLASS_NAME}
              />
            </div>
          </div>
          <SettingSwitch
            label="允许优化提示词"
            help="用于 Responses API 和启用 Codex CLI 兼容模式的 Images API。开启后不再附加防改写提示词，允许模型按服务商策略优化提示词。"
            checked={draft.allowPromptRewrite}
            onChange={() => commitSettings({ ...draft, allowPromptRewrite: !draft.allowPromptRewrite })}
            className="py-3"
          />
          <SettingSwitch
            label="复用任务的 API 配置"
            help="复用历史任务时，临时使用该任务的 API 配置；找不到配置时会提示。关闭后继续使用当前 API 配置。"
            checked={draft.reuseTaskApiProfileTemporarily}
            onChange={() => commitSettings({ ...draft, reuseTaskApiProfileTemporarily: !draft.reuseTaskApiProfileTemporarily })}
            className="py-3"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-gray-100 px-4 pb-1 dark:border-white/[0.08]">
        <h4 className="pb-1 pt-4 text-sm font-semibold text-gray-800 dark:text-gray-100">任务与下载</h4>
        <div className="divide-y divide-gray-100 dark:divide-white/[0.06]">
          <SettingSwitch
            label="成功任务显示重试"
            checked={draft.alwaysShowRetryButton}
            onChange={() => commitSettings({ ...draft, alwaysShowRetryButton: !draft.alwaysShowRetryButton })}
            className="py-3"
          />
          <div className="py-3">
            <div className="flex items-center justify-between gap-3">
              <SettingLabel label="重试方式" help="覆盖时保留原任务的创建时间和收藏，清空旧结果和耗时后重新生成。" className="mb-0" />
              <div className="w-32 shrink-0">
                <Select
                  value={draft.retryMode}
                  onChange={(val) => commitSettings({ ...draft, retryMode: val as AppSettings['retryMode'] })}
                  options={[
                    { label: '新建任务', value: 'new' },
                    { label: '覆盖失败任务', value: 'overwriteFailed' },
                    ...(draft.alwaysShowRetryButton ? [{ label: '覆盖任何任务', value: 'overwriteAll' }] : []),
                  ]}
                  className={SELECT_CLASS_NAME}
                />
              </div>
            </div>
            {draft.retryMode === 'overwriteAll' && <p className="mt-2 text-xs text-amber-600 dark:text-amber-500">重试成功任务也会清空旧结果。</p>}
          </div>
          <SettingSwitch
            label="任务通知"
            help="图像生成完成或失败时发送系统通知，需要浏览器允许通知权限。"
            checked={draft.taskCompletionNotification}
            onChange={() => { void toggleTaskCompletionNotification() }}
            className="py-3"
          />
          <div className="flex items-center justify-between gap-3 py-3">
            <SettingLabel label="批量下载" help="选择哪些批量下载入口使用 ZIP 压缩包，其余入口逐张下载。" className="mb-0" />
            <button
              type="button"
              onClick={onOpenZipDownloadRouteManager}
              aria-label="设置批量下载方式"
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-black/[0.04] px-3 py-1.5 text-xs text-gray-700 transition hover:bg-black/[0.07] dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1]"
            >
              {zipDownloadRouteSummary}
              <ChevronRightIcon className="h-3 w-3 text-gray-400" />
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
