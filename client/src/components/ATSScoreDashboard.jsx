import ATSScoreCard from './ATSScoreCard.jsx'

const gradientPalette = [
  'from-[#5B21B6] via-[#7C3AED] to-[#4C1D95]',
  'from-[#1E3A8A] via-[#312E81] to-[#4338CA]',
  'from-[#0F172A] via-[#1D4ED8] to-[#6366F1]',
  'from-[#312E81] via-[#4C1D95] to-[#7C3AED]',
  'from-[#4338CA] via-[#6366F1] to-[#8B5CF6]'
]

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

  const matchDelta = formatDelta(match?.originalScore, match?.enhancedScore)

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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2" aria-label="match comparison">
          <div className="rounded-3xl border border-indigo-100 bg-white/80 p-6 shadow-lg backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-500">Original Match</p>
            <p className="mt-3 text-5xl font-black text-indigo-700" data-testid="original-score">
              {match.originalScore ?? '—'}%
            </p>
            <p className="mt-2 text-sm text-indigo-600/90" data-testid="original-title">
              {match.originalTitle || 'Initial resume title unavailable.'}
            </p>
          </div>
          <div className="rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-100 via-white to-emerald-50 p-6 shadow-lg backdrop-blur">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-600">Enhanced Match</p>
                <p className="mt-3 text-5xl font-black text-emerald-700" data-testid="enhanced-score">
                  {match.enhancedScore ?? '—'}%
                </p>
              </div>
              {matchDelta && (
                <span className="self-start rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700" data-testid="match-delta">
                  {matchDelta}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-emerald-700/90" data-testid="enhanced-title">
              {match.modifiedTitle || match.originalTitle || 'Enhanced resume title coming soon.'}
            </p>
          </div>
        </div>
      )}
    </section>
  )
}

export default ATSScoreDashboard
