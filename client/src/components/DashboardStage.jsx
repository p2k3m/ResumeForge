const accentThemes = {
  indigo: {
    border: 'border-indigo-200/70',
    stage: 'text-indigo-500',
    title: 'text-indigo-900',
    description: 'text-indigo-700/80'
  },
  purple: {
    border: 'border-purple-200/70',
    stage: 'text-purple-500',
    title: 'text-purple-900',
    description: 'text-purple-700/80'
  },
  slate: {
    border: 'border-slate-200/70',
    stage: 'text-slate-500',
    title: 'text-slate-900',
    description: 'text-slate-700/80'
  }
}

function joinClasses(...values) {
  return values.filter(Boolean).join(' ')
}

function DashboardStage({
  stageLabel,
  title,
  description,
  actions,
  children,
  accent = 'purple',
  className = '',
  contentClassName = 'space-y-6'
}) {
  const theme = accentThemes[accent] || accentThemes.purple

  return (
    <section
      className={joinClasses(
        'space-y-5 rounded-3xl border bg-white/90 p-6 shadow-xl backdrop-blur',
        theme.border,
        className
      )}
    >
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          {stageLabel && (
            <p className={joinClasses('text-xs font-semibold uppercase tracking-[0.35em]', theme.stage)}>
              {stageLabel}
            </p>
          )}
          {title && <h2 className={joinClasses('text-2xl font-bold', theme.title)}>{title}</h2>}
          {description && <p className={joinClasses('text-sm', theme.description)}>{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-col gap-2 md:items-end">{actions}</div>}
      </header>
      {contentClassName === null ? children : <div className={contentClassName}>{children}</div>}
    </section>
  )
}

export default DashboardStage
