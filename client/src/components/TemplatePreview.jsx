import { useEffect, useMemo, useState } from 'react'

const cx = (...classes) => classes.filter(Boolean).join(' ')

const RESUME_TEMPLATE_PREVIEWS = {
  modern: {
    accent: 'from-indigo-500 via-purple-500 to-pink-500',
    container: 'border-purple-200 bg-white',
    sidebar: 'bg-gradient-to-b from-slate-900/90 to-slate-700/80',
    line: 'bg-slate-300/80',
    highlight: 'bg-purple-500/30',
    chip: 'bg-purple-100 text-purple-700'
  },
  professional: {
    accent: 'from-blue-700 via-slate-700 to-slate-900',
    container: 'border-slate-200 bg-slate-50',
    sidebar: 'bg-gradient-to-b from-blue-900/90 to-slate-800/80',
    line: 'bg-slate-300/70',
    highlight: 'bg-slate-700/20',
    chip: 'bg-blue-100 text-blue-700'
  },
  classic: {
    accent: 'from-amber-600 via-rose-500 to-rose-700',
    container: 'border-amber-200 bg-amber-50/60',
    sidebar: 'bg-gradient-to-b from-amber-900/90 to-rose-900/80',
    line: 'bg-amber-300/60',
    highlight: 'bg-amber-500/30',
    chip: 'bg-amber-100 text-amber-700'
  },
  2025: {
    accent: 'from-sky-500 via-cyan-400 to-emerald-400',
    container: 'border-cyan-200 bg-slate-900/90 text-slate-50',
    sidebar: 'bg-gradient-to-b from-slate-900 to-slate-800',
    line: 'bg-slate-600/80',
    highlight: 'bg-cyan-400/30',
    chip: 'bg-cyan-300/40 text-cyan-100'
  },
  ats: {
    accent: 'from-slate-600 via-slate-500 to-slate-400',
    container: 'border-slate-200 bg-white',
    sidebar: 'bg-slate-100',
    line: 'bg-slate-300/80',
    highlight: 'bg-slate-400/20',
    chip: 'bg-slate-200 text-slate-600'
  }
}

const COVER_TEMPLATE_PREVIEWS = {
  cover_modern: {
    header: 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white',
    border: 'border-purple-200 bg-white',
    line: 'bg-slate-200/80',
    highlight: 'bg-purple-500/10 text-purple-800',
    badge: 'bg-purple-100 text-purple-700'
  },
  cover_classic: {
    header: 'bg-gradient-to-r from-amber-700 via-amber-600 to-rose-600 text-amber-50',
    border: 'border-amber-200 bg-amber-50/70',
    line: 'bg-amber-200/80',
    highlight: 'bg-amber-500/15 text-amber-900',
    badge: 'bg-amber-100 text-amber-700'
  },
  cover_professional: {
    header: 'bg-gradient-to-r from-slate-900 via-blue-900 to-blue-700 text-slate-50',
    border: 'border-slate-300 bg-slate-50',
    line: 'bg-slate-200/80',
    highlight: 'bg-blue-500/10 text-blue-900',
    badge: 'bg-blue-100 text-blue-700'
  },
  cover_ats: {
    header: 'bg-gradient-to-r from-slate-700 via-slate-600 to-slate-500 text-white',
    border: 'border-slate-200 bg-white',
    line: 'bg-slate-300/70',
    highlight: 'bg-slate-400/10 text-slate-700',
    badge: 'bg-slate-200 text-slate-700'
  },
  cover_2025: {
    header: 'bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-500 text-cyan-100',
    border: 'border-slate-700 bg-slate-900 text-slate-100',
    line: 'bg-slate-600/80',
    highlight: 'bg-cyan-400/20 text-cyan-100',
    badge: 'bg-cyan-500/30 text-cyan-100'
  }
}

const DEFAULT_RESUME_PREVIEW = {
  accent: 'from-slate-700 via-slate-500 to-slate-400',
  container: 'border-slate-200 bg-white',
  sidebar: 'bg-slate-800/90',
  line: 'bg-slate-300/70',
  highlight: 'bg-slate-500/20',
  chip: 'bg-slate-200 text-slate-600'
}

const DEFAULT_COVER_PREVIEW = {
  header: 'bg-gradient-to-r from-slate-700 via-slate-600 to-slate-500 text-white',
  border: 'border-slate-200 bg-white',
  line: 'bg-slate-200/80',
  highlight: 'bg-slate-500/10'
}

const ResumeMockup = ({ style = {} }) => (
  <div
    className={cx('relative overflow-hidden rounded-3xl border shadow-inner', style.container)}
    aria-hidden="true"
  >
    <div className={cx('h-20 rounded-t-3xl bg-gradient-to-r', style.accent)}>
      <div className="absolute top-4 left-6 text-white">
        <div className="text-sm font-semibold tracking-wide uppercase">Alex Morgan</div>
        <div className="text-xs opacity-80">Product Manager</div>
      </div>
    </div>
    <div className="grid grid-cols-5 gap-4 p-5">
      <div className="col-span-2 space-y-3">
        <div className={cx('h-3 w-24 rounded-full', style.line)} />
        <div className={cx('h-3 w-20 rounded-full', style.line)} />
        <div className={cx('h-3 w-28 rounded-full', style.line)} />
        <div className={cx('h-24 rounded-2xl p-3 text-[10px] leading-relaxed', style.highlight)}>
          "Grew ARR 3x by orchestrating global product launches and data-informed iteration."
        </div>
        <div className={cx('h-3 w-16 rounded-full', style.line)} />
        <div className={cx('h-3 w-24 rounded-full', style.line)} />
        <div className={cx('h-16 rounded-2xl p-3 text-[10px] leading-relaxed', style.highlight)}>
          Keyword-rich skills, certifications, and JD-aligned highlights land here.
        </div>
      </div>
      <div className="col-span-3 space-y-3">
        <div className={cx('h-3 w-32 rounded-full', style.line)} />
        <div className={cx('h-3 w-40 rounded-full', style.line)} />
        <div className={cx('h-16 rounded-2xl p-3 text-[10px] leading-relaxed', style.highlight)}>
          Impact bullet points spotlight measurable wins using JD keywords.
        </div>
        <div className={cx('h-3 w-36 rounded-full', style.line)} />
        <div className={cx('h-24 rounded-2xl p-3 text-[10px] leading-relaxed', style.highlight)}>
          Modern typography, subtle dividers, and ATS-safe spacing keep recruiters engaged.
        </div>
      </div>
    </div>
    <div className={cx('absolute inset-y-20 left-0 w-20 rounded-r-3xl', style.sidebar)} />
  </div>
)

const CoverMockup = ({ style = {} }) => (
  <div
    className={cx('relative overflow-hidden rounded-3xl border shadow-inner', style.border)}
    aria-hidden="true"
  >
    <div className={cx('h-16 flex items-end px-6 pb-3 rounded-t-3xl', style.header)}>
      <div>
        <div className="text-sm font-semibold tracking-wide uppercase">Alex Morgan</div>
        <div className="text-xs opacity-80">alex.morgan@email.com</div>
      </div>
    </div>
    <div className="space-y-3 p-6">
      <div className={cx('h-3 w-40 rounded-full', style.line)} />
      <div className={cx('h-3 w-32 rounded-full', style.line)} />
      <div className={cx('h-24 rounded-2xl p-4 text-[10px] leading-relaxed', style.highlight)}>
        Engaging opener tailored to the role, mirroring the JD tone and priority keywords.
      </div>
      <div className={cx('h-3 w-36 rounded-full', style.line)} />
      <div className={cx('h-24 rounded-2xl p-4 text-[10px] leading-relaxed', style.highlight)}>
        Body paragraphs connect achievements to business outcomes, showing cultural and skills fit.
      </div>
      <div className={cx('h-3 w-28 rounded-full', style.line)} />
    </div>
  </div>
)

const ResumeCard = ({ label, option, style = {}, note, children }) => (
  <article className="space-y-4 rounded-3xl border border-purple-100 bg-white/80 p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-purple-500">{label}</p>
        <h3 className="text-xl font-bold text-purple-800">{option?.name || 'CV Template'}</h3>
        {option?.description && (
          <p className="mt-1 text-sm text-purple-600">{option.description}</p>
        )}
        {note && <p className="mt-2 text-xs font-semibold text-purple-500">{note}</p>}
      </div>
      <span
        className={cx(
          'px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide',
          style.chip || 'bg-purple-100 text-purple-700'
        )}
      >
        CV
      </span>
    </div>
    <ResumeMockup style={style} />
    {children ? <div className="pt-2">{children}</div> : null}
  </article>
)

const CoverCard = ({ label, option, style = {}, note, children }) => (
  <article className="space-y-4 rounded-3xl border border-purple-100 bg-white/80 p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-purple-500">{label}</p>
        <h3 className="text-xl font-bold text-purple-800">{option?.name || 'Cover Letter'}</h3>
        {option?.description && (
          <p className="mt-1 text-sm text-purple-600">{option.description}</p>
        )}
        {note && <p className="mt-2 text-xs font-semibold text-purple-500">{note}</p>}
      </div>
      <span
        className={cx(
          'px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide',
          style.badge || 'bg-purple-100 text-purple-700'
        )}
      >
        Cover
      </span>
    </div>
    <CoverMockup style={style} />
    {children ? <div className="pt-2">{children}</div> : null}
  </article>
)

function TemplatePreview({
  resumeTemplateId,
  resumeTemplateName,
  resumeTemplateDescription,
  coverTemplateId,
  coverTemplateName,
  coverTemplateDescription,
  availableResumeTemplates = [],
  availableCoverTemplates = [],
  onResumeTemplateApply,
  onCoverTemplateApply,
  isCoverLinkedToResume = false,
  isApplying = false
}) {
  const normalizedResumeTemplates = useMemo(() => {
    const registry = new Map()
    availableResumeTemplates.forEach((option) => {
      if (!option || typeof option !== 'object') return
      const id = option.id
      if (!id) return
      if (registry.has(id)) return
      registry.set(id, {
        id,
        name: option.name || resumeTemplateName || id,
        description: option.description || ''
      })
    })
    if (resumeTemplateId && !registry.has(resumeTemplateId)) {
      registry.set(resumeTemplateId, {
        id: resumeTemplateId,
        name: resumeTemplateName || resumeTemplateId,
        description: resumeTemplateDescription || ''
      })
    }
    return Array.from(registry.values())
  }, [
    availableResumeTemplates,
    resumeTemplateDescription,
    resumeTemplateId,
    resumeTemplateName
  ])

  const normalizedCoverTemplates = useMemo(() => {
    const registry = new Map()
    availableCoverTemplates.forEach((option) => {
      if (!option || typeof option !== 'object') return
      const id = option.id
      if (!id) return
      if (registry.has(id)) return
      registry.set(id, {
        id,
        name: option.name || coverTemplateName || id,
        description: option.description || ''
      })
    })
    if (coverTemplateId && !registry.has(coverTemplateId)) {
      registry.set(coverTemplateId, {
        id: coverTemplateId,
        name: coverTemplateName || coverTemplateId,
        description: coverTemplateDescription || ''
      })
    }
    return Array.from(registry.values())
  }, [
    availableCoverTemplates,
    coverTemplateDescription,
    coverTemplateId,
    coverTemplateName
  ])

  const [previewResumeTemplateId, setPreviewResumeTemplateId] = useState(
    resumeTemplateId || normalizedResumeTemplates[0]?.id || ''
  )
  const [previewCoverTemplateId, setPreviewCoverTemplateId] = useState(
    coverTemplateId || normalizedCoverTemplates[0]?.id || ''
  )
  const [resumeComparisonSelections, setResumeComparisonSelections] = useState(() => {
    const initialId = resumeTemplateId || normalizedResumeTemplates[0]?.id
    return initialId ? [initialId] : []
  })
  const [coverComparisonSelections, setCoverComparisonSelections] = useState(() => {
    const initialId = coverTemplateId || normalizedCoverTemplates[0]?.id
    return initialId ? [initialId] : []
  })

  useEffect(() => {
    if (!resumeTemplateId) return
    setPreviewResumeTemplateId(resumeTemplateId)
  }, [resumeTemplateId])

  useEffect(() => {
    if (!coverTemplateId) return
    setPreviewCoverTemplateId(coverTemplateId)
  }, [coverTemplateId])

  useEffect(() => {
    setResumeComparisonSelections((prev) => {
      if (!prev?.length) return prev
      const validOptions = new Set(normalizedResumeTemplates.map((option) => option.id))
      const filtered = prev.filter((id) => validOptions.has(id))
      return filtered.length ? filtered : []
    })
  }, [normalizedResumeTemplates])

  useEffect(() => {
    setCoverComparisonSelections((prev) => {
      if (!prev?.length) return prev
      const validOptions = new Set(normalizedCoverTemplates.map((option) => option.id))
      const filtered = prev.filter((id) => validOptions.has(id))
      return filtered.length ? filtered : []
    })
  }, [normalizedCoverTemplates])

  const previewResumeOption = useMemo(() => {
    return (
      normalizedResumeTemplates.find((option) => option.id === previewResumeTemplateId) ||
      normalizedResumeTemplates[0] || {
        id: resumeTemplateId,
        name: resumeTemplateName,
        description: resumeTemplateDescription
      }
    )
  }, [
    normalizedResumeTemplates,
    previewResumeTemplateId,
    resumeTemplateDescription,
    resumeTemplateId,
    resumeTemplateName
  ])

  const previewCoverOption = useMemo(() => {
    return (
      normalizedCoverTemplates.find((option) => option.id === previewCoverTemplateId) ||
      normalizedCoverTemplates[0] || {
        id: coverTemplateId,
        name: coverTemplateName,
        description: coverTemplateDescription
      }
    )
  }, [
    coverTemplateDescription,
    coverTemplateId,
    coverTemplateName,
    normalizedCoverTemplates,
    previewCoverTemplateId
  ])

  const appliedResumeOption = useMemo(() => {
    if (!resumeTemplateId) return null
    return (
      normalizedResumeTemplates.find((option) => option.id === resumeTemplateId) || {
        id: resumeTemplateId,
        name: resumeTemplateName || resumeTemplateId,
        description: resumeTemplateDescription || ''
      }
    )
  }, [
    normalizedResumeTemplates,
    resumeTemplateDescription,
    resumeTemplateId,
    resumeTemplateName
  ])

  const appliedCoverOption = useMemo(() => {
    if (!coverTemplateId) return null
    return (
      normalizedCoverTemplates.find((option) => option.id === coverTemplateId) || {
        id: coverTemplateId,
        name: coverTemplateName || coverTemplateId,
        description: coverTemplateDescription || ''
      }
    )
  }, [
    coverTemplateDescription,
    coverTemplateId,
    coverTemplateName,
    normalizedCoverTemplates
  ])

  const resumeStyle =
    RESUME_TEMPLATE_PREVIEWS[previewResumeOption?.id] || DEFAULT_RESUME_PREVIEW
  const coverStyle =
    COVER_TEMPLATE_PREVIEWS[previewCoverOption?.id] || DEFAULT_COVER_PREVIEW

  const appliedResumeStyle =
    RESUME_TEMPLATE_PREVIEWS[appliedResumeOption?.id] || DEFAULT_RESUME_PREVIEW
  const appliedCoverStyle =
    COVER_TEMPLATE_PREVIEWS[appliedCoverOption?.id] || DEFAULT_COVER_PREVIEW

  const appliedResumeName =
    appliedResumeOption?.name || resumeTemplateName || resumeTemplateId || 'your current CV style'
  const appliedCoverName =
    appliedCoverOption?.name || coverTemplateName || coverTemplateId || 'your current cover style'

  const independentCoverDescriptor = useMemo(() => {
    if (!appliedCoverName || typeof appliedCoverName !== 'string') {
      return 'your selected cover letter style'
    }
    const trimmed = appliedCoverName.trim()
    if (!trimmed) {
      return 'your selected cover letter style'
    }
    if (/cover/i.test(trimmed)) {
      return trimmed
    }
    return `${trimmed} cover letter style`
  }, [appliedCoverName])

  const isPreviewingDifferentResume =
    previewResumeOption?.id && resumeTemplateId && previewResumeOption.id !== resumeTemplateId
  const isPreviewingDifferentCover =
    previewCoverOption?.id && coverTemplateId && previewCoverOption.id !== coverTemplateId

  const normalizedResumeComparisonSelections = useMemo(() => {
    if (!resumeComparisonSelections?.length) return []
    const unique = Array.from(new Set(resumeComparisonSelections))
    const resolved = unique
      .map((id) => normalizedResumeTemplates.find((option) => option.id === id))
      .filter(Boolean)
      .slice(0, 2)
    return resolved
  }, [resumeComparisonSelections, normalizedResumeTemplates])

  const normalizedCoverComparisonSelections = useMemo(() => {
    if (!coverComparisonSelections?.length) return []
    const unique = Array.from(new Set(coverComparisonSelections))
    const resolved = unique
      .map((id) => normalizedCoverTemplates.find((option) => option.id === id))
      .filter(Boolean)
      .slice(0, 2)
    return resolved
  }, [coverComparisonSelections, normalizedCoverTemplates])

  const hasCustomResumeComparison = normalizedResumeComparisonSelections.length >= 2
  const hasCustomCoverComparison = normalizedCoverComparisonSelections.length >= 2

  const toggleResumeComparisonSelection = (templateId) => {
    if (!templateId) return
    setResumeComparisonSelections((prev = []) => {
      const exists = prev.includes(templateId)
      let next = exists ? prev.filter((id) => id !== templateId) : [...prev, templateId]
      if (next.length > 2) {
        next = next.slice(next.length - 2)
      }
      return next
    })
  }

  const toggleCoverComparisonSelection = (templateId) => {
    if (!templateId) return
    setCoverComparisonSelections((prev = []) => {
      const exists = prev.includes(templateId)
      let next = exists ? prev.filter((id) => id !== templateId) : [...prev, templateId]
      if (next.length > 2) {
        next = next.slice(next.length - 2)
      }
      return next
    })
  }

  const resumeCards = hasCustomResumeComparison
    ? normalizedResumeComparisonSelections.map((option, index) => {
        const style = RESUME_TEMPLATE_PREVIEWS[option?.id] || DEFAULT_RESUME_PREVIEW
        const isApplied = option?.id === resumeTemplateId
        return {
          key: option?.id || `resume-comparison-${index}`,
          label: `Comparison choice ${index + 1}`,
          option,
          style,
          note: isApplied
            ? 'This template is currently selected for your downloads.'
            : 'Apply this template to use it for your downloads.',
          canApply: !isApplied && Boolean(onResumeTemplateApply)
        }
      })
    : [
        {
          key: previewResumeOption?.id || 'resume-preview',
          label: isPreviewingDifferentResume ? 'Previewing CV template' : 'Selected CV template',
          option: previewResumeOption,
          style: resumeStyle,
          note: isPreviewingDifferentResume
            ? 'Apply this look to replace your current selection.'
            : 'Already applied to your downloads.',
          canApply: isPreviewingDifferentResume && Boolean(onResumeTemplateApply)
        },
        ...(isPreviewingDifferentResume && appliedResumeOption
          ? [
              {
                key: appliedResumeOption.id,
                label: 'Currently selected CV',
                option: appliedResumeOption,
                style: appliedResumeStyle,
                note: 'This is the template currently used for your downloads.',
                canApply: false
              }
            ]
          : [])
      ]

  const coverCards = hasCustomCoverComparison
    ? normalizedCoverComparisonSelections.map((option, index) => {
        const style = COVER_TEMPLATE_PREVIEWS[option?.id] || DEFAULT_COVER_PREVIEW
        const isApplied = option?.id === coverTemplateId
        return {
          key: option?.id || `cover-comparison-${index}`,
          label: `Comparison choice ${index + 1}`,
          option,
          style,
          note: isApplied
            ? 'This cover letter style is currently selected for your downloads.'
            : isCoverLinkedToResume
            ? 'Apply this cover letter style to break the sync with your CV template and use it for your downloads.'
            : 'Apply this cover letter style to use it for your downloads.',
          canApply: !isApplied && Boolean(onCoverTemplateApply)
        }
      })
    : [
        {
          key: previewCoverOption?.id || 'cover-preview',
          label: isPreviewingDifferentCover
            ? 'Previewing cover letter template'
            : 'Selected cover letter template',
          option: previewCoverOption,
          style: coverStyle,
          note: isPreviewingDifferentCover
            ? isCoverLinkedToResume
              ? 'Apply this look to break the sync with your CV template and refresh your cover letter style.'
              : 'Apply this look to replace your current cover letter style.'
            : 'Already applied to your downloads.',
          canApply: isPreviewingDifferentCover && Boolean(onCoverTemplateApply)
        },
        ...(isPreviewingDifferentCover && appliedCoverOption
          ? [
              {
                key: appliedCoverOption.id,
                label: 'Currently selected cover letter',
                option: appliedCoverOption,
                style: appliedCoverStyle,
                note: 'This is the template currently used for your downloads.',
                canApply: false
              }
            ]
          : [])
      ]

  const resumeGridColumns = hasCustomResumeComparison
    ? 'md:grid-cols-2'
    : resumeCards.length > 1
      ? 'md:grid-cols-2'
      : 'grid-cols-1'

  const coverGridColumns = hasCustomCoverComparison
    ? 'md:grid-cols-2'
    : coverCards.length > 1
      ? 'md:grid-cols-2'
      : 'grid-cols-1'

  return (
    <section className="rounded-3xl border border-purple-100 bg-white/80 shadow-xl p-6 space-y-6" aria-label="Template previews">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-purple-800">Preview Your Look &amp; Feel</h2>
          <p className="text-sm text-purple-600">
            See how your enhanced CV and cover letter will be styled before you download them.
          </p>
        </div>
        <span className="text-xs font-semibold uppercase tracking-[0.35em] text-purple-500">
          Live Preview
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-purple-500">CV Template Preview</p>
            <h3 className="text-xl font-bold text-purple-800">{previewResumeOption?.name}</h3>
            {previewResumeOption?.description && (
              <p className="mt-1 text-sm text-purple-600">{previewResumeOption.description}</p>
            )}
            <p className="mt-2 text-xs font-semibold text-purple-500">
              {isPreviewingDifferentResume
                ? `Currently applied: ${appliedResumeName}. Compare them below before updating.`
                : 'This template is already applied to your downloads.'}
            </p>
          </div>
          {normalizedResumeTemplates.length > 1 && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Preview CV templates">
                {normalizedResumeTemplates.map((option) => {
                  const isActive = option.id === previewResumeOption?.id
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={cx(
                        'rounded-full border px-3 py-1 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-purple-300',
                        isActive
                          ? 'border-purple-400 bg-purple-100 text-purple-700 shadow-sm'
                          : 'border-purple-200 bg-white text-purple-500 hover:border-purple-300 hover:text-purple-600'
                      )}
                      onClick={() => setPreviewResumeTemplateId(option.id)}
                    >
                      {option.name}
                      {option.id === resumeTemplateId && (
                        <span className="ml-1 text-[10px] uppercase tracking-wide text-purple-500">
                          Selected
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
              <div className="rounded-2xl border border-purple-100 bg-purple-50/40 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-purple-500">
                  Compare CV templates
                </p>
                <p className="mt-1 text-[11px] text-purple-600">
                  Pick two styles to see them side-by-side before applying.
                </p>
                <div className="mt-3 flex flex-wrap gap-3" role="group" aria-label="Select CV templates to compare">
                  {normalizedResumeTemplates.map((option) => {
                    const isSelected = resumeComparisonSelections.includes(option.id)
                    return (
                      <label
                        key={`resume-compare-${option.id}`}
                        className={cx(
                          'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition focus-within:outline-none focus-within:ring-2 focus-within:ring-purple-300',
                          isSelected
                            ? 'border-purple-400 bg-white text-purple-700 shadow-sm'
                            : 'border-purple-200 bg-white/70 text-purple-500 hover:border-purple-300 hover:text-purple-600'
                        )}
                      >
                        <input
                          type="checkbox"
                          className="h-3 w-3 rounded border-purple-300 text-purple-500 focus:ring-purple-400"
                          checked={isSelected}
                          onChange={() => toggleResumeComparisonSelection(option.id)}
                          aria-label={`Compare ${option.name} CV template`}
                        />
                        <span>{option.name}</span>
                      </label>
                    )
                  })}
                </div>
                {hasCustomResumeComparison ? null : (
                  <p className="mt-2 text-[10px] text-purple-500">
                    Select two templates to activate the comparison view.
                  </p>
                )}
              </div>
            </div>
          )}
          <div className={cx('grid gap-4', resumeGridColumns)}>
            {resumeCards.map(({ key, label, option, style, note, canApply }) => (
              <ResumeCard key={key} label={label} option={option} style={style} note={note}>
                {canApply && option?.id && onResumeTemplateApply && (
                  <button
                    type="button"
                    className="inline-flex items-center rounded-full border border-purple-200 bg-white px-3 py-1 text-xs font-semibold text-purple-600 shadow-sm transition hover:border-purple-300 hover:text-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => onResumeTemplateApply(option.id)}
                    disabled={isApplying}
                  >
                    {isApplying ? 'Updating…' : 'Use this CV style'}
                  </button>
                )}
              </ResumeCard>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-purple-500">Cover Letter Preview</p>
            <h3 className="text-xl font-bold text-purple-800">{previewCoverOption?.name}</h3>
            {previewCoverOption?.description && (
              <p className="mt-1 text-sm text-purple-600">{previewCoverOption.description}</p>
            )}
            <p className="mt-2 text-xs font-semibold text-purple-500">
              {isPreviewingDifferentCover
                ? `Currently applied: ${appliedCoverName}. Compare styles below before updating.`
                : 'This template is already applied to your downloads.'}
            </p>
            <p className="mt-1 text-xs text-purple-500">
              {isCoverLinkedToResume
                ? 'Cover letters stay synced with your CV until you pick a new style or turn off “Match CV style”.'
                : `Cover letters stay in the ${independentCoverDescriptor} even if you swap CV templates.`}
            </p>
          </div>
          {normalizedCoverTemplates.length > 1 && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Preview cover letter templates">
                {normalizedCoverTemplates.map((option) => {
                  const isActive = option.id === previewCoverOption?.id
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={cx(
                        'rounded-full border px-3 py-1 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-purple-300',
                        isActive
                          ? 'border-purple-400 bg-purple-100 text-purple-700 shadow-sm'
                          : 'border-purple-200 bg-white text-purple-500 hover:border-purple-300 hover:text-purple-600'
                      )}
                      onClick={() => setPreviewCoverTemplateId(option.id)}
                    >
                      {option.name}
                      {option.id === coverTemplateId && (
                        <span className="ml-1 text-[10px] uppercase tracking-wide text-purple-500">
                          Selected
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
              <div className="rounded-2xl border border-purple-100 bg-purple-50/40 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-purple-500">
                  Compare cover letter templates
                </p>
                <p className="mt-1 text-[11px] text-purple-600">
                  Pick two styles to review side-by-side before applying.
                </p>
                <div className="mt-3 flex flex-wrap gap-3" role="group" aria-label="Select cover letter templates to compare">
                  {normalizedCoverTemplates.map((option) => {
                    const isSelected = coverComparisonSelections.includes(option.id)
                    return (
                      <label
                        key={`cover-compare-${option.id}`}
                        className={cx(
                          'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition focus-within:outline-none focus-within:ring-2 focus-within:ring-purple-300',
                          isSelected
                            ? 'border-purple-400 bg-white text-purple-700 shadow-sm'
                            : 'border-purple-200 bg-white/70 text-purple-500 hover:border-purple-300 hover:text-purple-600'
                        )}
                      >
                        <input
                          type="checkbox"
                          className="h-3 w-3 rounded border-purple-300 text-purple-500 focus:ring-purple-400"
                          checked={isSelected}
                          onChange={() => toggleCoverComparisonSelection(option.id)}
                          aria-label={`Compare ${option.name} cover letter template`}
                        />
                        <span>{option.name}</span>
                      </label>
                    )
                  })}
                </div>
                {hasCustomCoverComparison ? null : (
                  <p className="mt-2 text-[10px] text-purple-500">
                    Select two templates to activate the comparison view.
                  </p>
                )}
              </div>
            </div>
          )}
          <div className={cx('grid gap-4', coverGridColumns)}>
            {coverCards.map(({ key, label, option, style, note, canApply }) => (
              <CoverCard key={key} label={label} option={option} style={style} note={note}>
                {canApply && option?.id && onCoverTemplateApply && (
                  <button
                    type="button"
                    className="inline-flex items-center rounded-full border border-purple-200 bg-white px-3 py-1 text-xs font-semibold text-purple-600 shadow-sm transition hover:border-purple-300 hover:text-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => onCoverTemplateApply(option.id)}
                    disabled={isApplying}
                  >
                    {isApplying ? 'Updating…' : 'Use this cover style'}
                  </button>
                )}
              </CoverCard>
            ))}
          </div>
        </div>
      </div>

      <p className="text-xs text-purple-500">
        Tap through the template chips or choose two templates to compare side-by-side and lock in your favourite look
        before downloading.
      </p>
    </section>
  )
}

export default TemplatePreview
