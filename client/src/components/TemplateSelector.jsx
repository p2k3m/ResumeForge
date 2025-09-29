function TemplateSelector({ options = [], selectedTemplate, onSelect, disabled = false }) {
  if (!options.length) return null

  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-purple-700" htmlFor="template-selector">
        Template Style
      </label>
      <div
        id="template-selector"
        role="radiogroup"
        className="grid grid-cols-1 md:grid-cols-2 gap-3"
        data-testid="template-selector"
        aria-label="Resume template styles"
      >
        {options.map((option) => {
          const isSelected = option.id === selectedTemplate
          const stateClass = isSelected
            ? 'border-purple-500 bg-purple-50 shadow-md'
            : 'border-purple-200 bg-white'

          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-disabled={disabled || undefined}
              onClick={() => onSelect?.(option.id)}
              disabled={disabled}
              className={`text-left rounded-2xl border p-4 transition transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-purple-400 ${stateClass} ${
                disabled ? 'cursor-not-allowed opacity-60' : ''
              }`}
              data-testid={`template-option-${option.id}`}
            >
              <h3 className="text-lg font-semibold text-purple-800">{option.name}</h3>
              <p className="text-sm text-purple-600">{option.description}</p>
              {isSelected && (
                <span className="mt-2 inline-block text-xs font-semibold text-purple-500 uppercase">
                  Selected
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default TemplateSelector
