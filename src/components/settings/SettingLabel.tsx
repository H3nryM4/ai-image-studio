import { useTooltip } from '../../hooks/useTooltip'
import ViewportTooltip from '../ViewportTooltip'

export default function SettingLabel({ label, help, className = 'mb-1.5', small = false }: { label: string, help?: string, className?: string, small?: boolean }) {
  const tip = useTooltip()

  return (
    <div className={`flex items-center gap-1.5 ${small ? 'text-xs text-gray-400' : 'text-sm text-gray-600 dark:text-gray-300'} ${className}`}>
      <span>{label}</span>
      {help && (
        <span className="relative inline-flex shrink-0" {...tip.handlers}>
          <button
            type="button"
            aria-label={`${label}说明`}
            onClick={tip.show}
            className="flex h-4 w-4 items-center justify-center rounded-full border border-gray-300 text-[10px] text-gray-400 hover:border-blue-400 hover:text-blue-500 dark:border-gray-600"
          >
            ?
          </button>
          <ViewportTooltip visible={tip.visible} className="w-64 whitespace-normal text-left leading-relaxed">
            {help}
          </ViewportTooltip>
        </span>
      )}
    </div>
  )
}
