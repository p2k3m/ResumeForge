import InfoTooltip from './InfoTooltip.jsx'
import { buildMetricTip } from '../utils/actionableAdvice.js'

const badgeThemes = {
  EXCELLENT: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  GOOD: 'bg-sky-50 text-sky-700 border border-sky-200',
  FAIR: 'bg-amber-50 text-amber-700 border border-amber-200',
  'NEEDS IMPROVEMENT': 'bg-rose-50 text-rose-700 border border-rose-200'
}

const labelTone = {
  EXCELLENT: 'text-emerald-700',
  GOOD: 'text-sky-700',
  FAIR: 'text-amber-700',
  'NEEDS IMPROVEMENT': 'text-rose-700'
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

function ATSScoreCard({ metric, improvement }) {
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
  const deltaTrend =
    typeof beforeScore === 'number' && typeof afterScore === 'number' &&
    Number.isFinite(beforeScore) &&
    Number.isFinite(afterScore)
      ? afterScore - beforeScore
      : null
  const deltaBadgeTone = (() => {
    if (!deltaText) {
      return 'bg-slate-200 text-slate-700'
    }
    if (deltaTrend === null) {
      return 'bg-slate-200 text-slate-700'
    }
    if (deltaTrend > 0) {
      return 'bg-emerald-100 text-emerald-700'
    }
    if (deltaTrend < 0) {
      return 'bg-rose-100 text-rose-700'
    }
    return 'bg-slate-200 text-slate-700'
  })()
  const beforeAccentTone =
    typeof beforeScore === 'number'
      ? 'border-indigo-200 bg-indigo-50'
      : 'border-slate-200 bg-slate-50'
  const beforeLabelTone =
    typeof beforeScore === 'number' ? 'text-indigo-600' : 'text-slate-500'
  const beforeValueTone =
    typeof beforeScore === 'number' ? 'text-indigo-700' : 'text-slate-500'
  const afterAccentTone =
    typeof afterScore === 'number'
      ? 'border-emerald-200 bg-emerald-50'
      : 'border-slate-200 bg-slate-50'
  const afterLabelTone =
    typeof afterScore === 'number' ? 'text-emerald-600' : 'text-slate-500'
  const afterValueTone =
    typeof afterScore === 'number' ? 'text-emerald-700' : 'text-slate-500'
  const beforeRatingBadgeTone =
    typeof beforeScore === 'number'
      ? 'border border-indigo-200 bg-white text-indigo-600'
      : 'border border-slate-200 bg-white text-slate-500'
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
      className="flex h-full flex-col gap-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
      data-testid="ats-score-card"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-500">Metric</p>
          <div className="flex items-start gap-2">
            <h3 className="text-lg font-semibold text-slate-900">{category}</h3>
            <InfoTooltip
              variant="light"
              align="left"
              label={`What does the ${category} score mean?`}
              content={metricDescription}
            />
          </div>
        </div>
        {ratingLabel && (
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeClass}`}
            data-testid="rating-badge"
          >
            {ratingLabel}
          </span>
        )}
      </header>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className={`rounded-lg p-3 ${beforeAccentTone}`}>
          <p className={`text-xs font-semibold uppercase tracking-wide ${beforeLabelTone}`}>
            ATS Score Before
          </p>
          <div className="mt-2 flex items-baseline gap-2" data-testid="metric-score-before">
            <span className={`text-3xl font-semibold md:text-4xl ${beforeValueTone}`}>{beforeDisplay}</span>
            {beforeSuffix && <span className={`text-sm font-medium ${beforeLabelTone}`}>{beforeSuffix}</span>}
          </div>
          {beforeRatingLabel && (
            <span className={`mt-3 inline-flex w-fit rounded-full px-3 py-1 text-xs font-medium ${beforeRatingBadgeTone}`}>
              {beforeRatingLabel}
            </span>
          )}
        </div>
        <div className={`relative rounded-lg p-3 ${afterAccentTone}`}>
          <p className={`text-xs font-semibold uppercase tracking-wide ${afterLabelTone}`}>
            ATS Score After
          </p>
          <div className="mt-2 flex items-baseline gap-2" data-testid="metric-score">
            <span className={`text-4xl font-semibold md:text-5xl ${afterValueTone}`}>{afterDisplay}</span>
            {afterSuffix && <span className={`text-sm font-medium ${afterLabelTone}`}>{afterSuffix}</span>}
          </div>
          <span className={`mt-3 inline-flex w-fit rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium ${labelClass}`}>
            {ratingLabel}
          </span>
          {deltaText && (
            <span
              className={`absolute top-3 right-3 rounded-full px-3 py-1 text-xs font-semibold ${deltaBadgeTone}`}
              data-testid="metric-delta"
            >
              {deltaText}
            </span>
          )}
        </div>
      </div>
      {(tip || improvement) && (
        <div className="mt-auto space-y-3">
          {tip && (
            <footer
              className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed text-slate-700"
              data-testid="metric-tip"
            >
              <div className="flex items-start gap-3">
                <span className="mt-1 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-white text-xs font-semibold text-slate-500">
                  Tip
                </span>
                <p className="flex-1">{tip}</p>
              </div>
            </footer>
          )}
          {improvement && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={improvement.onClick}
                  disabled={improvement.disabled}
                  className={`w-full rounded-md px-4 py-2 text-sm font-semibold text-white transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 ${
                    improvement.disabled
                      ? 'cursor-not-allowed bg-slate-300 text-slate-500'
                      : 'bg-emerald-600 hover:bg-emerald-500'
                  }`}
                  aria-busy={improvement.busy ? 'true' : 'false'}
                >
                  {improvement.busy ? 'Improving…' : improvement.label}
                </button>
                {improvement.helper && (
                  <p className="text-xs leading-relaxed text-slate-500">{improvement.helper}</p>
                )}
                {improvement.lockMessage && (
                  <p className="text-xs font-medium text-slate-500">{improvement.lockMessage}</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  )
}

export default ATSScoreCard
