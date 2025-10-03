import ATSScoreCard from './ATSScoreCard.jsx'
import InfoTooltip from './InfoTooltip.jsx'

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

function formatDelta(originalScore, enhancedScore) {
  if (typeof originalScore !== 'number' || typeof enhancedScore !== 'number') {
    return null
  }
  const delta = enhancedScore - originalScore
  if (!Number.isFinite(delta) || delta === 0) return null
  const prefix = delta > 0 ? '+' : ''
  return `${prefix}${delta.toFixed(0)} pts`
}

function ATSScoreDashboard({ metrics = [], match }) {
  const metricList = Array.isArray(metrics)
    ? metrics
    : Object.values(metrics || {})
  if (!metricList.length) {
    return null
  }

  const displayMetrics = metricList.map((metric, index) => ({
    metric,
    accent: gradientPalette[index % gradientPalette.length]
  }))

  const originalScoreValue = clampScore(match?.originalScore)
  const enhancedScoreValue = clampScore(match?.enhancedScore)
  const matchDelta =
    originalScoreValue !== null && enhancedScoreValue !== null
      ? formatDelta(originalScoreValue, enhancedScoreValue)
      : formatDelta(match?.originalScore, match?.enhancedScore)
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
  const hasComparableScores =
    typeof originalScoreValue === 'number' && typeof enhancedScoreValue === 'number'
  const improvementNarrative =
    match?.improvementSummary ||
    match?.selectionProbabilityRationale ||
    (hasComparableScores
      ? `Score moved from ${originalScoreValue}% to ${enhancedScoreValue}%, lifting selection odds by covering more of the JD's required keywords and achievements.`
      : 'Enhanced resume aligns more closely with the job description, increasing selection odds.')
  const scoreBands = hasComparableScores
    ? [
        {
          label: 'Original',
          value: originalScoreValue,
          tone: 'bg-indigo-500',
          textTone: 'text-indigo-700'
        },
        {
          label: 'Enhanced',
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
        {displayMetrics.map(({ metric, accent }) => (
          <ATSScoreCard key={metric.category} metric={metric} accentClass={accent} />
        ))}
      </div>

      {match && (
        <div
          className={`grid grid-cols-1 gap-4 ${hasSelectionProbability ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}
          aria-label="match comparison"
        >
          <div className="rounded-3xl border border-indigo-100 bg-white/80 p-6 shadow-lg backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-500">Original Match</p>
              <InfoTooltip
                variant="light"
                align="right"
                label="How is the original match score calculated?"
                content={originalScoreDescription}
              />
            </div>
            <p className="mt-3 text-5xl font-black text-indigo-700" data-testid="original-score">
              {match.originalScore ?? '—'}%
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
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-600">Enhanced Match</p>
                  <p className="mt-3 text-5xl font-black text-emerald-700" data-testid="enhanced-score">
                    {match.enhancedScore ?? '—'}%
                  </p>
                </div>
                <InfoTooltip
                  variant="light"
                  align="left"
                  label="How is the enhanced match score calculated?"
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
              <div className="mt-4 space-y-4" role="img" aria-label={`Original score ${originalScoreValue}%, enhanced score ${enhancedScoreValue}%`}>
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
                        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-500">Before Enhancement</p>
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
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-600">After Enhancement</p>
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
    </section>
  )
}

export default ATSScoreDashboard
