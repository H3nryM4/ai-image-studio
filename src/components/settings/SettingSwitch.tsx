import type { ReactNode } from 'react'
import SettingLabel from './SettingLabel'

interface SettingSwitchProps {
  label: string
  help?: string
  checked: boolean
  disabled?: boolean
  onChange: () => void
  className?: string
  switchLabel?: string
  children?: ReactNode
}

export default function SettingSwitch({ label, help, checked, disabled = false, onChange, className = '', switchLabel = label, children }: SettingSwitchProps) {
  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <SettingLabel label={label} help={help} className="mb-0" />
      <div className="flex shrink-0 items-center gap-3">
        {children}
        <button
          type="button"
          onClick={onChange}
          disabled={disabled}
          role="switch"
          aria-checked={checked}
          aria-label={switchLabel}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${checked ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}
        >
          <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-[2px]'}`} />
        </button>
      </div>
    </div>
  )
}
