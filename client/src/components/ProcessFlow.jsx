const statusThemes = {
  complete: {
    card: 'border-emerald-200 bg-emerald-50/80 shadow-sm',
    circle: 'bg-emerald-500 border-emerald-500 text-white',
    title: 'text-emerald-900',
    description: 'text-emerald-700/90',
    status: 'text-emerald-600'
  },
  current: {
    card: 'border-indigo-300 bg-white shadow-lg ring-1 ring-indigo-200/70',
    circle: 'bg-indigo-500 border-indigo-500 text-white',
    title: 'text-indigo-900',
    description: 'text-indigo-700/90',
    status: 'text-indigo-600'
  },
  upcoming: {
    card: 'border-purple-100 bg-white/70',
    circle: 'border-2 border-dashed border-purple-300 text-purple-400',
    title: 'text-purple-800',
    description: 'text-purple-600/80',
    status: 'text-purple-400'
  }
}

const noteToneStyles = {
  warning: 'text-rose-600 font-semibold',
  success: 'text-emerald-600 font-semibold',
  info: 'text-indigo-600 font-medium'
}

function ProcessFlow({ steps }) {
  const items = Array.isArray(steps) ? steps.filter(Boolean) : []
  if (items.length === 0) {
    return null
  }

  return (
    <div className="rounded-3xl border border-purple-200/60 bg-white/80 p-5 shadow-lg">
      <p className="text-xs font-semibold uppercase tracking-[0.35em] text-purple-500">Step-by-step flow</p>
      <ol className="mt-4 grid gap-3 md:grid-cols-5">
        {items.map((step, index) => {
          const theme = statusThemes[step.status] || statusThemes.upcoming
          const statusLabel =
            step.status === 'complete'
              ? 'Complete'
              : step.status === 'current'
                ? 'In progress'
                : 'Pending'
          return (
            <li
              key={step.key || step.label || index}
              className={`flex h-full flex-col gap-3 rounded-2xl border p-4 transition ${theme.card}`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm font-bold ${theme.circle}`}
                >
                  {step.status === 'complete' ? '✓' : index + 1}
                </span>
                <div className="flex flex-col">
                  <span className={`text-sm font-semibold uppercase tracking-wide ${theme.title}`}>
                    {step.label}
                  </span>
                  <span className={`text-xs font-medium ${theme.status}`}>{statusLabel}</span>
                </div>
              </div>
              {step.description && (
                <p className={`text-sm leading-relaxed ${theme.description}`}>{step.description}</p>
              )}
              {step.note && step.note.trim() && (
                <p className={`text-xs ${noteToneStyles[step.noteTone] || noteToneStyles.info}`}>{step.note}</p>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export default ProcessFlow
