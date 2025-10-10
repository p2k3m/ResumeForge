function formatItems(items = [], limit = 6) {
  const list = Array.isArray(items) ? items.filter(Boolean) : []
  const visible = list.slice(0, limit)
  const remainder = list.length - visible.length
  return { visible, remainder }
}

const chipToneByType = {
  added: 'border-emerald-200 bg-emerald-50/80 text-emerald-700',
  removed: 'border-rose-200 bg-rose-50/80 text-rose-700',
  changed: 'border-indigo-200 bg-indigo-50/80 text-indigo-700'
}

const iconByType = {
  added: '＋',
  removed: '–',
  changed: '→'
}

function HighlightItems({ highlight }) {
  const { visible, remainder } = formatItems(highlight.items)
  if (visible.length === 0) {
    return (
      <p className="text-xs text-slate-500">No updates captured yet.</p>
    )
  }

  if (highlight.type === 'reasons') {
    return (
      <ul className="list-disc space-y-1 pl-4 text-xs text-slate-600">
        {visible.map((item, index) => (
          <li key={`${highlight.key}-reason-${index}`}>{item}</li>
        ))}
        {remainder > 0 && (
          <li className="font-semibold text-slate-500">+{remainder} more</li>
        )}
      </ul>
    )
  }

  const chipClass = chipToneByType[highlight.type] || 'border-slate-200 bg-slate-50/80 text-slate-700'
  const icon = iconByType[highlight.type] || '•'

  return (
    <div className="flex flex-wrap gap-2">
      {visible.map((item) => (
        <span
          key={`${highlight.key}-${item}`}
          className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${chipClass}`}
        >
          <span aria-hidden="true">{icon}</span>
          <span>{item}</span>
        </span>
      ))}
      {remainder > 0 && (
        <span className="inline-flex items-center rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-600">
          +{remainder} more
        </span>
      )}
    </div>
  )
}

function ChangeLogSummaryPanel({ summary }) {
  if (!summary) {
    return null
  }

  const { highlights = [], categories = [] } = summary
  const hasHighlights = Array.isArray(highlights) && highlights.length > 0
  const hasCategories = Array.isArray(categories) && categories.length > 0

  if (!hasHighlights && !hasCategories) {
    return null
  }

  return (
    <section
      className="space-y-4 rounded-3xl border border-slate-200/70 bg-white/80 p-5 shadow-sm"
      aria-labelledby="change-log-summary-title"
    >
      <header className="space-y-1">
        <p className="caps-label text-xs font-semibold text-slate-500">Change Log Summary</p>
        <h3 id="change-log-summary-title" className="text-lg font-semibold text-slate-900">
          Highlights from accepted enhancements
        </h3>
        <p className="text-sm text-slate-600">
          Quickly review the standout updates applied to your resume after accepting improvements.
        </p>
      </header>

      {hasHighlights && (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {highlights.map((highlight) => (
            <li
              key={highlight.key}
              className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-inner space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">{highlight.label}</p>
                {typeof highlight.count === 'number' && highlight.count > 0 && (
                  <span className="caps-label-tight rounded-full bg-slate-100 px-2 py-0.5 text-[0.6rem] font-semibold text-slate-600">
                    {highlight.count}
                  </span>
                )}
              </div>
              <HighlightItems highlight={highlight} />
            </li>
          ))}
        </ul>
      )}

      {hasCategories && (
        <div className="space-y-3">
          <p className="caps-label text-xs font-semibold text-slate-500">Category rationale</p>
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {categories.map((category) => (
              <li
                key={category.key}
                className="rounded-2xl border border-slate-200 bg-white/90 p-4 space-y-2"
              >
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-900">{category.label}</p>
                  {category.description && (
                    <p className="text-xs text-slate-600">{category.description}</p>
                  )}
                </div>
                {(Array.isArray(category.reasons) && category.reasons.length > 0) && (
                  <ul className="list-disc space-y-1 pl-4 text-xs text-slate-600">
                    {category.reasons.slice(0, 4).map((reason, index) => (
                      <li key={`${category.key}-reason-${index}`}>{reason}</li>
                    ))}
                    {category.reasons.length > 4 && (
                      <li className="font-semibold text-slate-500">+{category.reasons.length - 4} more</li>
                    )}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

export default ChangeLogSummaryPanel
