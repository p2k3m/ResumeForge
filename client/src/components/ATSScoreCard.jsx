import InfoTooltip from './InfoTooltip.jsx'
import { buildMetricTip } from '../utils/actionableAdvice.js'

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
    return { display: score ?? 'N/A', suffix: '' }
  }
  const rounded = Number.isFinite(score) ? Math.round(score) : score
  return { display: rounded, suffix: '%' }
}

function formatScoreDelta(before, after) {
  if (typeof before !== 'number' || typeof after !== 'number') {
    return null
  }
  if (!Number.isFinite(before) || !Number.isFinite(after)) {
    return null
  }
  const delta = after - before
  if (delta === 0) {
    return null
  }
  const rounded = Math.round(delta)
  const prefix = rounded > 0 ? '+' : ''
  return `${prefix}${rounded} pts`
}

const defaultAccent = 'from-indigo-500 via-purple-500 to-purple-700'

const metricDescriptions = {
  'Keyword Match':
    'Measures how closely your resume keyword usage mirrors the job description so ATS scanners can confidently match you.',
  'Skills Coverage':
    'Summarises how well you showcase the core technical and soft skills the job emphasises.',
  'Format Compliance':
    'Checks whether your layout, headings, and file structure follow ATS-friendly formatting conventions.',
  Readability:
    'Looks at sentence length, clarity, and scannability to ensure recruiters can digest your story quickly.',
  'Experience Alignment':
    'Evaluates how your accomplishments map to the role’s responsibilities and impact areas.',
  Structure:
    'Reviews the ordering of sections, headings, and spacing that help ATS parsers read the resume correctly.',
  Achievements:
    'Highlights the presence of quantified, outcome-focused statements that prove your impact.',
  'Core Competencies':
    'Captures whether the resume surfaces the core competencies and proficiencies the JD prioritises.',
}

function describeMetric(metric) {
  const explicit = typeof metric?.description === 'string' ? metric.description.trim() : ''
  if (explicit) return explicit

  const category = typeof metric?.category === 'string' ? metric.category.trim() : ''
  if (category) {
    const mapped = metricDescriptions[category]
    if (mapped) return mapped
    return `Represents how well your resume performs for ${category.toLowerCase()} when parsed by applicant tracking systems.`
  }

  return 'Shows how this aspect of your resume aligns with ATS expectations.'
}

function ATSScoreCard({ metric, accentClass = defaultAccent, improvement }) {
  const afterScore =
    typeof metric?.afterScore === 'number' && Number.isFinite(metric.afterScore)
      ? metric.afterScore
      : typeof metric?.score === 'number'
        ? metric.score
        : null
  const beforeScore =
    typeof metric?.beforeScore === 'number' && Number.isFinite(metric.beforeScore)
      ? metric.beforeScore
      : afterScore
  const { display: afterDisplay, suffix: afterSuffix } = formatScore(afterScore)
  const { display: beforeDisplay, suffix: beforeSuffix } = formatScore(beforeScore)
  const rawAfterRating = metric?.afterRatingLabel || metric?.ratingLabel
  const ratingLabel = normalizeLabel(rawAfterRating)
  const badgeClass = badgeThemes[ratingLabel] || badgeThemes.GOOD
  const labelClass = labelTone[ratingLabel] || labelTone.GOOD
  const beforeRatingLabel = metric?.beforeRatingLabel
    ? normalizeLabel(metric.beforeRatingLabel)
    : null
  const deltaText = metric?.deltaText || formatScoreDelta(beforeScore, afterScore)
  const explicitTip = typeof metric?.tip === 'string' ? metric.tip.trim() : ''
  const listTips = Array.isArray(metric?.tips)
    ? metric.tips.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean)
    : []
  const fallbackTip = buildMetricTip(metric)
  const tip = explicitTip || listTips[0] || fallbackTip || ''
  const category = metric?.category ?? 'Metric'
  const metricDescription = describeMetric(metric)

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
            <div className="flex items-start gap-2">
              <h3 className="text-2xl font-black leading-snug tracking-wide md:text-[26px]">{category}</h3>
              <InfoTooltip
                variant="dark"
                align="left"
                label={`What does the ${category} score mean?`}
                content={metricDescription}
              />
            </div>
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
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/20 bg-white/10 p-4 shadow-inner">
              <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-white/70">
                ATS Score Before
              </p>
              <div className="mt-2 flex items-baseline gap-2" data-testid="metric-score-before">
                <span className="text-4xl font-black leading-none text-white/95 md:text-5xl">{beforeDisplay}</span>
                {beforeSuffix && (
                  <span className="text-sm font-semibold uppercase tracking-[0.3em] text-white/80">
                    {beforeSuffix}
                  </span>
                )}
              </div>
              {beforeRatingLabel && (
                <span className="mt-3 inline-flex w-fit rounded-full bg-white/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-white/80">
                  {beforeRatingLabel}
                </span>
              )}
            </div>
            <div className="relative rounded-2xl border border-white/10 bg-white/15 p-4 shadow-inner">
              <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-white/80">
                ATS Score After
              </p>
              <div className="mt-2 flex items-baseline gap-2" data-testid="metric-score">
                <span className="text-5xl font-black leading-none text-white md:text-6xl">{afterDisplay}</span>
                {afterSuffix && (
                  <span className="text-base font-semibold uppercase tracking-[0.3em] text-white/80">
                    {afterSuffix}
                  </span>
                )}
              </div>
              <span
                className={`mt-3 inline-flex w-fit rounded-full bg-white/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] ${labelClass}`}
              >
                {ratingLabel}
              </span>
              {deltaText && (
                <span className="absolute -top-3 right-3 inline-flex rounded-full bg-emerald-400/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-emerald-950" data-testid="metric-delta">
                  {deltaText}
                </span>
              )}
            </div>
          </div>
        </div>
        {(tip || improvement) && (
          <div className="mt-auto space-y-3">
            {tip && (
              <footer
                className="rounded-2xl border border-white/10 bg-white/10 p-4 text-sm md:text-base leading-relaxed text-white/90 shadow-[0_12px_35px_rgba(15,23,42,0.28)]"
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
            {improvement && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/90 shadow-[0_12px_35px_rgba(15,23,42,0.22)]">
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={improvement.onClick}
                    disabled={improvement.disabled}
                    className={`w-full rounded-full px-4 py-2 text-sm font-semibold text-purple-900 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                      improvement.disabled
                        ? 'cursor-not-allowed bg-white/40 text-purple-900/60'
                        : 'bg-white hover:bg-purple-50'
                    }`}
                    aria-busy={improvement.busy ? 'true' : 'false'}
                  >
                    {improvement.busy ? 'Improving…' : improvement.label}
                  </button>
                  {improvement.helper && (
                    <p className="text-xs leading-relaxed text-white/80">{improvement.helper}</p>
                  )}
                  {improvement.lockMessage && (
                    <p className="text-xs font-medium text-white/70">{improvement.lockMessage}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  )
}

export default ATSScoreCard
