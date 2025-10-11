import { canonicalizeTemplateId } from '../templateRegistry.js'

const TEMPLATE_PREVIEW_VARIANTS = {
  modern: {
    accent: 'bg-gradient-to-r from-purple-500 to-purple-600',
    highlight: 'bg-purple-100',
    bullet: 'bg-purple-400',
    border: 'border-purple-200',
    layout: 'two-column'
  },
  professional: {
    accent: 'bg-blue-600',
    highlight: 'bg-blue-100',
    bullet: 'bg-blue-400',
    border: 'border-blue-200',
    layout: 'two-column'
  },
  classic: {
    accent: 'bg-amber-600',
    highlight: 'bg-amber-100',
    bullet: 'bg-amber-400',
    border: 'border-amber-200',
    layout: 'two-column'
  },
  ats: {
    accent: 'bg-slate-700',
    highlight: 'bg-slate-200',
    bullet: 'bg-slate-500',
    border: 'border-slate-300',
    layout: 'single-column'
  },
  '2025': {
    accent: 'bg-gradient-to-r from-sky-500 to-indigo-500',
    highlight: 'bg-sky-100',
    bullet: 'bg-indigo-400',
    border: 'border-indigo-200',
    layout: 'modular'
  }
}

const DEFAULT_PREVIEW_VARIANT = {
  accent: 'bg-purple-500',
  highlight: 'bg-purple-100',
  bullet: 'bg-purple-400',
  border: 'border-purple-200',
  layout: 'two-column'
}

const stripCoverPrefix = (templateId) => {
  if (typeof templateId !== 'string') return ''
  if (templateId.startsWith('cover_')) {
    return templateId.replace(/^cover_/, '')
  }
  return templateId
}

export const getTemplatePreviewVariant = (templateId) => {
  const normalized = stripCoverPrefix(templateId)
  const canonical = canonicalizeTemplateId(normalized)
  if (canonical && TEMPLATE_PREVIEW_VARIANTS[canonical]) {
    return TEMPLATE_PREVIEW_VARIANTS[canonical]
  }
  if (typeof templateId === 'string' && TEMPLATE_PREVIEW_VARIANTS[templateId]) {
    return TEMPLATE_PREVIEW_VARIANTS[templateId]
  }
  return DEFAULT_PREVIEW_VARIANT
}

function TemplatePreviewThumbnail({ templateId, variant, testId, className }) {
  const resolvedVariant = variant || getTemplatePreviewVariant(templateId)
  const { accent, highlight, bullet, border, layout } = resolvedVariant
  const dimensionClasses = className?.trim() ? `w-full ${className.trim()}` : 'h-28 w-full'
  const containerBase = `overflow-hidden rounded-xl border ${border} bg-white p-2 shadow-inner`

  if (layout === 'single-column') {
    return (
      <div
        className={`${containerBase} ${dimensionClasses} flex flex-col gap-2`}
        data-testid={testId}
        aria-hidden="true"
      >
        <div className={`h-5 w-2/5 rounded-md ${accent}`}></div>
        <div className="space-y-1">
          <div className={`h-2.5 w-4/5 rounded-full ${highlight}`}></div>
          <div className="h-1.5 w-full rounded-full bg-slate-200"></div>
          <div className="h-1.5 w-11/12 rounded-full bg-slate-200"></div>
        </div>
        <div className="space-y-1">
          <div className={`h-2.5 w-3/5 rounded-full ${highlight}`}></div>
          <div className="h-1.5 w-full rounded-full bg-slate-200"></div>
          <div className="h-1.5 w-10/12 rounded-full bg-slate-200"></div>
        </div>
        <div className="grid grid-cols-2 gap-1 pt-1">
          <div className={`h-2.5 rounded ${highlight}`}></div>
          <div className={`h-2.5 rounded ${highlight}`}></div>
        </div>
      </div>
    )
  }

  if (layout === 'modular') {
    return (
      <div
        className={`${containerBase} ${dimensionClasses} flex flex-col gap-2`}
        data-testid={testId}
        aria-hidden="true"
      >
        <div className="flex items-center justify-between">
          <div className={`h-4 w-1/3 rounded-full ${accent}`}></div>
          <div className="flex gap-1">
            <div className={`h-2.5 w-6 rounded-full ${accent}`}></div>
            <div className={`h-2.5 w-6 rounded-full ${highlight}`}></div>
          </div>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-1.5">
          <div className="space-y-1.5">
            <div className={`h-2 w-11/12 rounded-full ${highlight}`}></div>
            <div className="h-1.5 w-full rounded-full bg-slate-200"></div>
            <div className="h-1.5 w-10/12 rounded-full bg-slate-200"></div>
            <div className={`h-8 rounded-lg ${highlight}`}></div>
          </div>
          <div className="space-y-1.5">
            <div className={`h-2 w-3/4 rounded-full ${accent}`}></div>
            <div className="h-1.5 w-full rounded-full bg-slate-200"></div>
            <div className="grid grid-cols-2 gap-1 pt-1">
              <div className={`h-6 rounded ${highlight}`}></div>
              <div className="flex flex-col justify-between rounded bg-slate-100 p-1">
                <div className={`h-1 rounded-full ${accent}`}></div>
                <div className={`h-1 rounded-full ${bullet}`}></div>
                <div className={`h-1 rounded-full ${accent}`}></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`${containerBase} ${dimensionClasses} flex gap-2`}
      data-testid={testId}
      aria-hidden="true"
    >
      <div className="flex w-2/5 flex-col gap-1.5">
        <div className={`h-6 w-4/5 rounded-md ${accent}`}></div>
        <div className={`h-2.5 w-3/5 rounded-full ${highlight}`}></div>
        <div className="space-y-1 pt-1">
          <div className={`h-2 w-full rounded-full ${highlight}`}></div>
          <div className={`h-2 w-5/6 rounded-full ${highlight}`}></div>
          <div className="space-y-1.5 pt-1">
            <div className={`h-1.5 w-full rounded-full ${bullet}`}></div>
            <div className={`h-1.5 w-4/5 rounded-full ${bullet}`}></div>
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <div className={`h-1.5 w-1.5 rounded-full ${bullet}`}></div>
                <div className="h-1.5 flex-1 rounded-full bg-slate-200"></div>
              </div>
              <div className="flex items-center gap-1">
                <div className={`h-1.5 w-1.5 rounded-full ${bullet}`}></div>
                <div className="h-1.5 flex-1 rounded-full bg-slate-200"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 space-y-1.5">
        <div className={`h-3 w-11/12 rounded-full ${accent}`}></div>
        <div className="space-y-1">
          <div className="h-1.5 w-full rounded-full bg-slate-200"></div>
          <div className="h-1.5 w-10/12 rounded-full bg-slate-200"></div>
          <div className="h-1.5 w-9/12 rounded-full bg-slate-200"></div>
        </div>
        <div className="space-y-1">
          <div className={`h-2 w-3/4 rounded-full ${highlight}`}></div>
          <div className="h-1.5 w-full rounded-full bg-slate-200"></div>
          <div className="h-1.5 w-11/12 rounded-full bg-slate-200"></div>
        </div>
      </div>
    </div>
  )
}

export default TemplatePreviewThumbnail
