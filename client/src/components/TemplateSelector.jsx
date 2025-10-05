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
  const selectId = `${idPrefix}-select`
  const selectedOption = options.find((option) => option.id === selectedTemplate) || null

  const handleChange = (event) => {
    if (disabled || event.target.disabled) return
    onSelect?.(event.target.value)
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-sm font-semibold text-purple-700" id={labelId} htmlFor={selectId}>
          {title}
        </label>
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
      <div>
        <select
          id={selectId}
          name={selectId}
          className={`w-full rounded-2xl border border-purple-200 bg-white px-4 py-3 text-sm text-purple-900 shadow-sm transition focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-300 ${
            disabled ? 'cursor-not-allowed bg-purple-50 text-purple-400' : ''
          }`}
          aria-labelledby={labelId}
          aria-describedby={[descriptionId, historyId].filter(Boolean).join(' ') || undefined}
          value={selectedTemplate || ''}
          onChange={handleChange}
          disabled={disabled}
          data-testid={selectId}
        >
          <option value="" disabled>
            Select a template
          </option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        {selectedOption && (
          <p className="mt-2 text-xs text-purple-600" data-testid={`${idPrefix}-selected-description`}>
            {selectedOption.description}
          </p>
        )}
      </div>
    </div>
  )
}

export default TemplateSelector
