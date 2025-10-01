import { Fragment, useMemo, useState } from 'react'

const viewOptions = [
  { key: 'split', label: 'Side by side' },
  { key: 'stack', label: 'Sequential' }
]

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normaliseList(items) {
  if (!Array.isArray(items)) return []
  const seen = new Set()
  const output = []
  items.forEach((item) => {
    const text = typeof item === 'string' ? item.trim() : String(item || '').trim()
    if (!text) return
    const key = text.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    output.push(text)
  })
  return output
}

function ChangeComparisonView({
  before,
  after,
  beforeLabel = 'Before',
  afterLabel = 'After',
  summarySegments = [],
  addedItems = [],
  removedItems = [],
  variant = 'compact',
  className = ''
}) {
  const availableSplit = Boolean(before && after)
  const [view, setView] = useState(availableSplit ? 'split' : 'stack')

  const highlightData = useMemo(() => {
    const addedList = normaliseList(addedItems)
    const removedList = normaliseList(removedItems)
    const addedSet = new Set(addedList.map((item) => item.toLowerCase()))
    const removedSet = new Set(removedList.map((item) => item.toLowerCase()))
    const patternSources = [...addedSet, ...removedSet]
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
      .map((item) => escapeRegExp(item))
    const regex = patternSources.length ? new RegExp(`(${patternSources.join('|')})`, 'gi') : null
    return { addedSet, removedSet, regex }
  }, [addedItems, removedItems])

  const renderHighlighted = (text) => {
    if (!text) return null
    if (!highlightData.regex) return text
    const parts = text.split(highlightData.regex)
    return parts.map((part, index) => {
      if (!part) {
        return <Fragment key={`empty-${index}`} />
      }
      const lower = part.toLowerCase()
      if (highlightData.addedSet.has(lower)) {
        return (
          <mark
            key={`added-${index}`}
            className="rounded-md bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-800"
          >
            {part}
          </mark>
        )
      }
      if (highlightData.removedSet.has(lower)) {
        return (
          <mark
            key={`removed-${index}`}
            className="rounded-md bg-rose-100 px-1.5 py-0.5 font-semibold text-rose-800"
          >
            {part}
          </mark>
        )
      }
      return (
        <Fragment key={`text-${index}`}>
          {part}
        </Fragment>
      )
    })
  }

  const hasHighlights = useMemo(() => {
    const segmentCount = Array.isArray(summarySegments) ? summarySegments.length : 0
    return (
      segmentCount > 0 ||
      (Array.isArray(addedItems) && addedItems.length > 0) ||
      (Array.isArray(removedItems) && removedItems.length > 0)
    )
  }, [summarySegments, addedItems, removedItems])

  const containerClass = `space-y-4 ${className}`.trim()
  const baseContentClass =
    variant === 'modal'
      ? 'max-h-72 md:max-h-80 overflow-y-auto whitespace-pre-wrap leading-relaxed'
      : 'whitespace-pre-wrap leading-relaxed'

  const beforeWrapperClass =
    variant === 'modal'
      ? 'rounded-2xl border border-purple-200 bg-purple-50/70 p-4'
      : 'rounded-xl border border-purple-100 bg-purple-50/70 p-3'

  const afterWrapperClass =
    variant === 'modal'
      ? 'rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4'
      : 'rounded-xl border border-indigo-100 bg-indigo-50/60 p-3'

  const summaryList = Array.isArray(summarySegments) ? summarySegments : []

  return (
    <div className={containerClass}>
      {availableSplit && (
        <div className="inline-flex rounded-full border border-purple-200 bg-white/70 p-1 text-xs font-semibold text-purple-600">
          {viewOptions.map((option) => {
            if (option.key === 'split' && !availableSplit) {
              return null
            }
            const active = view === option.key
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setView(option.key)}
                className={`px-3 py-1 rounded-full transition ${
                  active
                    ? 'bg-purple-600 text-white shadow'
                    : 'text-purple-600 hover:bg-purple-100'
                }`}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      )}

      {view === 'split' && availableSplit ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 text-sm text-purple-800">
          {before && (
            <div className={beforeWrapperClass}>
              <p className="text-xs font-semibold uppercase tracking-wide text-purple-500">{beforeLabel}</p>
              <div className={`mt-2 ${baseContentClass}`}>
                {renderHighlighted(before)}
              </div>
            </div>
          )}
          {after && (
            <div className={afterWrapperClass}>
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">{afterLabel}</p>
              <div className={`mt-2 ${baseContentClass}`}>
                {renderHighlighted(after)}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3 text-sm text-purple-800">
          {before && (
            <div className={beforeWrapperClass}>
              <p className="text-xs font-semibold uppercase tracking-wide text-purple-500">{beforeLabel}</p>
              <div className={`mt-2 ${baseContentClass}`}>
                {renderHighlighted(before)}
              </div>
            </div>
          )}
          {after && (
            <div className={afterWrapperClass}>
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">{afterLabel}</p>
              <div className={`mt-2 ${baseContentClass}`}>
                {renderHighlighted(after)}
              </div>
            </div>
          )}
        </div>
      )}

      {hasHighlights && (
        <div className="space-y-3 rounded-2xl border border-purple-100 bg-white/70 p-4">
          <div className="space-y-2">
            {(Array.isArray(addedItems) && addedItems.length > 0) ||
            (Array.isArray(removedItems) && removedItems.length > 0) ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-purple-500">Key highlights</p>
                <div className="flex flex-wrap gap-2">
                  {normaliseList(addedItems).map((item) => (
                    <span
                      key={`added-chip-${item}`}
                      className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1 text-xs font-semibold text-emerald-700"
                    >
                      <span aria-hidden="true">＋</span>
                      {item}
                    </span>
                  ))}
                  {normaliseList(removedItems).map((item) => (
                    <span
                      key={`removed-chip-${item}`}
                      className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50/80 px-3 py-1 text-xs font-semibold text-rose-700"
                    >
                      <span aria-hidden="true">–</span>
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {summaryList.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-purple-500">Section breakdown</p>
                <div className="space-y-2">
                  {summaryList.map((segment, index) => {
                    if (!segment) return null
                    const label = (segment.section || `Section ${index + 1}`).trim()
                    const reasonLines = Array.isArray(segment.reason)
                      ? segment.reason.filter(Boolean)
                      : []
                    const isSkillSegment = /skill|cert/i.test(label)
                    const containerTone = isSkillSegment
                      ? 'border-emerald-200 bg-emerald-50/70'
                      : 'border-slate-200 bg-slate-50/70'
                    return (
                      <div
                        key={`${label}-${index}`}
                        className={`rounded-2xl border ${containerTone} p-3 text-sm text-slate-700`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold text-slate-800">{label}</p>
                          {reasonLines.length > 0 && (
                            <span className="text-xs font-medium text-slate-500">
                              {reasonLines.join(' ')}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {normaliseList(segment.added).map((item) => (
                            <span
                              key={`segment-added-${label}-${item}`}
                              className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-white/70 px-2.5 py-1 text-xs font-semibold text-emerald-700"
                            >
                              <span aria-hidden="true">＋</span>
                              {item}
                            </span>
                          ))}
                          {normaliseList(segment.removed).map((item) => (
                            <span
                              key={`segment-removed-${label}-${item}`}
                              className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-white/70 px-2.5 py-1 text-xs font-semibold text-rose-700"
                            >
                              <span aria-hidden="true">–</span>
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default ChangeComparisonView
