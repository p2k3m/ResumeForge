const badgeThemes = {
  EXCELLENT:
    'bg-white/20 text-white border border-white/40 shadow-[0_0_0_1px_rgba(255,255,255,0.2)] backdrop-blur-sm',
  GOOD:
    'bg-white/15 text-white border border-white/30 shadow-[0_0_0_1px_rgba(255,255,255,0.15)] backdrop-blur-sm',
  FAIR:
    'bg-black/20 text-white border border-white/20 shadow-[0_0_0_1px_rgba(255,255,255,0.15)] backdrop-blur-sm',
  'NEEDS IMPROVEMENT':
    'bg-black/30 text-white border border-white/20 shadow-[0_0_0_1px_rgba(255,255,255,0.12)] backdrop-blur-sm'
}

const labelTone = {
  EXCELLENT: 'text-white',
  GOOD: 'text-white',
  FAIR: 'text-white',
  'NEEDS IMPROVEMENT': 'text-white'
}

function normalizeLabel(label) {
  if (!label) return 'GOOD'
  const upper = label.toUpperCase()
  if (badgeThemes[upper]) return upper
  return label
}

const defaultAccent = 'from-indigo-500 via-purple-500 to-purple-700'

function ATSScoreCard({ metric, accentClass = defaultAccent }) {
  const ratingLabel = normalizeLabel(metric?.ratingLabel)
  const badgeClass = badgeThemes[ratingLabel] || badgeThemes.GOOD
  const labelClass = labelTone[ratingLabel] || labelTone.GOOD
  const score = metric?.score ?? '—'
  const tip = metric?.tip ?? ''
  const category = metric?.category ?? 'Metric'

  return (
    <article
      className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${accentClass} text-white shadow-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl`}
      data-testid="ats-score-card"
    >
      <div className="absolute inset-0 opacity-30 mix-blend-screen">
        <div className="absolute -top-12 -right-12 h-32 w-32 rounded-full bg-white/30 blur-2xl" />
        <div className="absolute -bottom-10 -left-10 h-36 w-36 rounded-full bg-white/20 blur-3xl" />
      </div>
      <div className="relative flex flex-col gap-6 p-6 md:p-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/70">Metric</p>
            <h3 className="text-2xl font-black leading-snug tracking-wide">{category}</h3>
          </div>
          {ratingLabel && (
            <span
              className={`text-xs font-semibold uppercase tracking-wide px-3 py-1 rounded-full ${badgeClass}`}
              data-testid="rating-badge"
            >
              {ratingLabel}
            </span>
          )}
        </header>
        <div className="flex items-baseline gap-4">
          <p className="text-6xl font-black leading-none drop-shadow-md" data-testid="metric-score">
            {score}
          </p>
          <span className={`text-sm font-semibold uppercase tracking-[0.4em] ${labelClass}`}>Score</span>
        </div>
        {tip && (
          <p className="text-sm md:text-base leading-relaxed text-white/85" data-testid="metric-tip">
            {tip}
          </p>
        )}
      </div>
    </article>
  )
}

export default ATSScoreCard
