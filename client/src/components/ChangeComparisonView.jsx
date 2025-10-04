import { Fragment, useMemo, useState } from 'react'

const viewOptions = [
  { key: 'split', label: 'Side by side' },
  { key: 'stack', label: 'Sequential' }
]

const itemizedChangeTypeLabels = {
  added: 'Added',
  removed: 'Removed',
  replaced: 'Replaced'
}

const itemizedChangeTypeStyles = {
  added: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  removed: 'bg-rose-100 text-rose-700 border border-rose-200',
  replaced: 'bg-indigo-100 text-indigo-700 border border-indigo-200'
}

const summaryActionBadgeClass =
  'inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.35em] text-purple-700'

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

function formatReadableList(items) {
  const list = normaliseList(items)
  if (list.length === 0) return ''
  if (list.length === 1) return list[0]
  if (list.length === 2) return `${list[0]} and ${list[1]}`
  return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`
}

function buildSummaryAction(label, segment = {}) {
  const addedItems = normaliseList(segment.added)
  const removedItems = normaliseList(segment.removed)
  const addedText = formatReadableList(addedItems)
  const removedText = formatReadableList(removedItems)

  if (!addedText && !removedText) {
    return ''
  }

  const lowerLabel = label.toLowerCase()
  const isSkillSegment = /skill|keyword|competenc|cert/i.test(lowerLabel)
  const isDesignationSegment = /designation|title|headline|position|role/i.test(lowerLabel)
  const isExperienceSegment = /experience|achievement|project|impact|work|career|highlight/i.test(
    lowerLabel
  )
  const isSummarySegment = /summary|profile|overview/i.test(lowerLabel)

  if (isSkillSegment) {
    if (addedText && removedText) {
      return `Add these skills: ${addedText}. Retire ${removedText} to keep your keywords on target.`
    }
    if (addedText) {
      return `Add these skills: ${addedText}.`
    }
    return `Retire ${removedText} to keep your skill list focused.`
  }

  if (isDesignationSegment) {
    if (addedText && removedText) {
      return `Change your last designation from ${removedText} to ${addedText}.`
    }
    if (addedText) {
      return `Change your last designation to ${addedText}.`
    }
    return `Retire the ${removedText} designation so your headline matches the target role.`
  }

  if (isExperienceSegment) {
    if (addedText && removedText) {
      return `Expand these highlights: ${addedText}. Refresh the stories covering ${removedText}.`
    }
    if (addedText) {
      return `Expand these highlights: ${addedText}.`
    }
    return `Refresh the stories covering ${removedText}.`
  }

  if (isSummarySegment) {
    if (addedText && removedText) {
      return `Surface these summary hooks: ${addedText}. Phase out ${removedText} for clarity.`
    }
    if (addedText) {
      return `Surface these summary hooks: ${addedText}.`
    }
    return `Trim ${removedText} from the summary to stay concise.`
  }

  if (addedText && removedText) {
    return `Swap ${removedText} with ${addedText}.`
  }
  if (addedText) {
    return `Add ${addedText}.`
  }
  return `Remove ${removedText}.`
}

function normaliseItemizedChanges(changes) {
  if (!Array.isArray(changes)) return []
  const map = new Map()
  changes.forEach((change) => {
    if (!change || typeof change !== 'object') return
    const itemText = typeof change.item === 'string' ? change.item.trim() : ''
    const changeType =
      typeof change.changeType === 'string' ? change.changeType.trim().toLowerCase() : ''
    if (!itemText || !changeType) return
    const key = `${changeType}::${itemText.toLowerCase()}`
    const entry = map.get(key) || { item: itemText, changeType, reasons: [] }
    const reasonList = normaliseList(
      Array.isArray(change.reasons)
        ? change.reasons
        : typeof change.reason === 'string'
          ? [change.reason]
          : []
    )
    reasonList.forEach((reason) => {
      if (!reason) return
      const lower = reason.toLowerCase()
      if (!entry.reasons.some((existing) => existing.toLowerCase() === lower)) {
        entry.reasons.push(reason)
      }
    })
    map.set(key, entry)
  })
  const changeTypeOrder = { added: 0, replaced: 1, removed: 2 }
  return Array.from(map.values()).sort((a, b) => {
    const orderA = changeTypeOrder[a.changeType] ?? 99
    const orderB = changeTypeOrder[b.changeType] ?? 99
    if (orderA !== orderB) {
      return orderA - orderB
    }
    return a.item.localeCompare(b.item, undefined, { sensitivity: 'base' })
  })
}

function ChangeComparisonView({
  before,
  after,
  beforeLabel = 'Before',
  afterLabel = 'After',
  summarySegments = [],
  addedItems = [],
  removedItems = [],
  itemizedChanges = [],
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

  const normalizedItemizedChanges = useMemo(
    () => normaliseItemizedChanges(itemizedChanges),
    [itemizedChanges]
  )

  const hasItemizedChanges = normalizedItemizedChanges.length > 0

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

      {hasItemizedChanges && (
        <div className="space-y-3 rounded-2xl border border-indigo-100 bg-white/75 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">
              Itemised change log
            </p>
            <span className="text-xs font-semibold text-indigo-600">
              {normalizedItemizedChanges.length} item
              {normalizedItemizedChanges.length === 1 ? '' : 's'}
            </span>
          </div>
          <ul className="space-y-3">
            {normalizedItemizedChanges.map((change) => (
              <li
                key={`${change.changeType}-${change.item}`}
                className="rounded-xl border border-slate-200 bg-white/85 p-3 text-sm text-slate-700"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="font-semibold text-slate-800">{change.item}</p>
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                      itemizedChangeTypeStyles[change.changeType] ||
                      'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}
                  >
                    {itemizedChangeTypeLabels[change.changeType] || 'Updated'}
                  </span>
                </div>
                {change.reasons.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-slate-600 list-disc pl-5">
                    {change.reasons.map((reason, index) => (
                      <li key={`${change.changeType}-${change.item}-reason-${index}`}>{reason}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
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
                    const actionableSummary = buildSummaryAction(label, segment)
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
                        {actionableSummary && (
                          <p className="mt-3 text-xs font-semibold text-slate-600">
                            <span className={summaryActionBadgeClass}>Action</span>
                            <span className="ml-2 align-middle">{actionableSummary}</span>
                          </p>
                        )}
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
