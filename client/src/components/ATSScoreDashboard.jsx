import ATSScoreCard from './ATSScoreCard.jsx'
import InfoTooltip from './InfoTooltip.jsx'
import { buildMetricTip } from '../utils/actionableAdvice.js'

const gradientPalette = [
  'from-[#5B21B6] via-[#7C3AED] to-[#4C1D95]',
  'from-[#1E3A8A] via-[#312E81] to-[#4338CA]',
  'from-[#0F172A] via-[#1D4ED8] to-[#6366F1]',
  'from-[#312E81] via-[#4C1D95] to-[#7C3AED]',
  'from-[#4338CA] via-[#6366F1] to-[#8B5CF6]'
]

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

  const displayMetrics = metricList.map((metric, index) => {
    const accent = gradientPalette[index % gradientPalette.length]
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
      return { metric: metricWithTip, accent, improvement: null }
    }

    const category = typeof metric?.category === 'string' ? metric.category.trim() : ''
    const config = category ? metricActionMap.get(category) || null : null

    if (!config || !config.actionKey) {
      return { metric: metricWithTip, accent, improvement: null }
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
      accent,
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
      : match?.originalScore
  )
  const enhancedScoreValue = clampScore(
    typeof match?.atsScoreAfter === 'number'
      ? match.atsScoreAfter
      : match?.enhancedScore
  )
  const matchDelta =
    originalScoreValue !== null && enhancedScoreValue !== null
      ? formatDelta(originalScoreValue, enhancedScoreValue)
      : formatDelta(
          typeof match?.atsScoreBefore === 'number' ? match.atsScoreBefore : match?.originalScore,
          typeof match?.atsScoreAfter === 'number' ? match.atsScoreAfter : match?.enhancedScore
        )
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
    match?.originalScoreExplanation ||
    'Baseline ATS alignment from your uploaded resume before any ResumeForge refinements.'
  const enhancedScoreDescription =
    match?.enhancedScoreExplanation ||
    'Recalculated ATS alignment after applying the recommended ResumeForge improvements.'
  const scoreComparisonDescription =
    'Illustrates how the enhanced resume closes gaps versus ATS benchmarks by comparing both scores side-by-side.'
  const selectionProbabilityDescription =
    'Compares shortlist odds before and after enhancements using ATS scores, keyword coverage, and credential alignment.'

  const snapshotSegments = (() => {
    const segments = []
    const formatPercent = (value) => (typeof value === 'number' ? `${value}%` : '—')

    if (originalScoreValue !== null || enhancedScoreValue !== null) {
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
        beforeBadgeClass: 'bg-indigo-500/10 text-indigo-700',
        afterBadgeClass: 'bg-emerald-500/10 text-emerald-700',
        format: formatPercent
      })
    }

    if (hasSelectionProbability) {
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
        beforeBadgeClass: 'bg-indigo-500/10 text-indigo-700',
        afterBadgeClass: 'bg-emerald-500/10 text-emerald-700',
        format: formatPercent
      })
    }

    return segments
  })()

  const missingSkills = normalizeSkills(match?.missingSkills)
  const addedSkills = normalizeSkills(match?.addedSkills)

  const matchStatusStyles = {
    match: {
      label: 'Match',
      badgeClass:
        'inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700 ring-1 ring-inset ring-emerald-200'
    },
    mismatch: {
      label: 'Mismatch',
      badgeClass:
        'inline-flex items-center rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-rose-700 ring-1 ring-inset ring-rose-200'
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
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-purple-900">ATS Performance Dashboard</h2>
          <p className="text-sm text-purple-700/80">
            Track how your resume aligns with the job description across keyword, structure, readability, and skill coverage metrics.
          </p>
        </div>
        {match && (
          <div
            className="flex items-center gap-3 text-xs font-semibold uppercase tracking-widest text-purple-600"
            data-testid="dashboard-live-indicator"
          >
            <span className="rounded-full bg-purple-100 px-3 py-1">Live Update</span>
            <span>Synced with latest analysis</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {displayMetrics.map(({ metric, accent, improvement }) => (
          <ATSScoreCard
            key={metric.category}
            metric={metric}
            accentClass={accent}
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
              className="rounded-3xl border border-purple-100/80 bg-purple-50/60 p-4 shadow-sm md:col-span-full"
              data-testid="score-summary-banner"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-purple-600">Score Snapshot</p>
              {atsScoreSummary && (
                <p className="mt-2 text-sm text-purple-800" data-testid="ats-score-summary">
                  {atsScoreSummary}
                </p>
              )}
              {selectionProbabilitySummary && (
                <p className="mt-1 text-sm text-purple-800" data-testid="selection-summary">
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
                      className="rounded-2xl border border-purple-200/70 bg-white/70 p-4"
                      data-testid={`${segment.id}-summary-card`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-purple-500">
                          {segment.label}
                        </p>
                        {segment.delta && (
                          <span
                            className="rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-emerald-700"
                            data-testid={`${segment.id}-summary-delta`}
                          >
                            {segment.delta}
                          </span>
                        )}
                      </div>
                      <dl className="mt-3 grid grid-cols-2 gap-4">
                        <div>
                          <dt className="text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-500">
                            {segment.beforeLabel}
                          </dt>
                          <dd
                            className={`mt-2 text-2xl font-black ${segment.beforeTone}`}
                            data-testid={`${segment.id}-summary-before`}
                          >
                            {segment.format(segment.beforeValue)}
                          </dd>
                          {segment.beforeMeaning && (
                            <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] ${segment.beforeBadgeClass}`}>
                              {segment.beforeMeaning}
                            </span>
                          )}
                        </div>
                        <div>
                          <dt className="text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-500">
                            {segment.afterLabel}
                          </dt>
                          <dd
                            className={`mt-2 text-2xl font-black ${segment.afterTone}`}
                            data-testid={`${segment.id}-summary-after`}
                          >
                            {segment.format(segment.afterValue)}
                          </dd>
                          {segment.afterMeaning && (
                            <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] ${segment.afterBadgeClass}`}>
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
          <div className="rounded-3xl border border-indigo-100 bg-white/80 p-6 shadow-lg backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-500">ATS Score Before</p>
              <InfoTooltip
                variant="light"
                align="right"
                label="How is the ATS score before calculated?"
                content={originalScoreDescription}
              />
            </div>
            <p className="mt-3 text-5xl font-black text-indigo-700" data-testid="original-score">
              {typeof originalScoreValue === 'number' ? `${originalScoreValue}%` : '—'}
            </p>
            <p className="mt-2 text-sm text-indigo-600/90" data-testid="original-title">
              {match.originalTitle || 'Initial resume title unavailable.'}
            </p>
            <div className="mt-4 space-y-2">
              <span
                className={matchStatusStyles[originalStatus].badgeClass}
                data-testid="original-match-status"
              >
                {matchStatusStyles[originalStatus].label}
              </span>
              <p className="text-sm text-indigo-700/90" data-testid="original-match-advice">
                {originalAdvice}
              </p>
            </div>
          </div>
          <div className="rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-100 via-white to-emerald-50 p-6 shadow-lg backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-600">ATS Score After</p>
                  <p className="mt-3 text-5xl font-black text-emerald-700" data-testid="enhanced-score">
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
                <span className="self-start rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-emerald-700" data-testid="match-delta">
                  {matchDelta}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-emerald-700/90" data-testid="enhanced-title">
              {match.modifiedTitle || match.originalTitle || 'Enhanced resume title coming soon.'}
            </p>
            <div className="mt-4 space-y-2">
              <span
                className={matchStatusStyles[enhancedStatus].badgeClass}
                data-testid="enhanced-match-status"
              >
                {matchStatusStyles[enhancedStatus].label}
              </span>
              <p className="text-sm text-emerald-700/90" data-testid="enhanced-match-advice">
                {enhancedAdvice}
              </p>
            </div>
          </div>
          {hasComparableScores && (
            <div
              className="rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-lg backdrop-blur"
              data-testid="score-comparison-chart"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Score Comparison</p>
                  <p className="mt-2 text-sm text-slate-700/90">
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
                    <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-emerald-700">
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
                {scoreBands.map(({ label, value, tone, textTone }) => (
                  <div key={label} className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.3em] text-slate-600">
                      <span>{label}</span>
                      <span className={textTone}>{value}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-200/80">
                      <div
                        className={`h-full rounded-full ${tone}`}
                        style={{ width: `${value}%` }}
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm text-slate-700/95" data-testid="score-improvement-narrative">
                {improvementNarrative}
              </p>
            </div>
          )}
          {hasSelectionProbability && (
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50/80 p-6 shadow-lg backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-600">Selection Probability</p>
                <InfoTooltip
                  variant="light"
                  align="right"
                  label="How is the selection probability estimated?"
                  content={selectionProbabilityDescription}
                />
              </div>
              <div className="mt-4 space-y-4">
                {typeof selectionProbabilityBeforeValue === 'number' && (
                  <div className="rounded-2xl border border-indigo-200/60 bg-white/80 p-4 shadow-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-500">Selection % Before</p>
                        <div className="mt-2 flex items-baseline gap-3">
                          <p className="text-4xl font-black text-indigo-700">{selectionProbabilityBeforeValue}%</p>
                          {selectionProbabilityBeforeMeaning && (
                            <span className="rounded-full bg-indigo-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-indigo-700">
                              {selectionProbabilityBeforeMeaning} Outlook
                            </span>
                          )}
                        </div>
                      </div>
                      {selectionProbabilityDelta && (
                        <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-emerald-700">
                          {selectionProbabilityDelta}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-indigo-700/90">
                      {selectionProbabilityBeforeRationale ||
                        'Baseline estimate derived from your uploaded resume before enhancements.'}
                    </p>
                  </div>
                )}
                {typeof selectionProbabilityAfterValue === 'number' && (
                  <div className="rounded-2xl border border-emerald-300 bg-emerald-100/60 p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-600">Selection % After</p>
                    <div className="mt-2 flex items-baseline gap-3">
                      <p className="text-4xl font-black text-emerald-700">{selectionProbabilityAfterValue}%</p>
                      {selectionProbabilityAfterMeaning && (
                        <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-emerald-700">
                          {selectionProbabilityAfterMeaning} Outlook
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-emerald-700/90">
                      {selectionProbabilityAfterRationale ||
                        'Enhanced estimate reflecting ATS, keyword, and credential gains from the accepted changes.'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      {match && improvementDetails.length > 0 && (
        <div
          className="rounded-3xl border border-purple-200/70 bg-white/90 p-6 shadow-lg backdrop-blur"
          data-testid="improvement-recap-card"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-purple-500">Improvement Recap</p>
              <h3 className="mt-1 text-lg font-semibold text-purple-900">What changed and why it matters</h3>
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
                className="rounded-2xl border border-purple-100/80 bg-purple-50/60 p-4 shadow-sm"
                data-testid="improvement-recap-item"
              >
                <p className="text-sm font-semibold text-purple-900">{detail.section}</p>
                <p className="mt-2 text-sm text-purple-700/95">{detail.changeSummary}</p>
                <p className="mt-2 text-sm text-purple-700/95" data-testid="improvement-recap-reason">
                  <span className="font-semibold text-purple-900">Why it matters:</span> {detail.reasonText}
                </p>
                <p className="mt-2 text-sm italic text-purple-700/95" data-testid="improvement-recap-interview">
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
