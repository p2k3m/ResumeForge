import { buildCategoryAdvice } from '../utils/actionableAdvice.js'

const categories = [
  {
    key: 'skills',
    label: 'JD Skills',
    description: 'Core JD keywords covered or still missing from your resume.'
  },
  {
    key: 'designation',
    label: 'Designation',
    description: 'Visible job titles aligned to the target role.'
  },
  {
    key: 'experience',
    label: 'Experience',
    description: 'Tenure signals and quantified achievements surfaced from work history.'
  },
  {
    key: 'tasks',
    label: 'Tasks',
    description: 'Responsibilities and project outcomes aligned to the JD expectations.'
  },
  {
    key: 'highlights',
    label: 'Highlights',
    description: 'Summary hooks and spotlight wins emphasised for this role.'
  },
  {
    key: 'certificates',
    label: 'Certifications',
    description: 'Credential coverage detected across LinkedIn, resume, and manual inputs.'
  }
]

const addedBadgeClass = 'bg-emerald-100 text-emerald-700 border border-emerald-200'
const missingBadgeClass = 'bg-rose-100 text-rose-700 border border-rose-200'
const actionBadgeClass =
  'caps-label-tight inline-flex items-center rounded-full bg-purple-100 px-2.5 py-1 text-[0.65rem] font-semibold text-purple-700'

function normaliseItemLabel(value) {
  if (typeof value !== 'string') {
    return ''
  }
  const trimmed = value.trim()
  return trimmed.length ? trimmed : ''
}

function collectSummaryItems(summary, type) {
  const list = []
  const seen = new Set()
  categories.forEach((category) => {
    const bucket = summary?.[category.key]
    const items = Array.isArray(bucket?.[type]) ? bucket[type] : []
    items.forEach((item) => {
      const label = normaliseItemLabel(item)
      if (!label) return
      const dedupeKey = `${category.key}::${label.toLowerCase()}`
      if (seen.has(dedupeKey)) {
        return
      }
      seen.add(dedupeKey)
      list.push({
        categoryKey: category.key,
        categoryLabel: category.label,
        value: label
      })
    })
  })
  return list
}

function renderSummaryChips(items, type) {
  if (!Array.isArray(items) || items.length === 0) {
    return (
      <p className="mt-3 text-xs text-slate-500">
        {type === 'added'
          ? 'No new signals recorded yet.'
          : 'No gaps flagged right now.'}
      </p>
    )
  }

  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {items.map((item) => (
        <li
          key={`${type}-${item.categoryKey}-${item.value}`}
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
            type === 'added'
              ? 'border-emerald-200 bg-emerald-50/80 text-emerald-700'
              : 'border-rose-200 bg-rose-50/80 text-rose-700'
          }`}
        >
          <span className="rounded-full bg-white/70 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-widest text-current">
            {item.categoryLabel}
          </span>
          <span>{item.value}</span>
        </li>
      ))}
    </ul>
  )
}

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

  const addedItems = collectSummaryItems(summary, 'added')
  const missingItems = collectSummaryItems(summary, 'missing')
  const addedVisible = addedItems.slice(0, 6)
  const missingVisible = missingItems.slice(0, 6)
  const addedRemainder = Math.max(addedItems.length - addedVisible.length, 0)
  const missingRemainder = Math.max(missingItems.length - missingVisible.length, 0)

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
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <article className="rounded-2xl border border-rose-200/70 bg-rose-50/60 p-4">
          <p className="caps-label text-xs font-semibold text-rose-600">Before updates</p>
          <p className="mt-1 text-sm text-rose-600/80">Gaps the JD still expects you to cover.</p>
          <p className="mt-3 text-3xl font-semibold text-rose-700">
            {missingItems.length}
            <span className="ml-2 text-sm font-medium text-rose-600/90">
              {missingItems.length === 1 ? 'gap flagged' : 'gaps flagged'}
            </span>
          </p>
          {renderSummaryChips(missingVisible, 'missing')}
          {missingRemainder > 0 && (
            <p className="mt-2 text-xs font-semibold text-rose-600/80">+{missingRemainder} more gaps identified</p>
          )}
        </article>
        <article className="rounded-2xl border border-emerald-200/70 bg-emerald-50/60 p-4">
          <p className="caps-label text-xs font-semibold text-emerald-600">After enhancements</p>
          <p className="mt-1 text-sm text-emerald-600/80">Signals newly added from accepted updates.</p>
          <p className="mt-3 text-3xl font-semibold text-emerald-700">
            {addedItems.length}
            <span className="ml-2 text-sm font-medium text-emerald-700/90">
              {addedItems.length === 1 ? 'signal added' : 'signals added'}
            </span>
          </p>
          {renderSummaryChips(addedVisible, 'added')}
          {addedRemainder > 0 && (
            <p className="mt-2 text-xs font-semibold text-emerald-700/80">+{addedRemainder} more signals captured</p>
          )}
        </article>
      </div>
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
                  <p className="caps-label text-xs font-semibold text-emerald-600">Added</p>
                  {renderItems(bucket.added, 'added', category.label)}
                </div>
                <div>
                  <p className="caps-label text-xs font-semibold text-rose-600">Missing</p>
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
