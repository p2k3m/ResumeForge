const badgeThemes = {
  EXCELLENT:
    'bg-white/15 text-white border border-white/40 shadow-[0_8px_20px_rgba(255,255,255,0.18)] backdrop-blur-sm',
  GOOD:
    'bg-black/10 text-white border border-white/25 shadow-[0_8px_24px_rgba(15,23,42,0.25)] backdrop-blur-sm',
  FAIR:
    'bg-black/20 text-white border border-white/20 shadow-[0_8px_24px_rgba(15,23,42,0.3)] backdrop-blur-sm',
  'NEEDS IMPROVEMENT':
    'bg-black/30 text-white border border-white/20 shadow-[0_8px_24px_rgba(15,23,42,0.35)] backdrop-blur-sm'
}

const labelTone = {
  EXCELLENT: 'text-white',
  GOOD: 'text-white',
  FAIR: 'text-white/90',
  'NEEDS IMPROVEMENT': 'text-white/90'
}

function normalizeLabel(label) {
  if (!label) return 'GOOD'
  const upper = label.toUpperCase()
  if (badgeThemes[upper]) return upper
  return upper
}

function formatScore(score) {
  if (typeof score !== 'number') {
    return { display: score ?? '—', suffix: '' }
  }
  const rounded = Number.isFinite(score) ? Math.round(score) : score
  return { display: rounded, suffix: '%' }
}

const defaultAccent = 'from-indigo-500 via-purple-500 to-purple-700'

function ATSScoreCard({ metric, accentClass = defaultAccent }) {
  const ratingLabel = normalizeLabel(metric?.ratingLabel)
  const badgeClass = badgeThemes[ratingLabel] || badgeThemes.GOOD
  const labelClass = labelTone[ratingLabel] || labelTone.GOOD
  const { display: scoreDisplay, suffix: scoreSuffix } = formatScore(metric?.score)
  const tip = metric?.tip ?? metric?.tips?.[0] ?? ''
  const category = metric?.category ?? 'Metric'

  return (
    <article
      className={`group relative overflow-hidden rounded-3xl bg-gradient-to-br ${accentClass} text-white shadow-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl`}
      data-testid="ats-score-card"
    >
      <div className="absolute inset-0 opacity-20">
        <div className="absolute -top-16 -right-12 h-40 w-40 rounded-full bg-white/40 blur-3xl" />
        <div className="absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-white/30 blur-[90px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.25),_transparent_60%)]" />
      </div>
      <div className="relative flex h-full flex-col gap-6 p-6 md:p-8">
        <header className="flex flex-col gap-4">
          <span className="w-fit rounded-full bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.4em] text-white/70">
            Metric
          </span>
          <div className="flex items-start justify-between gap-4">
            <h3 className="text-2xl font-black leading-snug tracking-wide md:text-[26px]">{category}</h3>
            {ratingLabel && (
              <span
                className={`text-[10px] font-semibold uppercase tracking-[0.35em] px-3 py-1 rounded-full ${badgeClass}`}
                data-testid="rating-badge"
              >
                {ratingLabel}
              </span>
            )}
          </div>
        </header>
        <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
          <p className="text-6xl font-black leading-none drop-shadow-md md:text-7xl" data-testid="metric-score">
            {scoreDisplay}
          </p>
          {scoreSuffix && (
            <span className="text-2xl font-semibold uppercase tracking-[0.3em] text-white/80">{scoreSuffix}</span>
          )}
          <span className={`text-xs font-semibold uppercase tracking-[0.45em] ${labelClass}`}>Score</span>
        </div>
        {tip && (
          <footer
            className="mt-auto rounded-2xl border border-white/10 bg-white/10 p-4 text-sm md:text-base leading-relaxed text-white/90 shadow-[0_12px_35px_rgba(15,23,42,0.28)]"
            data-testid="metric-tip"
          >
            <div className="flex items-start gap-3">
              <span className="mt-1 inline-flex h-8 w-8 flex-none items-center justify-center rounded-full bg-white/20 text-xs font-semibold uppercase tracking-[0.35em]">
                Tip
              </span>
              <p className="flex-1">{tip}</p>
            </div>
          </footer>
        )}
      </div>
    </article>
  )
}

export default ATSScoreCard
