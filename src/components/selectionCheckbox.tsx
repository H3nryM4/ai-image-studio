export default function SelectionCheckbox({ checked, label, onChange }: {
  checked: boolean
  label: string
  onChange: () => void
}) {
  return (
    <label
      data-no-drag-select
      className="absolute right-0 top-0 z-10 flex h-11 w-11 cursor-pointer items-center justify-center"
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <input type="checkbox" checked={checked} onChange={onChange} aria-label={label} className="peer sr-only" />
      <span aria-hidden="true" className={`flex h-5 w-5 items-center justify-center rounded-full border shadow-xs transition-[background-color,border-color,box-shadow] duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-400 peer-focus-visible:ring-offset-2 dark:peer-focus-visible:ring-offset-gray-900 ${checked
        ? 'border-blue-500 bg-blue-500 text-white'
        : 'border-gray-300 bg-white/90 text-transparent hover:border-blue-400 dark:border-gray-500 dark:bg-gray-800/90'
      }`}>
        <svg className={`h-3 w-3 transition-transform duration-150 ${checked ? 'scale-100' : 'scale-75'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      </span>
    </label>
  )
}
