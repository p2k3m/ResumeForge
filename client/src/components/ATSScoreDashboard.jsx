import ATSScoreCard from './ATSScoreCard.jsx'
import InfoTooltip from './InfoTooltip.jsx'
import { buildMetricTip } from '../utils/actionableAdvice.js'

function clampScore(score) {
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return null
  }
  return Math.min(Math.max(Math.round(score), 0), 100)
}

function normalizeSkills(skills) {
  if (!Array.isArray(skills)) {
    return []
  }
  return skills
    .map((skill) => {
      if (typeof skill === 'string') return skill.trim()
      if (skill === null || skill === undefined) return ''
      return String(skill).trim()
    })
    .filter(Boolean)
}

function summariseSkills(skills, limit = 5) {
  const list = normalizeSkills(skills)
  if (list.length <= limit) {
    return list.join(', ')
  }
  const visible = list.slice(0, limit)
  const remaining = list.length - visible.length
  return `${visible.join(', ')}, +${remaining} more`
}

function normalizeText(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length ? trimmed : ''
  }
  if (value === null || value === undefined) {
    return ''
  }
  return String(value || '').trim()
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeText(entry)).filter(Boolean)
  }
  const text = normalizeText(value)
  return text ? [text] : []
}

function normalizeImprovementSegment(segment = {}) {
  if (!segment || typeof segment !== 'object') return null
  const section = normalizeText(segment.section || segment.label || segment.key)
  const added = normalizeList(segment.added)
  const removed = normalizeList(segment.removed)
  const reasons = normalizeList(segment.reason)
  if (!section && !added.length && !removed.length && !reasons.length) {
    return null
  }
  return { section, added, removed, reasons }
}

function formatReadableList(items) {
  const list = Array.isArray(items) ? items.map((item) => normalizeText(item)).filter(Boolean) : []
  if (!list.length) return ''
  if (list.length === 1) return list[0]
  if (list.length === 2) return `${list[0]} and ${list[1]}`
  return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`
}

function stripEndingPunctuation(value) {
  if (typeof value !== 'string') return ''
  return value.replace(/[.!?]+$/u, '')
}

function formatDelta(originalScore, enhancedScore) {
  if (typeof originalScore !== 'number' || typeof enhancedScore !== 'number') {
    return null
  }
  const delta = enhancedScore - originalScore
  if (!Number.isFinite(delta) || delta === 0) return null
  const prefix = delta > 0 ? '+' : ''
  return `${prefix}${delta.toFixed(0)} pts`
}

const selectionFactorToneStyles = {
  positive: { bullet: 'bg-emerald-500', label: 'text-emerald-700' },
  negative: { bullet: 'bg-amber-500', label: 'text-amber-700' },
  info: { bullet: 'bg-sky-500', label: 'text-sky-700' },
  neutral: { bullet: 'bg-slate-400', label: 'text-slate-700' },
  default: { bullet: 'bg-slate-400', label: 'text-slate-700' }
}

function ATSScoreDashboard({
  metrics = [],
  baselineMetrics = [],
  match,
  metricActionMap,
  onImproveMetric,
  improvementState = {}
}) {
  const metricList = Array.isArray(metrics)
    ? metrics
    : Object.values(metrics || {})
  const baselineList = Array.isArray(baselineMetrics)
    ? baselineMetrics
    : Object.values(baselineMetrics || {})
  const baselineMap = new Map(
    baselineList
      .filter((metric) => metric?.category)
      .map((metric) => [metric.category, metric])
  )
  if (!metricList.length) {
    return null
  }

  const displayMetrics = metricList.map((metric) => {
    const baselineMetric = metric?.category ? baselineMap.get(metric.category) || {} : {}
    const beforeScore = clampScore(
      typeof metric?.beforeScore === 'number'
        ? metric.beforeScore
        : typeof baselineMetric?.score === 'number'
          ? baselineMetric.score
          : typeof metric?.score === 'number'
            ? metric.score
            : null
    )
    const afterScore = clampScore(
      typeof metric?.afterScore === 'number'
        ? metric.afterScore
        : typeof metric?.score === 'number'
          ? metric.score
          : null
    )
    const enrichedMetric = {
      ...metric,
      beforeScore,
      afterScore,
      beforeRatingLabel:
        metric?.beforeRatingLabel || baselineMetric?.ratingLabel || baselineMetric?.rating || metric?.ratingLabel || null,
      afterRatingLabel: metric?.afterRatingLabel || metric?.ratingLabel,
      deltaText: formatDelta(beforeScore, afterScore)
    }
    const metricWithTip = { ...enrichedMetric, tip: buildMetricTip(enrichedMetric, { match }) }

    if (!metricActionMap || typeof onImproveMetric !== 'function') {
      return { metric: metricWithTip, improvement: null }
    }

    const category = typeof metric?.category === 'string' ? metric.category.trim() : ''
    const config = category ? metricActionMap.get(category) || null : null

    if (!config || !config.actionKey) {
      return { metric: metricWithTip, improvement: null }
    }

    const busy = improvementState.activeKey === config.actionKey
    const locked = Boolean(improvementState.locked)
    const disabledKeys = Array.isArray(improvementState.disabledKeys)
      ? improvementState.disabledKeys
      : []
    const disabled = locked || busy || disabledKeys.includes(config.actionKey)
    const lockMessage = locked ? improvementState.lockMessage || '' : ''

    return {
      metric: metricWithTip,
      improvement: {
        key: config.actionKey,
        label: config.label,
        helper: config.helper,
        onClick: () => onImproveMetric(config.actionKey),
        disabled,
        busy,
        lockMessage
      }
    }
  })

  const originalScoreValue = clampScore(
    typeof match?.atsScoreBefore === 'number'
      ? match.atsScoreBefore
      : typeof match?.originalScore === 'number'
        ? match.originalScore
        : null
  )
  const enhancedScoreValue = clampScore(
    typeof match?.atsScoreAfter === 'number' ? match.atsScoreAfter : null
  )
  const matchDelta =
    typeof originalScoreValue === 'number' && typeof enhancedScoreValue === 'number'
      ? formatDelta(originalScoreValue, enhancedScoreValue)
      : null
  const atsScoreSummary = (() => {
    if (originalScoreValue !== null && enhancedScoreValue !== null) {
      return `ATS score moved from ${originalScoreValue}% to ${enhancedScoreValue}%${matchDelta ? ` (${matchDelta})` : ''}.`
    }
    if (originalScoreValue !== null) {
      return `Current ATS score before enhancements: ${originalScoreValue}%.`
    }
    if (enhancedScoreValue !== null) {
      return `Current ATS score after enhancements: ${enhancedScoreValue}%.`
    }
    return null
  })()
  const selectionProbabilityBeforeValue =
    typeof match?.selectionProbabilityBefore === 'number'
      ? match.selectionProbabilityBefore
      : null
  const selectionProbabilityBeforeMeaning =
    match?.selectionProbabilityBeforeMeaning ||
    (typeof selectionProbabilityBeforeValue === 'number'
      ? selectionProbabilityBeforeValue >= 75
        ? 'High'
        : selectionProbabilityBeforeValue >= 55
          ? 'Medium'
          : 'Low'
      : null)
  const selectionProbabilityBeforeRationale = match?.selectionProbabilityBeforeRationale ||
    (selectionProbabilityBeforeMeaning && typeof selectionProbabilityBeforeValue === 'number'
      ? `Projected ${selectionProbabilityBeforeMeaning.toLowerCase()} probability (${selectionProbabilityBeforeValue}%) that this resume will be shortlisted for the JD.`
      : null)
  const selectionProbabilityAfterValue =
    typeof match?.selectionProbabilityAfter === 'number'
      ? match.selectionProbabilityAfter
      : typeof match?.selectionProbability === 'number'
        ? match.selectionProbability
        : null
  const selectionProbabilityAfterMeaning =
    match?.selectionProbabilityAfterMeaning ||
    match?.selectionProbabilityMeaning ||
    (typeof selectionProbabilityAfterValue === 'number'
      ? selectionProbabilityAfterValue >= 75
        ? 'High'
        : selectionProbabilityAfterValue >= 55
          ? 'Medium'
          : 'Low'
      : null)
  const selectionProbabilityAfterRationale =
    match?.selectionProbabilityAfterRationale ||
    match?.selectionProbabilityRationale ||
    (selectionProbabilityAfterMeaning && typeof selectionProbabilityAfterValue === 'number'
      ? `Projected ${selectionProbabilityAfterMeaning.toLowerCase()} probability (${selectionProbabilityAfterValue}%) that this resume will be shortlisted for the JD.`
      : null)
  const hasSelectionProbability =
    typeof selectionProbabilityBeforeValue === 'number' || typeof selectionProbabilityAfterValue === 'number'
  const selectionProbabilityDelta =
    typeof selectionProbabilityBeforeValue === 'number' && typeof selectionProbabilityAfterValue === 'number'
      ? formatDelta(selectionProbabilityBeforeValue, selectionProbabilityAfterValue)
      : null
  const selectionProbabilityFactors = Array.isArray(match?.selectionProbabilityFactors)
    ? match.selectionProbabilityFactors
        .map((factor, index) => {
          if (!factor) return null
          if (typeof factor === 'string') {
            return {
              key: `selection-factor-${index}`,
              label: normalizeText(factor),
              detail: null,
              impact: 'neutral'
            }
          }
          if (typeof factor === 'object') {
            const label = normalizeText(factor.label || factor.title)
            if (!label) return null
            const detail = normalizeText(factor.detail || factor.message || factor.description)
            const impact =
              factor.impact === 'positive' ||
              factor.impact === 'negative' ||
              factor.impact === 'info'
                ? factor.impact
                : 'neutral'
            return {
              key: normalizeText(factor.key) || `selection-factor-${index}`,
              label,
              detail: detail || null,
              impact
            }
          }
          return null
        })
        .filter((factor) => factor && factor.label)
    : []
  const selectionProbabilitySummary = (() => {
    if (typeof selectionProbabilityBeforeValue === 'number' && typeof selectionProbabilityAfterValue === 'number') {
      return `Selection chance moved from ${selectionProbabilityBeforeValue}% to ${selectionProbabilityAfterValue}%${selectionProbabilityDelta ? ` (${selectionProbabilityDelta})` : ''}.`
    }
    if (typeof selectionProbabilityBeforeValue === 'number') {
      return `Selection chance before enhancements: ${selectionProbabilityBeforeValue}%.`
    }
    if (typeof selectionProbabilityAfterValue === 'number') {
      return `Selection chance after enhancements: ${selectionProbabilityAfterValue}%.`
    }
    return null
  })()
  const hasComparableScores =
    typeof originalScoreValue === 'number' && typeof enhancedScoreValue === 'number'
  const scoreBands = hasComparableScores
    ? [
        {
          label: 'ATS Score Before',
          value: originalScoreValue,
          tone: 'bg-indigo-500',
          textTone: 'text-indigo-700'
        },
        {
          label: 'ATS Score After',
          value: enhancedScoreValue,
          tone: 'bg-emerald-500',
          textTone: 'text-emerald-700'
        }
      ]
    : []

  const originalScoreDescription =
    match?.atsScoreBeforeExplanation ||
    match?.originalScoreExplanation ||
    'Weighted ATS composite for your uploaded resume across layout, readability, impact, crispness, and other JD-aligned metrics.'
  const enhancedScoreDescription =
    match?.atsScoreAfterExplanation ||
    match?.enhancedScoreExplanation ||
    'Updated weighted ATS composite after applying ResumeForge improvements tied to the job description.'
  const scoreComparisonDescription =
    'Shows the weighted ATS composite before and after improvements so you can see how structural and keyword fixes closed gaps.'
  const selectionProbabilityDescription =
    'Estimates shortlist odds before and after using designation match, JD keyword coverage, experience alignment, task impact, and highlight strength.'

  const snapshotSegments = (() => {
    const segments = []
    const formatPercent = (value) => (typeof value === 'number' ? `${value}%` : '—')

    if (originalScoreValue !== null || enhancedScoreValue !== null) {
      const hasBeforeScore = typeof originalScoreValue === 'number'
      const hasAfterScore = typeof enhancedScoreValue === 'number'
      segments.push({
        id: 'ats',
        label: 'ATS Score',
        beforeValue: originalScoreValue,
        afterValue: enhancedScoreValue,
        beforeLabel: 'Before',
        afterLabel: 'After',
        delta: typeof originalScoreValue === 'number' && typeof enhancedScoreValue === 'number' ? matchDelta : null,
        beforeTone: 'text-indigo-700',
        afterTone: 'text-emerald-700',
        beforeBadgeClass: 'border border-indigo-200 bg-indigo-50 text-indigo-700',
        afterBadgeClass: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
        beforeLabelClass: hasBeforeScore ? 'text-indigo-600' : 'text-slate-500',
        afterLabelClass: hasAfterScore ? 'text-emerald-600' : 'text-slate-500',
        beforeAccentClass: hasBeforeScore
          ? 'border border-indigo-200 bg-indigo-50'
          : 'border border-slate-200 bg-slate-50',
        afterAccentClass: hasAfterScore
          ? 'border border-emerald-200 bg-emerald-50'
          : 'border border-slate-200 bg-slate-50',
        format: formatPercent
      })
    }

    if (hasSelectionProbability) {
      const hasBeforeSelection = typeof selectionProbabilityBeforeValue === 'number'
      const hasAfterSelection = typeof selectionProbabilityAfterValue === 'number'
      segments.push({
        id: 'selection',
        label: 'Selection Chance',
        beforeValue: selectionProbabilityBeforeValue,
        afterValue: selectionProbabilityAfterValue,
        beforeLabel: 'Before',
        afterLabel: 'After',
        delta:
          typeof selectionProbabilityBeforeValue === 'number' && typeof selectionProbabilityAfterValue === 'number'
            ? selectionProbabilityDelta
            : null,
        beforeMeaning: selectionProbabilityBeforeMeaning ? `${selectionProbabilityBeforeMeaning} Outlook` : null,
        afterMeaning: selectionProbabilityAfterMeaning ? `${selectionProbabilityAfterMeaning} Outlook` : null,
        beforeTone: 'text-indigo-700',
        afterTone: 'text-emerald-700',
        beforeBadgeClass: 'border border-indigo-200 bg-indigo-50 text-indigo-700',
        afterBadgeClass: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
        beforeLabelClass: hasBeforeSelection ? 'text-indigo-600' : 'text-slate-500',
        afterLabelClass: hasAfterSelection ? 'text-emerald-600' : 'text-slate-500',
        beforeAccentClass: hasBeforeSelection
          ? 'border border-indigo-200 bg-indigo-50'
          : 'border border-slate-200 bg-slate-50',
        afterAccentClass: hasAfterSelection
          ? 'border border-emerald-200 bg-emerald-50'
          : 'border border-slate-200 bg-slate-50',
        format: formatPercent
      })
    }

    return segments
  })()

  const missingSkills = normalizeSkills(match?.missingSkills)
  const addedSkills = normalizeSkills(match?.addedSkills)

  const selectionBeforeAvailable = typeof selectionProbabilityBeforeValue === 'number'
  const selectionAfterAvailable = typeof selectionProbabilityAfterValue === 'number'
  const selectionBeforeAccent = selectionBeforeAvailable
    ? 'border-indigo-200 bg-indigo-50'
    : 'border-slate-200 bg-slate-50'
  const selectionBeforeLabelTone = selectionBeforeAvailable ? 'text-indigo-600' : 'text-slate-500'
  const selectionBeforeValueTone = selectionBeforeAvailable ? 'text-indigo-700' : 'text-slate-500'
  const selectionAfterAccent = selectionAfterAvailable
    ? 'border-emerald-200 bg-emerald-50'
    : 'border-slate-200 bg-slate-50'
  const selectionAfterLabelTone = selectionAfterAvailable ? 'text-emerald-600' : 'text-slate-500'
  const selectionAfterValueTone = selectionAfterAvailable ? 'text-emerald-700' : 'text-slate-500'
  const selectionDeltaTone = (() => {
    if (!selectionProbabilityDelta) {
      return 'bg-slate-200 text-slate-700'
    }
    if (!selectionBeforeAvailable || !selectionAfterAvailable) {
      return 'bg-slate-200 text-slate-700'
    }
    const deltaRaw = selectionProbabilityAfterValue - selectionProbabilityBeforeValue
    if (!Number.isFinite(deltaRaw)) {
      return 'bg-slate-200 text-slate-700'
    }
    if (deltaRaw > 0) {
      return 'bg-emerald-100 text-emerald-700'
    }
    if (deltaRaw < 0) {
      return 'bg-rose-100 text-rose-700'
    }
    return 'bg-slate-200 text-slate-700'
  })()

  const matchStatusStyles = {
    match: {
      label: 'Match',
      badgeClass:
        'inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700'
    },
    mismatch: {
      label: 'Mismatch',
      badgeClass:
        'inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700'
    }
  }

  const originalStatus = missingSkills.length > 0 ? 'mismatch' : 'match'
  const enhancedStatus = missingSkills.length > 0 ? 'mismatch' : 'match'

  const originalAdvice =
    originalStatus === 'mismatch'
      ? `You are missing these skills: ${summariseSkills(missingSkills)}`
      : addedSkills.length > 0
        ? `ResumeForge added: ${summariseSkills(addedSkills)}`
        : 'All priority JD skills are covered.'

  const enhancedAdvice =
    enhancedStatus === 'mismatch'
      ? `Still missing these skills: ${summariseSkills(missingSkills)}`
      : addedSkills.length > 0
        ? `Now highlighting: ${summariseSkills(addedSkills)}`
        : 'Enhanced draft fully aligns with the JD keywords.'

  const improvementSegments = Array.isArray(match?.improvementSummary) ? match.improvementSummary : []
  const normalizedImprovementSegments = improvementSegments
    .map((segment) => normalizeImprovementSegment(segment))
    .filter(Boolean)

  const improvementDetails = normalizedImprovementSegments.map((segment, index) => {
    const changeParts = []
    if (segment.added.length) {
      const additions = formatReadableList(segment.added)
      if (additions) {
        changeParts.push(`Added ${additions}.`)
      }
    }
    if (segment.removed.length) {
      const removals = formatReadableList(segment.removed)
      if (removals) {
        changeParts.push(`Removed ${removals}.`)
      }
    }
    const changeSummary = changeParts.length
      ? changeParts.join(' ')
      : 'Refined this area to tighten alignment with the job description.'

    const reasonText = segment.reasons.length
      ? segment.reasons.join(' ')
      : 'Keeps your positioning focused on what this employer values most.'

    const focusSource = segment.reasons[0] || segment.added[0] || segment.section || `update ${index + 1}`
    const interviewFocus = stripEndingPunctuation(focusSource)
    const interviewAdvice = interviewFocus
      ? `Interview prep: Prepare a concise example that demonstrates ${interviewFocus}.`
      : `Interview prep: Prepare a concise example that demonstrates your impact in ${segment.section || 'this area'}.`

    return {
      id: `${segment.section || 'segment'}-${index}`,
      section: segment.section || `Update ${index + 1}`,
      changeSummary,
      reasonText,
      interviewAdvice
    }
  })

  const improvementNarrative = improvementDetails.length
    ? improvementDetails
        .map((detail) => `${detail.section}: ${detail.reasonText}`)
        .join(' ')
    : match?.selectionProbabilityRationale ||
      (hasComparableScores
        ? `Score moved from ${originalScoreValue}% to ${enhancedScoreValue}%, lifting selection odds by covering more of the JD's required keywords and achievements.`
        : 'Enhanced resume aligns more closely with the job description, increasing selection odds.')

  return (
    <section className="space-y-6" aria-label="ATS dashboard" aria-live="polite">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-slate-900">ATS Performance Dashboard</h2>
          <p className="text-sm text-slate-600">
            Track how your resume aligns with the job description across keyword, structure, readability, and skill coverage metrics.
          </p>
        </div>
        {match && (
          <div
            className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
            data-testid="dashboard-live-indicator"
          >
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
            <span>Live analysis</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {displayMetrics.map(({ metric, improvement }) => (
          <ATSScoreCard
            key={metric.category}
            metric={metric}
            improvement={improvement}
          />
        ))}
      </div>

      {match && (
        <div
          className={`grid grid-cols-1 gap-4 ${hasSelectionProbability ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}
          aria-label="match comparison"
        >
          {(atsScoreSummary || selectionProbabilitySummary) && (
            <div
              className="md:col-span-full rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              data-testid="score-summary-banner"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Score Snapshot</p>
              {atsScoreSummary && (
                <p className="mt-2 text-sm text-slate-700" data-testid="ats-score-summary">
                  {atsScoreSummary}
                </p>
              )}
              {selectionProbabilitySummary && (
                <p className="mt-1 text-sm text-slate-700" data-testid="selection-summary">
                  {selectionProbabilitySummary}
                </p>
              )}
              {snapshotSegments.length > 0 && (
                <div
                  className={`mt-4 grid gap-3 ${snapshotSegments.length > 1 ? 'sm:grid-cols-2' : 'sm:grid-cols-1'}`}
                  data-testid="score-summary-metrics"
                >
                  {snapshotSegments.map((segment) => (
                    <div
                      key={segment.id}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                      data-testid={`${segment.id}-summary-card`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-xs font-semibold uppercase text-slate-500">
                          {segment.label}
                        </p>
                        {segment.delta && (
                          <span
                            className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700"
                            data-testid={`${segment.id}-summary-delta`}
                          >
                            {segment.delta}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        <span className="flex items-center gap-1 text-indigo-600">
                          <span className="h-2 w-2 rounded-full bg-indigo-500" aria-hidden="true" />
                          Before
                        </span>
                        <span className="flex items-center gap-1 text-emerald-600">
                          <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                          After
                        </span>
                      </div>
                      <dl className="mt-3 grid grid-cols-2 gap-4">
                        <div>
                          <dt className={`text-xs font-semibold uppercase tracking-wide ${segment.beforeLabelClass}`}>
                            {segment.beforeLabel}
                          </dt>
                          <dd className="mt-2" data-testid={`${segment.id}-summary-before`}>
                            <div className={`rounded-md px-3 py-2 ${segment.beforeAccentClass}`}>
                              <span className={`text-2xl font-semibold ${segment.beforeTone}`}>
                                {segment.format(segment.beforeValue)}
                              </span>
                            </div>
                          </dd>
                          {segment.beforeMeaning && (
                            <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-medium ${segment.beforeBadgeClass}`}>
                              {segment.beforeMeaning}
                            </span>
                          )}
                        </div>
                        <div>
                          <dt className={`text-xs font-semibold uppercase tracking-wide ${segment.afterLabelClass}`}>
                            {segment.afterLabel}
                          </dt>
                          <dd className="mt-2" data-testid={`${segment.id}-summary-after`}>
                            <div className={`rounded-md px-3 py-2 ${segment.afterAccentClass}`}>
                              <span className={`text-2xl font-semibold ${segment.afterTone}`}>
                                {segment.format(segment.afterValue)}
                              </span>
                            </div>
                          </dd>
                          {segment.afterMeaning && (
                            <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-medium ${segment.afterBadgeClass}`}>
                              {segment.afterMeaning}
                            </span>
                          )}
                        </div>
                      </dl>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">ATS Score Before</p>
              <InfoTooltip
                variant="light"
                align="right"
                label="How is the ATS score before calculated?"
                content={originalScoreDescription}
              />
            </div>
            <p className="mt-3 text-4xl font-semibold text-indigo-900" data-testid="original-score">
              {typeof originalScoreValue === 'number' ? `${originalScoreValue}%` : '—'}
            </p>
            <p className="mt-2 text-sm text-indigo-700" data-testid="original-title">
              {match.originalTitle || 'Initial resume title unavailable.'}
            </p>
            <div className="mt-4 space-y-2">
              <span
                className={matchStatusStyles[originalStatus].badgeClass}
                data-testid="original-match-status"
              >
                {matchStatusStyles[originalStatus].label}
              </span>
              <p className="text-sm text-indigo-800" data-testid="original-match-advice">
                {originalAdvice}
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">ATS Score After</p>
                  <p className="mt-3 text-4xl font-semibold text-emerald-900" data-testid="enhanced-score">
                    {typeof enhancedScoreValue === 'number' ? `${enhancedScoreValue}%` : '—'}
                  </p>
                </div>
                <InfoTooltip
                  variant="light"
                  align="left"
                  label="How is the ATS score after calculated?"
                  content={enhancedScoreDescription}
                />
              </div>
              {matchDelta && (
                <span className="self-start rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700" data-testid="match-delta">
                  {matchDelta}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-emerald-700" data-testid="enhanced-title">
              {match.modifiedTitle || match.originalTitle || 'Enhanced resume title coming soon.'}
            </p>
            <div className="mt-4 space-y-2">
              <span
                className={matchStatusStyles[enhancedStatus].badgeClass}
                data-testid="enhanced-match-status"
              >
                {matchStatusStyles[enhancedStatus].label}
              </span>
              <p className="text-sm text-emerald-800" data-testid="enhanced-match-advice">
                {enhancedAdvice}
              </p>
            </div>
          </div>
          {hasComparableScores && (
            <div
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              data-testid="score-comparison-chart"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Score Comparison</p>
                  <p className="mt-2 text-sm text-slate-600">
                    Visualise how the enhanced version closes the gap against ATS expectations.
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <InfoTooltip
                    variant="light"
                    align="right"
                    label="What does the score comparison show?"
                    content={scoreComparisonDescription}
                  />
                  {matchDelta && (
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                      {matchDelta}
                    </span>
                  )}
                </div>
              </div>
              <div
                className="mt-4 space-y-4"
                role="img"
                aria-label={`ATS score before ${originalScoreValue}%, ATS score after ${enhancedScoreValue}%`}
              >
                <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <span className="flex items-center gap-1 text-indigo-600">
                    <span className="h-2 w-2 rounded-full bg-indigo-500" aria-hidden="true" />
                    Before
                  </span>
                  <span className="flex items-center gap-1 text-emerald-600">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                    After
                  </span>
                </div>
                {scoreBands.map(({ label, value, tone, textTone }) => (
                  <div key={label} className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-500">
                      <span>{label}</span>
                      <span className={textTone}>{value}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-200">
                      <div
                        className={`h-full rounded-full ${tone}`}
                        style={{ width: `${value}%` }}
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm text-slate-700" data-testid="score-improvement-narrative">
                {improvementNarrative}
              </p>
            </div>
          )}
          {hasSelectionProbability && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selection Probability</p>
                <InfoTooltip
                  variant="light"
                  align="right"
                  label="How is the selection probability estimated?"
                  content={selectionProbabilityDescription}
                />
              </div>
              <div className="mt-4 space-y-4">
                <div className={`rounded-lg border p-4 ${selectionBeforeAccent}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={`text-xs font-semibold uppercase tracking-wide ${selectionBeforeLabelTone}`}>
                        Selection % Before
                      </p>
                      <div className="mt-2 flex items-baseline gap-3">
                        <p className={`text-3xl font-semibold ${selectionBeforeValueTone}`}>
                          {selectionBeforeAvailable ? `${selectionProbabilityBeforeValue}%` : '—'}
                        </p>
                        {selectionBeforeAvailable && selectionProbabilityBeforeMeaning && (
                          <span className="rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs font-medium text-indigo-600">
                            {selectionProbabilityBeforeMeaning} Outlook
                          </span>
                        )}
                      </div>
                    </div>
                    {selectionProbabilityDelta && (
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${selectionDeltaTone}`}>
                        {selectionProbabilityDelta}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {selectionBeforeAvailable
                      ? selectionProbabilityBeforeRationale ||
                        'Baseline estimate derived from your uploaded resume before enhancements.'
                      : 'Baseline estimate will appear once we parse your original resume.'}
                  </p>
                </div>
                <div className={`rounded-lg border p-4 ${selectionAfterAccent}`}>
                  <p className={`text-xs font-semibold uppercase tracking-wide ${selectionAfterLabelTone}`}>
                    Selection % After
                  </p>
                  <div className="mt-2 flex items-baseline gap-3">
                    <p className={`text-3xl font-semibold ${selectionAfterValueTone}`}>
                      {selectionAfterAvailable ? `${selectionProbabilityAfterValue}%` : '—'}
                    </p>
                    {selectionAfterAvailable && selectionProbabilityAfterMeaning && (
                      <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-medium text-emerald-600">
                        {selectionProbabilityAfterMeaning} Outlook
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {selectionAfterAvailable
                      ? selectionProbabilityAfterRationale ||
                        'Enhanced estimate reflecting ATS, keyword, and credential gains from the accepted changes.'
                      : 'Enhanced estimate will populate after you apply at least one improvement.'}
                  </p>
                </div>
                {selectionProbabilityFactors.length > 0 && (
                  <div
                    className="rounded-lg border border-dashed border-slate-300 bg-slate-50/70 p-4"
                    data-testid="selection-factors"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Key Factors
                    </p>
                    <ul className="mt-3 space-y-3" data-testid="selection-factors-list">
                      {selectionProbabilityFactors.map((factor) => {
                        const tone = selectionFactorToneStyles[factor.impact] || selectionFactorToneStyles.default
                        return (
                          <li key={factor.key} className="flex gap-3" data-testid="selection-factor-item">
                            <span
                              className={`mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full ${tone.bullet}`}
                              aria-hidden="true"
                            />
                            <div className="space-y-1">
                              <p className={`text-sm font-medium ${tone.label}`}>{factor.label}</p>
                              {factor.detail && <p className="text-xs text-slate-600">{factor.detail}</p>}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      {match && improvementDetails.length > 0 && (
        <div
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          data-testid="improvement-recap-card"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Improvement Recap</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">What changed and why it matters</h3>
            </div>
            <InfoTooltip
              variant="light"
              align="right"
              label="How should you use these improvements?"
              content="Each update highlights what changed, why it lifts your ATS alignment, and how to talk about it when you interview."
            />
          </div>
          <ul className="mt-4 space-y-4">
            {improvementDetails.map((detail) => (
              <li
                key={detail.id}
                className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                data-testid="improvement-recap-item"
              >
                <p className="text-sm font-semibold text-slate-900">{detail.section}</p>
                <p className="mt-2 text-sm text-slate-700">{detail.changeSummary}</p>
                <p className="mt-2 text-sm text-slate-700" data-testid="improvement-recap-reason">
                  <span className="font-semibold text-slate-900">Why it matters:</span> {detail.reasonText}
                </p>
                <p className="mt-2 text-sm italic text-slate-600" data-testid="improvement-recap-interview">
                  {detail.interviewAdvice}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

export default ATSScoreDashboard
