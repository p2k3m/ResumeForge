import { buildCategoryAdvice } from '../utils/actionableAdvice.js'

const categories = [
  {
    key: 'skills',
    label: 'Skills',
    description: 'Core abilities recognised in your resume versus the job description.'
  },
  {
    key: 'experience',
    label: 'Experience',
    description: 'Achievements and stories added to or still missing from work history.'
  },
  {
    key: 'designation',
    label: 'Designation',
    description: 'Visible job titles aligned to the target role.'
  },
  {
    key: 'keywords',
    label: 'Keywords',
    description: 'JD keywords surfaced in your documents.'
  },
  {
    key: 'certificates',
    label: 'Certificates',
    description: 'Credential coverage detected across LinkedIn, resume, and manual inputs.'
  }
]

const addedBadgeClass = 'bg-emerald-100 text-emerald-700 border border-emerald-200'
const missingBadgeClass = 'bg-rose-100 text-rose-700 border border-rose-200'
const actionBadgeClass =
  'inline-flex items-center rounded-full bg-purple-100 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.35em] text-purple-700'

function formatList(items = []) {
  const values = Array.isArray(items) ? items.filter(Boolean) : []
  if (values.length === 0) return ''
  if (values.length === 1) return values[0]
  if (values.length === 2) return `${values[0]} and ${values[1]}`
  const head = values.slice(0, -1).join(', ')
  return `${head}, and ${values[values.length - 1]}`
}

function renderItems(items, type, label) {
  if (!Array.isArray(items) || items.length === 0) {
    return (
      <p className="mt-2 text-sm text-purple-700/70">
        {type === 'added'
          ? `No new ${label.toLowerCase()} added yet.`
          : `No missing ${label.toLowerCase()} detected.`}
      </p>
    )
  }

  const visible = items.slice(0, 6)
  const remainder = items.length - visible.length

  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {visible.map((item) => (
        <li
          key={`${type}-${item}`}
          className={`rounded-full px-3 py-1 text-xs font-semibold shadow-sm backdrop-blur ${
            type === 'added' ? addedBadgeClass : missingBadgeClass
          }`}
        >
          {item}
        </li>
      ))}
      {remainder > 0 && (
        <li className="rounded-full border border-purple-200 bg-white/70 px-3 py-1 text-xs font-semibold text-purple-700">
          +{remainder} more
        </li>
      )}
    </ul>
  )
}

function DeltaSummaryPanel({ summary }) {
  if (!summary) {
    return null
  }

  return (
    <section
      className="space-y-6 rounded-3xl border border-purple-200/70 bg-white/85 p-6 shadow-xl"
      aria-labelledby="delta-summary-title"
      data-testid="delta-summary-panel"
    >
      <header className="space-y-2">
        <h2 id="delta-summary-title" className="text-xl font-semibold text-purple-900">
          Immediate Match Deltas
        </h2>
        <p className="text-sm text-purple-700/80">
          Instantly review what new signals were added and which gaps still need attention across critical categories.
        </p>
      </header>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {categories.map((category) => {
          const bucket = summary[category.key] || { added: [], missing: [] }
          const advice = buildCategoryAdvice(category.key, bucket)
          return (
            <article
              key={category.key}
              className="flex h-full flex-col justify-between gap-3 rounded-2xl border border-purple-100/70 bg-white/70 p-4 shadow-sm"
            >
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-purple-900">{category.label}</h3>
                <p className="text-sm text-purple-700/75">{category.description}</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-600">Added</p>
                  {renderItems(bucket.added, 'added', category.label)}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-rose-600">Missing</p>
                  {renderItems(bucket.missing, 'missing', category.label)}
                </div>
              </div>
              {advice && (
                <p className="text-sm leading-relaxed text-purple-900/80">
                  <span className={actionBadgeClass}>Action</span>
                  <span className="ml-2 align-middle">{advice}</span>
                </p>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}

export default DeltaSummaryPanel
