const TEMPLATE_PREVIEW_VARIANTS = {
  modern: {
    accent: 'bg-gradient-to-r from-purple-500 to-purple-600',
    highlight: 'bg-purple-100',
    bullet: 'bg-purple-400',
    border: 'border-purple-200',
    layout: 'two-column'
  },
  professional: {
    accent: 'bg-blue-600',
    highlight: 'bg-blue-100',
    bullet: 'bg-blue-400',
    border: 'border-blue-200',
    layout: 'two-column'
  },
  classic: {
    accent: 'bg-amber-600',
    highlight: 'bg-amber-100',
    bullet: 'bg-amber-400',
    border: 'border-amber-200',
    layout: 'two-column'
  },
  ats: {
    accent: 'bg-slate-700',
    highlight: 'bg-slate-200',
    bullet: 'bg-slate-500',
    border: 'border-slate-300',
    layout: 'single-column'
  },
  '2025': {
    accent: 'bg-gradient-to-r from-sky-500 to-indigo-500',
    highlight: 'bg-sky-100',
    bullet: 'bg-indigo-400',
    border: 'border-indigo-200',
    layout: 'modular'
  }
}

const DEFAULT_PREVIEW_VARIANT = {
  accent: 'bg-purple-500',
  highlight: 'bg-purple-100',
  bullet: 'bg-purple-400',
  border: 'border-purple-200',
  layout: 'two-column'
}

function TemplatePreviewThumbnail({ variant, testId }) {
  const { accent, highlight, bullet, border, layout } = variant
  const containerBase = `h-28 w-full overflow-hidden rounded-xl border ${border} bg-white p-2 shadow-inner`

  if (layout === 'single-column') {
    return (
      <div className={`${containerBase} flex flex-col gap-2`} data-testid={testId} aria-hidden="true">
        <div className={`h-5 w-2/5 rounded-md ${accent}`}></div>
        <div className="space-y-1">
          <div className={`h-2.5 w-4/5 rounded-full ${highlight}`}></div>
          <div className="h-1.5 w-full rounded-full bg-slate-200"></div>
          <div className="h-1.5 w-11/12 rounded-full bg-slate-200"></div>
        </div>
        <div className="space-y-1">
          <div className={`h-2.5 w-3/5 rounded-full ${highlight}`}></div>
          <div className="h-1.5 w-full rounded-full bg-slate-200"></div>
          <div className="h-1.5 w-10/12 rounded-full bg-slate-200"></div>
        </div>
        <div className="grid grid-cols-2 gap-1 pt-1">
          <div className={`h-2.5 rounded ${highlight}`}></div>
          <div className={`h-2.5 rounded ${highlight}`}></div>
        </div>
      </div>
    )
  }

  if (layout === 'modular') {
    return (
      <div className={`${containerBase} flex flex-col gap-2`} data-testid={testId} aria-hidden="true">
        <div className="flex items-center justify-between">
          <div className={`h-4 w-1/3 rounded-full ${accent}`}></div>
          <div className="flex gap-1">
            <div className={`h-2.5 w-6 rounded-full ${accent}`}></div>
            <div className={`h-2.5 w-6 rounded-full ${highlight}`}></div>
          </div>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-1.5">
          <div className="space-y-1.5">
            <div className={`h-2 w-11/12 rounded-full ${highlight}`}></div>
            <div className="h-1.5 w-full rounded-full bg-slate-200"></div>
            <div className="h-1.5 w-10/12 rounded-full bg-slate-200"></div>
            <div className={`h-8 rounded-lg ${highlight}`}></div>
          </div>
          <div className="space-y-1.5">
            <div className={`h-2 w-3/4 rounded-full ${accent}`}></div>
            <div className="h-1.5 w-full rounded-full bg-slate-200"></div>
            <div className="grid grid-cols-2 gap-1 pt-1">
              <div className={`h-6 rounded ${highlight}`}></div>
              <div className="flex flex-col justify-between rounded bg-slate-100 p-1">
                <div className={`h-1 rounded-full ${accent}`}></div>
                <div className={`h-1 rounded-full ${bullet}`}></div>
                <div className={`h-1 rounded-full ${accent}`}></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`${containerBase} flex gap-2`} data-testid={testId} aria-hidden="true">
      <div className="flex w-2/5 flex-col gap-1.5">
        <div className={`h-6 w-4/5 rounded-md ${accent}`}></div>
        <div className={`h-2.5 w-3/5 rounded-full ${highlight}`}></div>
        <div className="space-y-1 pt-1">
          <div className={`h-2 w-full rounded-full ${highlight}`}></div>
          <div className={`h-2 w-5/6 rounded-full ${highlight}`}></div>
          <div className="space-y-1.5 pt-1">
            <div className={`h-1.5 w-full rounded-full ${bullet}`}></div>
            <div className={`h-1.5 w-4/5 rounded-full ${bullet}`}></div>
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <div className={`h-1.5 w-1.5 rounded-full ${bullet}`}></div>
                <div className="h-1.5 flex-1 rounded-full bg-slate-200"></div>
              </div>
              <div className="flex items-center gap-1">
                <div className={`h-1.5 w-1.5 rounded-full ${bullet}`}></div>
                <div className="h-1.5 flex-1 rounded-full bg-slate-200"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 space-y-1.5">
        <div className={`h-3 w-11/12 rounded-full ${accent}`}></div>
        <div className="space-y-1">
          <div className="h-1.5 w-full rounded-full bg-slate-200"></div>
          <div className="h-1.5 w-10/12 rounded-full bg-slate-200"></div>
          <div className="h-1.5 w-9/12 rounded-full bg-slate-200"></div>
        </div>
        <div className="space-y-1">
          <div className={`h-2 w-3/4 rounded-full ${highlight}`}></div>
          <div className="h-1.5 w-full rounded-full bg-slate-200"></div>
          <div className="h-1.5 w-11/12 rounded-full bg-slate-200"></div>
        </div>
      </div>
    </div>
  )
}

function TemplateSelector({
  options = [],
  selectedTemplate,
  onSelect,
  disabled = false,
  historySummary = '',
  title = 'Template Style',
  description = 'Enhanced CVs and tailored cover letters will follow this selected design.',
  idPrefix = 'template-selector'
}) {
  if (!options.length) return null

  const labelId = `${idPrefix}-label`
  const descriptionId = description ? `${idPrefix}-description` : undefined
  const historyId = historySummary ? `${idPrefix}-history` : undefined
  const selectedOption = options.find((option) => option.id === selectedTemplate) || null

  const handleSelect = (optionId) => {
    if (disabled || optionId === selectedTemplate) return
    onSelect?.(optionId)
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-purple-700" id={labelId}>
          {title}
        </p>
        {description && (
          <p className="text-xs text-purple-600" id={descriptionId}>
            {description}
          </p>
        )}
      </div>
      {historySummary && (
        <p className="text-xs text-purple-500" id={historyId}>
          You tried {historySummary}
        </p>
      )}
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={[descriptionId, historyId].filter(Boolean).join(' ') || undefined}
        className="grid gap-3 sm:grid-cols-2"
        aria-disabled={disabled || undefined}
      >
        {options.map((option) => {
          const isSelected = option.id === selectedTemplate
          const variant = TEMPLATE_PREVIEW_VARIANTS[option.id] || DEFAULT_PREVIEW_VARIANT
          const descriptionElementId = `${idPrefix}-${option.id}-description`

          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-describedby={descriptionElementId}
              onClick={() => handleSelect(option.id)}
              disabled={disabled}
              className={`group relative flex w-full flex-col gap-3 rounded-2xl border bg-white p-4 text-left shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${
                isSelected ? 'border-purple-500 ring-2 ring-purple-200' : 'border-purple-200 hover:border-purple-400 hover:shadow-md'
              } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold text-purple-900">{option.name}</span>
                {(option.badge || (isSelected && !disabled)) && (
                  <div className="flex flex-col items-end gap-1 text-right">
                    {option.badge && (
                      <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-purple-700">
                        {option.badge}
                      </span>
                    )}
                    {isSelected && !disabled && (
                      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-purple-700">
                        Selected
                      </span>
                    )}
                  </div>
                )}
              </div>
              <TemplatePreviewThumbnail variant={variant} testId={`${idPrefix}-preview-${option.id}`} />
              <p className="text-xs text-purple-600" id={descriptionElementId}>
                {option.description}
              </p>
            </button>
          )
        })}
      </div>
      {selectedOption && (
        <p className="text-xs text-purple-600" data-testid={`${idPrefix}-selected-description`}>
          {selectedOption.description}
        </p>
      )}
    </div>
  )
}

export default TemplateSelector
