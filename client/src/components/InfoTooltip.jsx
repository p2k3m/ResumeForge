import { useMemo, useState } from 'react'

const variantThemes = {
  dark: {
    bubble:
      'bg-slate-900/95 text-white shadow-[0_12px_30px_rgba(15,23,42,0.45)] ring-1 ring-white/10',
    trigger:
      'text-white/90 border-white/40 bg-white/15 hover:bg-white/25 focus-visible:ring-white/60',
  },
  light: {
    bubble:
      'bg-white text-slate-700 shadow-[0_20px_45px_rgba(15,23,42,0.18)] ring-1 ring-slate-200/70',
    trigger:
      'text-slate-600 border-slate-300 bg-white/90 hover:bg-white focus-visible:ring-slate-400/70',
  },
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function hashString(value) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    const char = value.charCodeAt(index)
    hash = (hash << 5) - hash + char
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

function InfoTooltip({
  label = 'Show explanation',
  content,
  className = '',
  align = 'left',
  variant = 'dark',
  maxWidthClass = 'w-64',
}) {
  const [open, setOpen] = useState(false)
  const tooltipId = useMemo(() => {
    const baseLabel = typeof label === 'string' ? label.trim() : ''
    const labelSlug = baseLabel ? slugify(baseLabel) : 'tooltip'
    const contentKey =
      typeof content === 'string' && content.trim().length > 0
        ? hashString(content.trim())
        : ''
    return `rf-tooltip-${labelSlug}${contentKey ? `-${contentKey}` : ''}`
  }, [label, content])
  const theme = variantThemes[variant] || variantThemes.dark

  const show = () => setOpen(true)
  const hide = () => setOpen(false)

  return (
    <div
      className={`relative inline-flex${className ? ` ${className}` : ''}`}
      onMouseLeave={hide}
    >
      <button
        type="button"
        aria-label={label}
        aria-describedby={tooltipId}
        onMouseEnter={show}
        onFocus={show}
        onBlur={hide}
        className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-bold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${theme.trigger}`}
      >
        <span aria-hidden="true">i</span>
      </button>
      <div
        id={tooltipId}
        role="tooltip"
        aria-hidden={!open}
        className={`pointer-events-none absolute z-40 mt-2 ${align === 'left' ? 'left-0' : 'right-0'} top-full origin-top ${maxWidthClass} rounded-xl px-4 py-3 text-left text-xs font-medium leading-relaxed backdrop-blur transition-all duration-150 ${theme.bubble} ${open ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0'}`}
      >
        {content}
      </div>
    </div>
  )
}

export default InfoTooltip
