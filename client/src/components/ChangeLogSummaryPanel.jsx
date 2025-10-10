function formatItems(items = [], limit = 6) {
  const list = Array.isArray(items) ? items.filter(Boolean) : []
  const visible = list.slice(0, limit)
  const remainder = list.length - visible.length
  return { visible, remainder }
}

function normalizeContextText(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length ? trimmed : ''
  }
  return ''
}

function summariseContextSnippet(text, { wordLimit = 48 } = {}) {
  const normalized = normalizeContextText(text).replace(/\s+/g, ' ')
  if (!normalized) {
    return ''
  }

  const words = normalized.split(' ')
  if (words.length <= wordLimit) {
    return normalized
  }

  return `${words.slice(0, wordLimit).join(' ')}…`
}

function areEqualIgnoreCase(a, b) {
  const left = normalizeContextText(a).toLowerCase()
  const right = normalizeContextText(b).toLowerCase()
  if (!left || !right) {
    return false
  }
  return left === right
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

function ChangeLogSummaryPanel({ summary, context = {} }) {
  if (!summary) {
    return null
  }

  const {
    highlights = [],
    categories = [],
    interviewPrepAdvice = ''
  } = summary
  const hasHighlights = Array.isArray(highlights) && highlights.length > 0
  const hasCategories = Array.isArray(categories) && categories.length > 0
  const adviceText = typeof interviewPrepAdvice === 'string'
    ? interviewPrepAdvice.trim()
    : ''

  const jobTitle = normalizeContextText(context.jobTitle)
  const jobDescriptionSnippet = summariseContextSnippet(
    context.jobDescription,
    { wordLimit: 54 }
  )
  const targetTitle = normalizeContextText(context.targetTitle)
  const originalTitle = normalizeContextText(context.originalTitle)
  const targetSummary = normalizeContextText(context.targetSummary)

  const showOriginalContext = Boolean(jobTitle || jobDescriptionSnippet)
  const showTargetContext = Boolean(targetTitle || targetSummary || originalTitle)
  const hasContext = showOriginalContext || showTargetContext

  if (!hasHighlights && !hasCategories && !hasContext && !adviceText) {
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

      {hasContext && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {(showOriginalContext || !showTargetContext) && (
            <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-left">
              <p className="caps-label-tight text-xs font-semibold uppercase tracking-wide text-slate-500">
                Original JD
              </p>
              {jobTitle ? (
                <p className="text-sm font-semibold text-slate-900">{jobTitle}</p>
              ) : (
                <p className="text-sm font-semibold text-slate-700">
                  Original job description not available yet
                </p>
              )}
              {jobDescriptionSnippet ? (
                <p className="text-xs leading-relaxed text-slate-600">{jobDescriptionSnippet}</p>
              ) : (
                <p className="text-xs text-slate-500">
                  Paste the full JD so we can keep its requirements in view.
                </p>
              )}
            </div>
          )}
          {(showTargetContext || !showOriginalContext) && (
            <div className="space-y-2 rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 text-left">
              <p className="caps-label-tight text-xs font-semibold uppercase tracking-wide text-indigo-500">
                What your CV now targets
              </p>
              {targetTitle ? (
                <p className="text-sm font-semibold text-indigo-900">{targetTitle}</p>
              ) : (
                <p className="text-sm font-semibold text-indigo-700">
                  Target designation pending
                </p>
              )}
              {targetSummary ? (
                <p className="text-xs leading-relaxed text-indigo-800/90">{targetSummary}</p>
              ) : (
                <p className="text-xs leading-relaxed text-indigo-700/80">
                  {targetTitle
                    ? 'Updates refocus your positioning on the JD priorities.'
                    : 'Accept improvements to capture the updated positioning.'}
                </p>
              )}
              {originalTitle && targetTitle && !areEqualIgnoreCase(originalTitle, targetTitle) && (
                <p className="text-xs font-semibold text-indigo-600/80">
                  Originally titled: {originalTitle}
                </p>
              )}
              {!targetTitle && originalTitle && (
                <p className="text-xs font-semibold text-indigo-600/80">
                  Currently showing: {originalTitle}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {adviceText && (
        <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/80 p-4 text-sm text-emerald-900">
          <p className="text-sm font-semibold text-emerald-700">Interview prep spotlight</p>
          <p className="mt-1 leading-relaxed">{adviceText}</p>
        </div>
      )}

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
