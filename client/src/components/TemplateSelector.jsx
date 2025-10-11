import TemplatePreviewThumbnail, {
  getTemplatePreviewVariant
} from './TemplatePreviewThumbnail.jsx'

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
  const previewOption = selectedOption || options[0] || null
  const previewVariant = getTemplatePreviewVariant(previewOption?.id)

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
      {previewOption && (
        <div
          className="space-y-2 rounded-2xl border border-purple-100 bg-white p-4 shadow-sm"
          data-testid={`${idPrefix}-current-preview-card`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-purple-500">
                Preview this style
              </p>
              <p className="text-sm font-semibold text-purple-900">{previewOption.name}</p>
            </div>
            {selectedOption?.id === previewOption.id && !disabled && (
              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-purple-700">
                Selected
              </span>
            )}
          </div>
          <TemplatePreviewThumbnail
            templateId={previewOption.id}
            variant={previewVariant}
            testId={`${idPrefix}-current-preview`}
            className="h-32"
          />
          {previewOption.description && (
            <p className="text-xs text-purple-600">{previewOption.description}</p>
          )}
        </div>
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
          const variant = getTemplatePreviewVariant(option.id)
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
              <TemplatePreviewThumbnail
                templateId={option.id}
                variant={variant}
                testId={`${idPrefix}-preview-${option.id}`}
              />
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
