import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { formatMatchMessage } from './formatMatchMessage.js'
import { buildApiUrl, resolveApiBase } from './resolveApiBase.js'
import ATSScoreDashboard from './components/ATSScoreDashboard.jsx'
import InfoTooltip from './components/InfoTooltip.jsx'
import TemplateSelector from './components/TemplateSelector.jsx'
import DeltaSummaryPanel from './components/DeltaSummaryPanel.jsx'
import ProcessFlow from './components/ProcessFlow.jsx'
import ChangeComparisonView from './components/ChangeComparisonView.jsx'
import JobDescriptionPreview from './components/JobDescriptionPreview.jsx'
import summaryIcon from './assets/icon-summary.svg'
import skillsIcon from './assets/icon-skills.svg'
import experienceIcon from './assets/icon-experience.svg'
import designationIcon from './assets/icon-designation.svg'
import certificationsIcon from './assets/icon-certifications.svg'
import projectsIcon from './assets/icon-projects.svg'
import highlightsIcon from './assets/icon-highlights.svg'
import enhanceIcon from './assets/icon-enhance.svg'
import qrOptimisedResume from './assets/qr-optimised-resume.svg'
import { deriveDeltaSummary } from './deriveDeltaSummary.js'
import { createCoverLetterPdf } from './utils/createCoverLetterPdf.js'

const CV_GENERATION_ERROR_MESSAGE =
  'Could not enhance CV; your formatting remained untouched.'

const improvementActions = [
  {
    key: 'improve-summary',
    label: 'Improve Summary',
    helper: 'Refresh your summary to mirror the JD tone and keywords.',
    icon: summaryIcon
  },
  {
    key: 'add-missing-skills',
    label: 'Improve Skills',
    helper: 'Blend missing keywords into the skills and experience sections.',
    icon: skillsIcon
  },
  {
    key: 'align-experience',
    label: 'Improve Experience',
    helper: 'Emphasise accomplishments that mirror the job requirements.',
    icon: experienceIcon
  },
  {
    key: 'change-designation',
    label: 'Improve Designation',
    helper: 'Align your visible job title with the target role.',
    icon: designationIcon
  },
  {
    key: 'improve-certifications',
    label: 'Improve Certifications',
    helper: 'Surface credentials that validate your readiness for this JD.',
    icon: certificationsIcon
  },
  {
    key: 'improve-projects',
    label: 'Improve Projects',
    helper: 'Spotlight portfolio wins that map directly to the role priorities.',
    icon: projectsIcon
  },
  {
    key: 'improve-highlights',
    label: 'Improve Highlights',
    helper: 'Refine top achievements so they echo the job’s success metrics.',
    icon: highlightsIcon
  },
  {
    key: 'enhance-all',
    label: 'Enhance All',
    helper: 'Apply every improvement in one pass for a best-fit CV.',
    icon: enhanceIcon
  }
]

function summariseItems(items, { limit = 5 } = {}) {
  const list = Array.isArray(items)
    ? items
        .map((item) => (typeof item === 'string' ? item.trim() : String(item || '').trim()))
        .filter(Boolean)
    : []
  if (!list.length) return ''
  const unique = Array.from(new Set(list))
  if (unique.length <= limit) {
    return unique.join(', ')
  }
  const shown = unique.slice(0, limit).join(', ')
  const remaining = unique.length - limit
  return `${shown}, and ${remaining} more`
}

function toUniqueList(items) {
  if (!Array.isArray(items)) return []
  const seen = new Set()
  const output = []
  items.forEach((item) => {
    const text = typeof item === 'string' ? item.trim() : String(item || '').trim()
    if (!text) return
    const key = text.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    output.push(text)
  })
  return output
}

function formatReadableList(items) {
  const list = toUniqueList(Array.isArray(items) ? items : [items])
  if (!list.length) return ''
  if (list.length === 1) return list[0]
  if (list.length === 2) return `${list[0]} and ${list[1]}`
  return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`
}

const COVER_LETTER_TYPES = new Set(['cover_letter1', 'cover_letter2'])

function isCoverLetterType(type) {
  return COVER_LETTER_TYPES.has(type)
}

function deriveCoverLetterStateFromFiles(files) {
  const drafts = {}
  const originals = {}
  if (!Array.isArray(files)) {
    return { drafts, originals }
  }
  files.forEach((file) => {
    if (!file || typeof file !== 'object') return
    const type = file.type
    if (!isCoverLetterType(type)) return
    const text = typeof file.text === 'string' ? file.text : ''
    drafts[type] = text
    originals[type] = text
  })
  return { drafts, originals }
}

function normaliseReasonLines(reason) {
  if (!reason) return []
  if (Array.isArray(reason)) {
    return reason
      .map((line) => (typeof line === 'string' ? line.trim() : String(line || '').trim()))
      .filter(Boolean)
  }
  if (typeof reason === 'string') {
    const trimmed = reason.trim()
    return trimmed ? [trimmed] : []
  }
  return []
}

function buildActionableHint(segment) {
  if (!segment || typeof segment !== 'object') return null
  const sectionLabel = [segment.section, segment.label, segment.key]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .find(Boolean)
  const addedText = formatReadableList(Array.isArray(segment.added) ? segment.added : [])
  const removedText = formatReadableList(Array.isArray(segment.removed) ? segment.removed : [])
  const reasonText = normaliseReasonLines(segment.reason).join(' ')

  const detailParts = []
  if (addedText) {
    detailParts.push(`Added ${addedText}`)
  }
  if (removedText) {
    detailParts.push(`Reworked ${removedText}`)
  }
  if (reasonText) {
    detailParts.push(reasonText)
  }

  if (!detailParts.length) {
    return null
  }

  const detail = detailParts.join(' • ')
  return sectionLabel ? `${sectionLabel}: ${detail}` : detail
}

function formatEnhanceAllSummary(entries) {
  if (!Array.isArray(entries) || !entries.length) {
    return ''
  }

  const segments = entries
    .map((entry) => {
      if (!entry) return ''
      const sectionLabel = (entry.section || entry.label || entry.key || '').trim() || 'Update'
      const added = summariseItems(entry.added, { limit: 4 })
      const removed = summariseItems(entry.removed, { limit: 4 })
      const reasonLines = Array.isArray(entry.reason)
        ? entry.reason.filter(Boolean)
        : typeof entry.reason === 'string' && entry.reason.trim()
          ? [entry.reason.trim()]
          : []
      const reasonText = reasonLines.join(' ')
      const detailParts = [
        reasonText,
        added ? `Added ${added}.` : '',
        removed ? `Removed ${removed}.` : ''
      ]
        .map((part) => part.trim())
        .filter(Boolean)
      const detailText = detailParts.join(' ')
      return `${sectionLabel}: ${detailText || 'Updated to align with the JD.'}`
    })
    .filter(Boolean)

  return segments.join(' · ')
}

const highlightToneStyles = {
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  info: 'bg-sky-50 border-sky-200 text-sky-800'
}

function formatStatusLabel(status) {
  if (!status) return ''
  const normalized = String(status).replace(/[-_]/g, ' ').trim()
  if (!normalized) return ''
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase())
}

const jobFitToneStyles = {
  match: {
    container: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    bar: 'bg-emerald-500',
    chip: 'bg-emerald-500/10 text-emerald-700',
    scoreText: 'text-emerald-700'
  },
  success: {
    container: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    bar: 'bg-emerald-500',
    chip: 'bg-emerald-500/10 text-emerald-700',
    scoreText: 'text-emerald-700'
  },
  partial: {
    container: 'bg-amber-50 border-amber-200 text-amber-800',
    bar: 'bg-amber-500',
    chip: 'bg-amber-500/10 text-amber-700',
    scoreText: 'text-amber-700'
  },
  info: {
    container: 'bg-sky-50 border-sky-200 text-sky-800',
    bar: 'bg-sky-500',
    chip: 'bg-sky-500/10 text-sky-700',
    scoreText: 'text-sky-700'
  },
  gap: {
    container: 'bg-amber-50 border-amber-200 text-amber-800',
    bar: 'bg-amber-500',
    chip: 'bg-amber-500/10 text-amber-700',
    scoreText: 'text-amber-700'
  },
  warning: {
    container: 'bg-amber-50 border-amber-200 text-amber-800',
    bar: 'bg-amber-500',
    chip: 'bg-amber-500/10 text-amber-700',
    scoreText: 'text-amber-700'
  },
  mismatch: {
    container: 'bg-amber-50 border-amber-200 text-amber-800',
    bar: 'bg-amber-500',
    chip: 'bg-amber-500/10 text-amber-700',
    scoreText: 'text-amber-700'
  },
  unknown: {
    container: 'bg-slate-50 border-slate-200 text-slate-700',
    bar: 'bg-slate-400',
    chip: 'bg-slate-400/20 text-slate-600',
    scoreText: 'text-slate-700'
  },
  default: {
    container: 'bg-slate-50 border-slate-200 text-slate-700',
    bar: 'bg-slate-400',
    chip: 'bg-slate-400/20 text-slate-600',
    scoreText: 'text-slate-700'
  }
}

const TEMPLATE_ALIASES = {}

const COVER_TEMPLATE_IDS = ['cover_modern', 'cover_classic']

const COVER_TEMPLATE_ALIASES = {
  modern: 'cover_modern',
  classic: 'cover_classic',
  'cover-modern': 'cover_modern',
  'cover-classic': 'cover_classic',
  'modern-cover': 'cover_modern',
  'classic-cover': 'cover_classic',
  'cover modern': 'cover_modern',
  'cover classic': 'cover_classic',
  covermodern: 'cover_modern',
  coverclassic: 'cover_classic'
}

const CLASSIC_STYLE_TEMPLATE_IDS = new Set(['classic', 'professional', 'ucmo'])

const DEFAULT_COVER_TEMPLATE = 'cover_modern'

const canonicalizeTemplateId = (value) => {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return ''
  return TEMPLATE_ALIASES[trimmed] || trimmed
}

const canonicalizeCoverTemplateId = (value, fallback = '') => {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  if (!trimmed) return fallback
  if (COVER_TEMPLATE_IDS.includes(trimmed)) return trimmed
  const normalized = trimmed.replace(/\s+/g, '_').toLowerCase()
  if (COVER_TEMPLATE_IDS.includes(normalized)) {
    return normalized
  }
  const alias =
    COVER_TEMPLATE_ALIASES[normalized] || COVER_TEMPLATE_ALIASES[trimmed.toLowerCase()]
  if (alias) return alias
  if (normalized.includes('classic')) return 'cover_classic'
  if (normalized.includes('modern')) return 'cover_modern'
  return fallback
}

const normalizeCoverTemplateList = (list = []) => {
  if (!Array.isArray(list)) return []
  return Array.from(
    new Set(list.map((item) => canonicalizeCoverTemplateId(item)).filter(Boolean))
  )
}

const deriveCoverTemplateFromResume = (templateId) => {
  const canonical = canonicalizeTemplateId(templateId)
  if (!canonical) return DEFAULT_COVER_TEMPLATE
  return CLASSIC_STYLE_TEMPLATE_IDS.has(canonical) ? 'cover_classic' : 'cover_modern'
}

const ensureCoverTemplateContext = (context, templateId) => {
  const derived = deriveCoverTemplateFromResume(templateId || DEFAULT_COVER_TEMPLATE)
  const fallback = derived === 'cover_modern' ? 'cover_classic' : 'cover_modern'
  const base = context ? { ...context } : {}
  const coverTemplates = normalizeCoverTemplateList(base.coverTemplates)
  const coverTemplate1 = canonicalizeCoverTemplateId(base.coverTemplate1)
  const coverTemplate2 = canonicalizeCoverTemplateId(base.coverTemplate2)
  const mergedTemplates = normalizeCoverTemplateList([
    derived,
    coverTemplate1,
    coverTemplate2,
    ...coverTemplates
  ])
  if (!mergedTemplates.includes(derived)) {
    mergedTemplates.unshift(derived)
  }
  if (!mergedTemplates.includes(fallback)) {
    mergedTemplates.push(fallback)
  }

  base.coverTemplates = mergedTemplates
  base.coverTemplate1 = derived
  if (!coverTemplate2 || coverTemplate2 === derived) {
    base.coverTemplate2 = mergedTemplates.find((tpl) => tpl !== derived) || fallback
  } else {
    base.coverTemplate2 = coverTemplate2
  }

  return base
}

const normalizeTemplateContext = (context) => {
  if (!context || typeof context !== 'object') return null
  const normalized = { ...context }
  const primary = canonicalizeTemplateId(context.template1)
  const secondary = canonicalizeTemplateId(context.template2)
  const selected =
    canonicalizeTemplateId(context.selectedTemplate) || primary || secondary
  if (primary) normalized.template1 = primary
  if (secondary) normalized.template2 = secondary
  if (selected) normalized.selectedTemplate = selected
  if (Array.isArray(context.templates)) {
    normalized.templates = Array.from(
      new Set(
        context.templates
          .map((item) => canonicalizeTemplateId(item))
          .filter(Boolean)
      )
    )
  }
  const baseTemplates = Array.isArray(normalized.templates)
    ? normalized.templates
    : []
  const enrichedTemplates = Array.from(
    new Set([primary, selected, secondary, ...baseTemplates].filter(Boolean))
  )
  if (enrichedTemplates.length) {
    normalized.templates = [
      'ucmo',
      ...enrichedTemplates.filter((tpl) => tpl && tpl !== 'ucmo')
    ]
  }
  const templateForCover = normalized.selectedTemplate || normalized.template1 || 'modern'
  return ensureCoverTemplateContext(normalized, templateForCover)
}

const formatTemplateName = (id) => {
  if (!id) return 'Custom Template'
  if (id === '2025') return 'Future Vision 2025'
  return id
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

const BASE_TEMPLATE_OPTIONS = [
  {
    id: 'modern',
    name: 'Modern Minimal',
    description: 'Sleek two-column layout with clean dividers and ATS-safe spacing.'
  },
  {
    id: 'ucmo',
    name: 'Crimson Heritage',
    description: 'Classic serif typography with deep crimson accents inspired by university letterhead design.'
  },
  {
    id: 'professional',
    name: 'Professional Edge',
    description: 'Refined business styling with signature accents for leadership roles.'
  },
  {
    id: 'classic',
    name: 'Classic Heritage',
    description: 'Timeless serif typography with elegant section framing.'
  },
  {
    id: 'creative',
    name: 'Creative Spotlight',
    description: 'Gradient-rich storytelling layout with bold highlights.'
  },
  {
    id: 'vibrant',
    name: 'Vibrant Fusion',
    description: 'Playful dual-tone palette with energetic dividers and modern sans-serif headings.'
  },
  {
    id: 'ats',
    name: 'ATS Optimized',
    description: 'Single-column structure engineered for parsing accuracy.'
  },
  {
    id: '2025',
    name: 'Future Vision 2025',
    description: 'Futuristic grid layout with crisp typography and subtle neon cues.'
  }
]

const ATS_SUB_SCORE_ORDER = [
  'Layout & Searchability',
  'ATS Readability',
  'Impact',
  'Crispness',
  'Other Quality Metrics'
]

const CHANGE_TYPE_LABELS = {
  added: 'Added',
  fixed: 'Fixed',
  rephrased: 'Rephrased',
  removed: 'Removed'
}

const changeLabelStyles = {
  added: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  fixed: 'bg-sky-100 text-sky-700 border border-sky-200',
  rephrased: 'bg-indigo-100 text-indigo-700 border border-indigo-200',
  removed: 'bg-rose-100 text-rose-700 border border-rose-200'
}

const DEFAULT_ITEM_REASON_BY_CHANGE_TYPE = {
  added: 'Added to meet JD skill coverage.',
  replaced: 'Replaced to highlight required for role.',
  removed: 'Removed to keep the story aligned with the target role.',
  default: 'Updated to strengthen alignment with the JD.'
}

const ITEM_REASON_HINTS_BY_SUGGESTION = {
  'improve-summary': {
    added: 'Added to mirror JD tone and value focus.',
    replaced: 'Rephrased to highlight required for role messaging.',
    removed: 'Removed to keep the opener laser-focused on the JD.'
  },
  'add-missing-skills': {
    added: 'Added to meet JD skill requirement captured in the posting.',
    removed: 'Removed duplicate skill so ATS highlights the JD keywords.'
  },
  'align-experience': {
    added: 'Added to spotlight accomplishments the JD emphasises.',
    replaced: 'Reworded to highlight required for role outcomes.',
    removed: 'Removed lower-impact detail to surface role-critical wins.'
  },
  'change-designation': {
    added: 'Added to match the target job title flagged in the JD.',
    replaced: 'Updated title to highlight required designation for the role.',
    removed: 'Removed conflicting title to avoid ATS mismatches.'
  },
  'improve-certifications': {
    added: 'Added to surface certifications the JD calls out.',
    replaced: 'Reordered credentials to highlight required certification.',
    removed: 'Removed redundant certification so the must-have stands out.'
  },
  'improve-projects': {
    added: 'Added to prove project impact tied to the JD expectations.',
    replaced: 'Reframed outcome to highlight required for role success.',
    removed: 'Removed side project to emphasise the JD-aligned win.'
  },
  'improve-highlights': {
    added: 'Added to highlight wins recruiters look for in this role.',
    replaced: 'Replaced to spotlight the highlight required for role fit.',
    removed: 'Removed weaker highlight so JD-aligned result stands out.'
  },
  'enhance-all': {
    added: 'Added to align every section with the JD priorities.',
    replaced: 'Reworked wording to highlight required for role coverage.',
    removed: 'Removed mismatched content to keep the CV JD-focused.'
  }
}

function getDownloadPresentation(file = {}) {
  const type = file?.type || ''
  switch (type) {
    case 'original_upload':
      return {
        label: 'Original CV Upload',
        description: 'Exact resume you submitted before any AI enhancements—keep this for applications that prefer the untouched version.',
        badgeText: 'Original CV',
        badgeStyle: 'bg-slate-100 text-slate-700 border-slate-200',
        buttonStyle: 'bg-slate-700 hover:bg-slate-800 focus:ring-slate-500',
        cardAccent: 'bg-gradient-to-br from-slate-50 via-white to-white',
        cardBorder: 'border-slate-200',
        linkLabel: 'Download original PDF',
        category: 'resume',
        autoPreviewPriority: 4
      }
    case 'version1':
      return {
        label: 'Enhanced CV Version 1',
        description: 'Primary rewrite balanced for ATS scoring and recruiter readability with the strongest keyword alignment.',
        badgeText: 'Enhanced CV',
        badgeStyle: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        buttonStyle: 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500',
        cardAccent: 'bg-gradient-to-br from-emerald-50 via-white to-white',
        cardBorder: 'border-emerald-200',
        linkLabel: 'Download enhanced PDF',
        category: 'resume',
        autoPreviewPriority: 0
      }
    case 'version2':
      return {
        label: 'Enhanced CV Version 2',
        description: 'Alternate layout that spotlights impact metrics and leadership achievements for different screening preferences.',
        badgeText: 'Enhanced CV Alt',
        badgeStyle: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        buttonStyle: 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500',
        cardAccent: 'bg-gradient-to-br from-emerald-50 via-white to-white',
        cardBorder: 'border-emerald-200',
        linkLabel: 'Download enhanced PDF',
        category: 'resume',
        autoPreviewPriority: 1
      }
    case 'cover_letter1':
      return {
        label: 'Cover Letter 1',
        description: 'Tailored opener mirroring the job description tone and top keyword themes.',
        badgeText: 'Cover Letter',
        badgeStyle: 'bg-indigo-100 text-indigo-700 border-indigo-200',
        buttonStyle: 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500',
        cardAccent: 'bg-gradient-to-br from-indigo-50 via-white to-white',
        cardBorder: 'border-indigo-200',
        linkLabel: 'Download PDF',
        category: 'cover',
        autoPreviewPriority: 2
      }
    case 'cover_letter2':
      return {
        label: 'Cover Letter 2',
        description: 'Alternate narrative emphasising quantified achievements and culture alignment.',
        badgeText: 'Cover Letter',
        badgeStyle: 'bg-indigo-100 text-indigo-700 border-indigo-200',
        buttonStyle: 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500',
        cardAccent: 'bg-gradient-to-br from-indigo-50 via-white to-white',
        cardBorder: 'border-indigo-200',
        linkLabel: 'Download PDF',
        category: 'cover',
        autoPreviewPriority: 3
      }
    default:
      return {
        label: 'Generated Document',
        description: 'Download the generated document.',
        badgeText: 'Download',
        badgeStyle: 'bg-purple-100 text-purple-700 border-purple-200',
        buttonStyle: 'bg-purple-600 hover:bg-purple-700 focus:ring-purple-500',
        cardAccent: 'bg-white/85',
        cardBorder: 'border-purple-200',
        linkLabel: 'Download file',
        category: 'other',
        autoPreviewPriority: 10
      }
  }
}

function deriveChangeLabel(suggestion) {
  const type = suggestion?.type || ''
  const before = (suggestion?.beforeExcerpt || '').trim()
  const after = (suggestion?.afterExcerpt || '').trim()

  if (!before && after) return 'added'
  if (before && !after) return 'removed'
  if (before && after && before !== after) {
    if (type === 'improve-summary') return 'rephrased'
    if (type === 'change-designation') return 'fixed'
    if (
      type === 'add-missing-skills' ||
      type === 'align-experience' ||
      type === 'improve-certifications' ||
      type === 'improve-projects' ||
      type === 'improve-highlights'
    )
      return 'added'
    if (type === 'enhance-all') return 'fixed'
  }

  const fallback =
    type === 'improve-summary'
      ? 'rephrased'
      : type === 'change-designation'
        ? 'fixed'
        : type === 'add-missing-skills' ||
            type === 'align-experience' ||
            type === 'improve-certifications' ||
            type === 'improve-projects' ||
            type === 'improve-highlights'
          ? 'added'
          : 'fixed'

  return fallback
}

function buildChangeLogEntry(suggestion) {
  const label = deriveChangeLabel(suggestion)
  const reason = (suggestion?.explanation || '').trim()
  const defaultReasons = {
    'improve-summary':
      'Reframed your summary so the opener mirrors the job description priorities.',
    'add-missing-skills':
      'Inserted missing keywords so the CV satisfies the role requirements.',
    'align-experience':
      'Expanded experience bullets to reflect the selection criteria.',
    'change-designation':
      'Aligned the visible designation with the target role title.',
    'improve-certifications':
      'Elevated certifications that validate the role’s compliance or technical focus.',
    'improve-projects':
      'Reframed project wins to demonstrate alignment with the JD priorities.',
    'improve-highlights':
      'Tuned top highlights so they emphasise the outcomes hiring managers expect.',
    'enhance-all':
      'Rolled out combined updates so every section aligns with the JD.'
  }
  const baseReason = reason || defaultReasons[suggestion?.type] || 'Applied improvement to strengthen alignment.'

  const enhanceAllSummary =
    suggestion?.type === 'enhance-all'
      ? formatEnhanceAllSummary(suggestion?.improvementSummary)
      : ''

  const selectionNotes = {
    'improve-summary': 'Selection focus: mirrors JD tone and value propositions.',
    'add-missing-skills': 'Selection focus: surfaces keywords recruiters screen for.',
    'align-experience': 'Selection focus: evidences accomplishments tied to job metrics.',
    'change-designation': 'Selection focus: resolves designation mismatch flagged in ATS scans.',
    'improve-certifications': 'Selection focus: spotlights credentials recruiters validate first.',
    'improve-projects': 'Selection focus: proves project impact mirrors hiring goals.',
    'improve-highlights': 'Selection focus: amplifies headline wins that catch recruiter attention.',
    'enhance-all': 'Selection focus: synchronises every section with the job criteria.'
  }

  const selectionDetail = selectionNotes[suggestion?.type]
  const detailText = (() => {
    if (suggestion?.type === 'enhance-all' && enhanceAllSummary) {
      return `${baseReason} Combined updates — ${enhanceAllSummary}`
    }
    if (selectionDetail) {
      return `${baseReason} ${selectionDetail}`
    }
    return baseReason
  })()

  const summarySegments = Array.isArray(suggestion?.improvementSummary)
    ? suggestion.improvementSummary
        .map((segment) => {
          if (!segment) return null
          const sectionLabel = [segment.section, segment.label, segment.key]
            .map((value) => (typeof value === 'string' ? value.trim() : ''))
            .find(Boolean) || ''
          const addedItems = Array.isArray(segment.added)
            ? segment.added
                .map((item) => (typeof item === 'string' ? item.trim() : String(item || '').trim()))
                .filter(Boolean)
            : []
          const removedItems = Array.isArray(segment.removed)
            ? segment.removed
                .map((item) => (typeof item === 'string' ? item.trim() : String(item || '').trim()))
                .filter(Boolean)
            : []
          const reasons = Array.isArray(segment.reason)
            ? segment.reason
                .map((line) => (typeof line === 'string' ? line.trim() : ''))
                .filter(Boolean)
            : []
          if (!sectionLabel && addedItems.length === 0 && removedItems.length === 0 && reasons.length === 0) {
            return null
          }
          return {
            section: sectionLabel,
            added: addedItems,
            removed: removedItems,
            reason: reasons
          }
        })
        .filter(Boolean)
    : []

  const aggregateUnique = (items) => {
    const seen = new Set()
    const ordered = []
    items.forEach((item) => {
      const text = typeof item === 'string' ? item.trim() : String(item || '').trim()
      if (!text) return
      const key = text.toLowerCase()
      if (seen.has(key)) return
      seen.add(key)
      ordered.push(text)
    })
    return ordered
  }

  const addedItems = aggregateUnique(summarySegments.flatMap((segment) => segment.added || []))
  const removedItems = aggregateUnique(summarySegments.flatMap((segment) => segment.removed || []))

  const suggestionType = suggestion?.type || ''
  const reasonHints = ITEM_REASON_HINTS_BY_SUGGESTION[suggestionType] || {}
  const itemizedMap = new Map()
  const pairedAddedItems = new Set()
  const pairedRemovedItems = new Set()

  const normalizeReasonInput = (input) => {
    if (!input) return []
    if (Array.isArray(input)) {
      return input
        .map((line) => (typeof line === 'string' ? line.trim() : ''))
        .filter(Boolean)
    }
    if (typeof input === 'string') {
      const trimmed = input.trim()
      return trimmed ? [trimmed] : []
    }
    return []
  }

  const resolveReasonList = (input, changeType) => {
    const normalized = normalizeReasonInput(input)
    if (normalized.length > 0) {
      return normalized
    }
    const typeHint = reasonHints[changeType]
    if (typeHint) {
      return [typeHint]
    }
    const defaultReason =
      DEFAULT_ITEM_REASON_BY_CHANGE_TYPE[changeType] || DEFAULT_ITEM_REASON_BY_CHANGE_TYPE.default
    return defaultReason ? [defaultReason] : []
  }

  const registerItemizedChange = (item, changeType, reasonInput) => {
    const text = typeof item === 'string' ? item.trim() : ''
    if (!text) return
    const normalizedType = changeType === 'rephrased' ? 'replaced' : changeType
    if (!normalizedType) return
    const key = `${normalizedType}::${text.toLowerCase()}`
    const existing = itemizedMap.get(key) || {
      item: text,
      changeType: normalizedType,
      reasons: new Set()
    }
    resolveReasonList(reasonInput, normalizedType).forEach((line) => {
      if (line) {
        existing.reasons.add(line)
      }
    })
    itemizedMap.set(key, existing)
  }

  summarySegments.forEach((segment) => {
    if (!segment) return
    const addedList = Array.isArray(segment.added) ? segment.added : []
    const removedList = Array.isArray(segment.removed) ? segment.removed : []
    const segmentReason =
      Array.isArray(segment.reason) && segment.reason.length > 0
        ? segment.reason
        : detailText
    const pairCount = Math.min(addedList.length, removedList.length)
    for (let index = 0; index < pairCount; index += 1) {
      const beforeItem = typeof removedList[index] === 'string' ? removedList[index].trim() : ''
      const afterItem = typeof addedList[index] === 'string' ? addedList[index].trim() : ''
      if (!beforeItem || !afterItem) {
        continue
      }
      registerItemizedChange(`${beforeItem} → ${afterItem}`, 'replaced', segmentReason)
      pairedAddedItems.add(afterItem.toLowerCase())
      pairedRemovedItems.add(beforeItem.toLowerCase())
    }
    addedList.slice(pairCount).forEach((item) => {
      registerItemizedChange(item, 'added', segmentReason)
    })
    removedList.slice(pairCount).forEach((item) => {
      registerItemizedChange(item, 'removed', segmentReason)
    })
  })

  addedItems.forEach((item) => {
    const lower = item.toLowerCase()
    if (!pairedAddedItems.has(lower)) {
      registerItemizedChange(item, 'added', detailText)
    }
  })
  removedItems.forEach((item) => {
    const lower = item.toLowerCase()
    if (!pairedRemovedItems.has(lower)) {
      registerItemizedChange(item, 'removed', detailText)
    }
  })

  const beforeExcerpt = (suggestion?.beforeExcerpt || '').trim()
  const afterExcerpt = (suggestion?.afterExcerpt || '').trim()

  if (beforeExcerpt && afterExcerpt && beforeExcerpt !== afterExcerpt) {
    registerItemizedChange(`${beforeExcerpt} → ${afterExcerpt}`, 'replaced', reason || detailText)
  } else if (!beforeExcerpt && afterExcerpt) {
    registerItemizedChange(afterExcerpt, 'added', reason || detailText)
  } else if (beforeExcerpt && !afterExcerpt) {
    registerItemizedChange(beforeExcerpt, 'removed', reason || detailText)
  }

  const changeTypeOrder = { added: 0, replaced: 1, removed: 2 }
  const itemizedChanges = Array.from(itemizedMap.values())
    .map((entry) => ({
      item: entry.item,
      changeType: entry.changeType,
      reasons: Array.from(entry.reasons)
    }))
    .sort((a, b) => {
      const orderA = changeTypeOrder[a.changeType] ?? 99
      const orderB = changeTypeOrder[b.changeType] ?? 99
      if (orderA !== orderB) {
        return orderA - orderB
      }
      return a.item.localeCompare(b.item, undefined, { sensitivity: 'base' })
    })

  return {
    id: suggestion?.id,
    label,
    title: suggestion?.title || 'Improvement Applied',
    detail: detailText.trim(),
    before: beforeExcerpt,
    after: afterExcerpt,
    timestamp: Date.now(),
    type: suggestion?.type || 'custom',
    summarySegments,
    addedItems,
    removedItems,
    itemizedChanges,
    scoreDelta:
      typeof suggestion?.scoreDelta === 'number' && Number.isFinite(suggestion.scoreDelta)
        ? suggestion.scoreDelta
        : null
  }
}

function formatScoreDelta(delta) {
  if (typeof delta !== 'number' || Number.isNaN(delta)) {
    return null
  }
  const rounded = Math.round(delta)
  const prefix = rounded > 0 ? '+' : ''
  return `${prefix}${rounded} pts`
}

function cloneData(value) {
  if (value === null || typeof value !== 'object') {
    return value
  }

  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value)
    } catch (err) {
      console.error('Structured clone failed, falling back to JSON cloning', err)
    }
  }

  try {
    return JSON.parse(JSON.stringify(value))
  } catch (err) {
    console.error('JSON clone failed, falling back to shallow copy', err)
    return Array.isArray(value) ? [...value] : { ...value }
  }
}

function orderAtsMetrics(metrics) {
  if (!Array.isArray(metrics)) return []
  const categoryMap = new Map()
  metrics.filter(Boolean).forEach((metric) => {
    if (metric?.category) {
      categoryMap.set(metric.category, metric)
    }
  })

  const ordered = ATS_SUB_SCORE_ORDER.map((category) => categoryMap.get(category)).filter(Boolean)
  const extras = metrics.filter(
    (metric) => metric?.category && !ATS_SUB_SCORE_ORDER.includes(metric.category)
  )

  return [...ordered, ...extras]
}

function getApiBaseCandidate() {
  if (typeof window !== 'undefined') {
    const fromWindow = window.__RESUMEFORGE_API_BASE_URL__
    if (typeof fromWindow === 'string' && fromWindow.trim()) {
      return fromWindow.trim()
    }

    if (typeof document !== 'undefined') {
      const metaTag = document.querySelector('meta[name="resumeforge-api-base"]')
      const metaContent = metaTag?.content
      if (typeof metaContent === 'string' && metaContent.trim()) {
        return metaContent.trim()
      }
    }
  }

  if (typeof process !== 'undefined' && process.env) {
    if (typeof process.env.VITE_API_BASE_URL === 'string' && process.env.VITE_API_BASE_URL.trim()) {
      return process.env.VITE_API_BASE_URL.trim()
    }
    if (
      typeof process.env.RESUMEFORGE_API_BASE_URL === 'string' &&
      process.env.RESUMEFORGE_API_BASE_URL.trim()
    ) {
      return process.env.RESUMEFORGE_API_BASE_URL.trim()
    }
  }

  return ''
}

function ImprovementCard({ suggestion, onAccept, onReject, onPreview }) {
  const deltaText = formatScoreDelta(suggestion.scoreDelta)
  const deltaTone =
    typeof suggestion.scoreDelta === 'number' && Number.isFinite(suggestion.scoreDelta)
      ? suggestion.scoreDelta > 0
        ? 'text-emerald-600'
        : suggestion.scoreDelta < 0
          ? 'text-rose-600'
          : 'text-slate-600'
      : 'text-slate-600'
  const rawConfidence =
    typeof suggestion.confidence === 'number' && Number.isFinite(suggestion.confidence)
      ? suggestion.confidence
      : null
  const confidenceDisplay =
    rawConfidence !== null ? `${Math.round(rawConfidence * 100)}%` : '—'
  const confidenceDescription =
    'Indicates how certain ResumeForge is that this change will resonate with ATS scoring and recruiter expectations based on the source analysis.'
  const deltaDescription =
    'Estimated impact on your ATS score if you apply this improvement. Positive values mean a projected lift; negative values signal a potential drop.'
  const acceptDisabled = Boolean(suggestion.rescorePending || suggestion.accepted)
  const improvementHints = useMemo(() => {
    if (!Array.isArray(suggestion.improvementSummary)) return []
    return suggestion.improvementSummary.map((segment) => buildActionableHint(segment)).filter(Boolean)
  }, [suggestion.improvementSummary])
  const actionableHints = improvementHints.length
    ? improvementHints
    : ['Review this update and prepare to speak to the new talking points.']

  return (
    <div className="rounded-xl bg-white/80 backdrop-blur border border-purple-200/60 shadow p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h4 className="text-lg font-semibold text-purple-800">{suggestion.title}</h4>
          <div className="mt-1 flex items-center gap-2 text-xs uppercase tracking-wide text-purple-500">
            <span>Confidence: {confidenceDisplay}</span>
            <InfoTooltip
              variant="light"
              align="left"
              maxWidthClass="w-72"
              label="What does the improvement confidence mean?"
              content={confidenceDescription}
            />
          </div>
        </div>
        {suggestion.accepted !== null && (
          <span
            className={`text-xs px-3 py-1 rounded-full ${
              suggestion.accepted
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-rose-100 text-rose-600'
            }`}
          >
            {suggestion.accepted ? 'Accepted' : 'Rejected'}
          </span>
        )}
      </div>
      <p className="text-sm text-purple-900/80 leading-relaxed">{suggestion.explanation}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
          <p className="text-xs uppercase font-semibold text-purple-500">Before</p>
          <p className="mt-1 text-purple-800 whitespace-pre-wrap">{suggestion.beforeExcerpt || '—'}</p>
        </div>
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
          <p className="text-xs uppercase font-semibold text-indigo-500">After</p>
          <p className="mt-1 text-indigo-800 whitespace-pre-wrap">{suggestion.afterExcerpt || '—'}</p>
        </div>
      </div>
      <div className="rounded-lg border border-purple-200/70 bg-purple-50/60 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-purple-600">
          AI added/modified these · Learn this for your interview
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-purple-900/80">
          {actionableHints.map((hint, index) => (
            <li key={`${hint}-${index}`}>{hint}</li>
          ))}
        </ul>
      </div>
      <div className="space-y-1">
        {deltaText && (
          <div className="flex items-center gap-2">
            <p className={`text-sm font-semibold ${deltaTone}`}>
              ATS score delta: {deltaText}
            </p>
            <InfoTooltip
              variant="light"
              align="left"
              maxWidthClass="w-72"
              label="What does ATS score delta mean?"
              content={deltaDescription}
            />
          </div>
        )}
        {suggestion.rescorePending && (
          <p className="text-xs font-medium text-purple-600">Updating ATS dashboard…</p>
        )}
        {suggestion.rescoreError && (
          <p className="text-xs font-medium text-rose-600">{suggestion.rescoreError}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-3 justify-end pt-2">
        <button
          type="button"
          onClick={onPreview}
          className="px-4 py-2 rounded-full text-sm font-medium border border-indigo-200 text-indigo-600 hover:bg-indigo-50"
        >
          Preview Update
        </button>
        <button
          type="button"
          onClick={onReject}
          className="px-4 py-2 rounded-full text-sm font-medium border border-rose-300 text-rose-600 hover:bg-rose-50"
        >
          Reject
        </button>
        <button
          type="button"
          onClick={onAccept}
          disabled={acceptDisabled}
          className={`px-4 py-2 rounded-full text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 ${
            acceptDisabled ? 'opacity-70 cursor-not-allowed' : ''
          }`}
        >
          {suggestion.accepted ? 'Applied' : 'Accept'}
        </button>
      </div>
    </div>
  )
}

function App() {
  const [profileUrl, setProfileUrl] = useState('')
  const [credlyUrl, setCredlyUrl] = useState('')
  const [manualJobDescription, setManualJobDescription] = useState('')
  const [jobDescriptionUrl, setJobDescriptionUrl] = useState('')
  const [manualCertificatesInput, setManualCertificatesInput] = useState('')
  const [cvFile, setCvFile] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [outputFiles, setOutputFiles] = useState([])
  const [match, setMatch] = useState(null)
  const [scoreBreakdown, setScoreBreakdown] = useState([])
  const [resumeText, setResumeText] = useState('')
  const [jobDescriptionText, setJobDescriptionText] = useState('')
  const [jobSkills, setJobSkills] = useState([])
  const [resumeSkills, setResumeSkills] = useState([])
  const [knownCertificates, setKnownCertificates] = useState([])
  const [manualCertificatesData, setManualCertificatesData] = useState([])
  const [certificateInsights, setCertificateInsights] = useState(null)
  const [selectionInsights, setSelectionInsights] = useState(null)
  const [improvementResults, setImprovementResults] = useState([])
  const [changeLog, setChangeLog] = useState([])
  const [activeImprovement, setActiveImprovement] = useState('')
  const [error, setError] = useState('')
  const [queuedMessage, setQueuedMessage] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('modern')
  const [previewSuggestion, setPreviewSuggestion] = useState(null)
  const [previewFile, setPreviewFile] = useState(null)
  const [initialAnalysisSnapshot, setInitialAnalysisSnapshot] = useState(null)
  const [jobId, setJobId] = useState('')
  const [templateContext, setTemplateContext] = useState(null)
  const [isGeneratingDocs, setIsGeneratingDocs] = useState(false)
  const [manualJobDescriptionRequired, setManualJobDescriptionRequired] = useState(false)
  const [enhanceAllSummaryText, setEnhanceAllSummaryText] = useState('')
  const [coverLetterDrafts, setCoverLetterDrafts] = useState({})
  const [coverLetterOriginals, setCoverLetterOriginals] = useState({})
  const [coverLetterEditor, setCoverLetterEditor] = useState(null)
  const [isCoverLetterDownloading, setIsCoverLetterDownloading] = useState(false)
  const [coverLetterDownloadError, setCoverLetterDownloadError] = useState('')
  const [coverLetterClipboardStatus, setCoverLetterClipboardStatus] = useState('')
  const [resumeHistory, setResumeHistory] = useState([])
  const improvementLockRef = useRef(false)
  const autoPreviewSignatureRef = useRef('')
  const manualJobDescriptionRef = useRef(null)

  const hasMatch = Boolean(match)
  const hasCvFile = Boolean(cvFile)
  const improvementCount = improvementResults.length
  const downloadCount = outputFiles.length
  const changeCount = changeLog.length
  const scoreMetricCount = scoreBreakdown.length
  const scoreDashboardReady = scoreMetricCount > 0
  const queuedText = typeof queuedMessage === 'string' ? queuedMessage.trim() : ''
  const hasAnalysisData =
    scoreMetricCount > 0 || hasMatch || improvementCount > 0 || downloadCount > 0 || changeCount > 0
  const uploadComplete =
    (hasCvFile && (isProcessing || Boolean(queuedText))) || hasAnalysisData || Boolean(queuedText)
  const scoreComplete = scoreMetricCount > 0
  const jdValidationComplete = Boolean(jobDescriptionText && jobDescriptionText.trim())
  const improvementsUnlocked = uploadComplete && scoreComplete && jdValidationComplete
  const improvementUnlockMessage = !uploadComplete
    ? 'Upload your resume and job description to unlock improvements.'
    : !scoreComplete
      ? 'Wait for the ATS scoring to finish before generating improvements.'
      : !jdValidationComplete
        ? 'Job description validation is still in progress. Please wait until it completes.'
        : ''
  const improvementBusy = Boolean(activeImprovement)

  const resumeHistoryMap = useMemo(() => {
    const map = new Map()
    if (Array.isArray(resumeHistory)) {
      resumeHistory.forEach((entry) => {
        if (!entry || !entry.id) return
        map.set(entry.id, entry)
      })
    }

    if (Array.isArray(changeLog)) {
      changeLog.forEach((entry) => {
        if (!entry || !entry.id) {
          return
        }
        const existing = map.get(entry.id) || {}
        const nextEntry = { ...existing }

        if (!nextEntry.id) {
          nextEntry.id = entry.id
        }
        if (!nextEntry.suggestionId) {
          nextEntry.suggestionId = entry.id
        }
        if (!nextEntry.title && entry.title) {
          nextEntry.title = entry.title
        }
        if (!nextEntry.type && entry.type) {
          nextEntry.type = entry.type
        }
        if (!nextEntry.detail && entry.detail) {
          nextEntry.detail = entry.detail
        }
        if (!nextEntry.changeLabel && entry.label) {
          nextEntry.changeLabel = entry.label
        }

        const beforeText =
          typeof nextEntry.resumeBefore === 'string' && nextEntry.resumeBefore
            ? nextEntry.resumeBefore
            : typeof entry.resumeBeforeText === 'string'
              ? entry.resumeBeforeText
              : ''
        if (!nextEntry.resumeBefore && beforeText) {
          nextEntry.resumeBefore = beforeText
        }

        const afterText =
          typeof nextEntry.resumeAfter === 'string' && nextEntry.resumeAfter
            ? nextEntry.resumeAfter
            : typeof entry.resumeAfterText === 'string'
              ? entry.resumeAfterText
              : ''
        if (!nextEntry.resumeAfter && afterText) {
          nextEntry.resumeAfter = afterText
        }

        if (!nextEntry.timestamp) {
          if (entry.acceptedAt) {
            const acceptedDate = new Date(entry.acceptedAt)
            nextEntry.timestamp = Number.isNaN(acceptedDate.getTime())
              ? Date.now()
              : acceptedDate.getTime()
          } else if (entry.timestamp) {
            nextEntry.timestamp = entry.timestamp
          }
        }

        const historyContext =
          entry && entry.historyContext && typeof entry.historyContext === 'object'
            ? entry.historyContext
            : null

        if (historyContext) {
          if (!nextEntry.matchBefore && historyContext.matchBefore) {
            nextEntry.matchBefore = cloneData(historyContext.matchBefore)
          }
          if (!nextEntry.scoreBreakdownBefore && historyContext.scoreBreakdownBefore) {
            nextEntry.scoreBreakdownBefore = cloneData(historyContext.scoreBreakdownBefore)
          }
          if (
            !nextEntry.resumeSkillsBefore &&
            Array.isArray(historyContext.resumeSkillsBefore)
          ) {
            nextEntry.resumeSkillsBefore = historyContext.resumeSkillsBefore
              .map((item) => (typeof item === 'string' ? item.trim() : ''))
              .filter(Boolean)
          }
        }

        map.set(entry.id, nextEntry)
      })
    }

    return map
  }, [resumeHistory, changeLog])

  const availableTemplateOptions = useMemo(() => {
    const registry = new Map(BASE_TEMPLATE_OPTIONS.map((option) => [option.id, option]))
    const extras = []
    const register = (value) => {
      const canonical = canonicalizeTemplateId(value)
      if (!canonical || registry.has(canonical)) {
        return
      }
      const option = {
        id: canonical,
        name: formatTemplateName(canonical),
        description: 'Imported resume template from your previous session.'
      }
      registry.set(canonical, option)
      extras.push(option)
    }

    const templateCandidates = Array.isArray(templateContext?.templates)
      ? templateContext.templates
      : []
    templateCandidates.forEach(register)
    register(templateContext?.template1)
    register(templateContext?.template2)
    register(templateContext?.selectedTemplate)
    register(selectedTemplate)

    return [
      ...BASE_TEMPLATE_OPTIONS,
      ...extras
    ]
  }, [templateContext, selectedTemplate])

  useEffect(() => {
    if (!templateContext) return
    const canonical = canonicalizeTemplateId(
      templateContext.selectedTemplate || templateContext.template1
    )
    if (canonical && canonical !== selectedTemplate) {
      setSelectedTemplate(canonical)
    }
  }, [templateContext, selectedTemplate])

  useEffect(() => {
    const hasAcceptedEnhanceAll = improvementResults.some(
      (item) => item?.type === 'enhance-all' && item?.accepted
    )
    if (!hasAcceptedEnhanceAll && enhanceAllSummaryText) {
      setEnhanceAllSummaryText('')
    }
  }, [enhanceAllSummaryText, improvementResults])

  const handleTemplateSelect = useCallback(
    (templateId) => {
      const canonical = canonicalizeTemplateId(templateId) || 'modern'
      setSelectedTemplate(canonical)
      setTemplateContext((prev) => {
        const base = prev ? { ...prev } : {}
        base.template1 = canonical
        base.selectedTemplate = canonical
        const currentList = Array.isArray(prev?.templates)
          ? prev.templates
              .map((item) => canonicalizeTemplateId(item))
              .filter(Boolean)
          : []
        if (!currentList.includes(canonical)) {
          base.templates = [canonical, ...currentList]
        } else {
          const filtered = currentList.filter((item) => item !== canonical)
          base.templates = [canonical, ...filtered]
        }
        return ensureCoverTemplateContext(base, canonical)
      })
    },
    [setTemplateContext]
  )
  const flowSteps = useMemo(() => {
    const improvementsComplete = improvementCount > 0
    const downloadComplete = downloadCount > 0
    const changelogComplete = changeCount > 0

    const baseSteps = [
      {
        key: 'upload',
        label: 'Upload & Submit',
        description: 'Attach your CV and target JD to kick off the analysis.'
      },
      {
        key: 'score',
        label: 'ATS Score',
        description: 'Review the ATS breakdown and keyword coverage.'
      },
      {
        key: 'improvements',
        label: 'Improvement Selection',
        description: 'Generate targeted rewrites and choose what to apply.'
      },
      {
        key: 'download',
        label: 'Enhanced Download',
        description: 'Grab the upgraded CVs and tailored cover letters.'
      },
      {
        key: 'changelog',
        label: 'Changelog Display',
        description: 'See every accepted change to prep talking points.'
      }
    ]

    let currentAssigned = false

    return baseSteps.map((step) => {
      const isComplete =
        step.key === 'upload'
          ? uploadComplete
          : step.key === 'score'
            ? scoreComplete
            : step.key === 'improvements'
              ? improvementsComplete
              : step.key === 'download'
                ? downloadComplete
                : step.key === 'changelog'
                  ? changelogComplete
                  : false

      let status = 'upcoming'
      if (isComplete) {
        status = 'complete'
      } else if (!currentAssigned) {
        status = 'current'
        currentAssigned = true
      }

      let note = ''
      switch (step.key) {
        case 'upload':
          if (!uploadComplete) {
            note = hasCvFile ? 'Ready to submit for scoring.' : 'Waiting for your resume upload.'
          } else if (isProcessing && !hasAnalysisData) {
            note = 'Uploading & parsing your documents…'
          } else if (queuedText) {
            note = queuedText
          } else if (hasAnalysisData) {
            note = 'Upload complete.'
          }
          break
        case 'score':
          if (isProcessing && !scoreComplete) {
            note = 'Scanning resume against the JD…'
          } else if (scoreComplete) {
            note = 'ATS dashboard ready.'
          } else if (hasAnalysisData) {
            note = 'Waiting for ATS metrics…'
          }
          break
        case 'improvements':
          if (improvementBusy) {
            note = 'Generating AI rewrite…'
          } else if (improvementCount > 0) {
            note = `${improvementCount} suggestion${improvementCount === 1 ? '' : 's'} ready.`
          }
          break
        case 'download':
          if (downloadCount > 0) {
            note = `${downloadCount} file${downloadCount === 1 ? '' : 's'} available.`
          }
          break
        case 'changelog':
          if (changeCount > 0) {
            note = `${changeCount} accepted update${changeCount === 1 ? '' : 's'}.`
          }
          break
        default:
          break
      }

      return { ...step, status, note }
    })
  }, [
    changeCount,
    downloadCount,
    hasAnalysisData,
    hasCvFile,
    improvementBusy,
    improvementCount,
    isProcessing,
    queuedText,
    scoreComplete,
    uploadComplete
  ])

  const downloadGroups = useMemo(() => {
    if (!Array.isArray(outputFiles) || outputFiles.length === 0) {
      return { resume: [], cover: [], other: [] }
    }
    const resume = []
    const cover = []
    const other = []
    const resumeOrder = { original_upload: 0, version1: 1, version2: 2 }
    const coverOrder = { cover_letter1: 0, cover_letter2: 1 }
    outputFiles.forEach((file) => {
      if (!file || typeof file !== 'object') return
      const presentation = getDownloadPresentation(file)
      const entry = { ...file, presentation }
      if (presentation.category === 'resume') {
        resume.push(entry)
      } else if (presentation.category === 'cover') {
        cover.push(entry)
      } else {
        other.push(entry)
      }
    })
    resume.sort((a, b) => (resumeOrder[a.type] ?? 50) - (resumeOrder[b.type] ?? 50))
    cover.sort((a, b) => (coverOrder[a.type] ?? 50) - (coverOrder[b.type] ?? 50))
    other.sort((a, b) => (a.presentation.label || '').localeCompare(b.presentation.label || ''))
    return { resume, cover, other }
  }, [outputFiles])

  const handleCoverLetterTextChange = useCallback(
    (type, value) => {
      if (!isCoverLetterType(type)) return
      setCoverLetterDrafts((prev) => ({ ...prev, [type]: value }))
      setCoverLetterClipboardStatus('')
      setCoverLetterDownloadError('')
    },
    []
  )

  const resetCoverLetterDraft = useCallback(
    (type) => {
      if (!isCoverLetterType(type)) return
      setCoverLetterDrafts((prev) => ({ ...prev, [type]: coverLetterOriginals[type] ?? '' }))
      setCoverLetterClipboardStatus('')
      setCoverLetterDownloadError('')
    },
    [coverLetterOriginals]
  )

  const handleCopyCoverLetter = useCallback(
    async (type) => {
      if (!isCoverLetterType(type)) return
      const text = (coverLetterDrafts[type] ?? '').trim()
      if (!text) {
        setCoverLetterClipboardStatus('Add personalised text before copying.')
        return
      }
      try {
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(text)
          setCoverLetterClipboardStatus('Copied to clipboard!')
        } else {
          setCoverLetterClipboardStatus('Copy not supported in this browser.')
        }
      } catch (err) {
        console.error('Copy cover letter failed', err)
        setCoverLetterClipboardStatus('Copy failed. Select the text and copy manually.')
      }
    },
    [coverLetterDrafts]
  )

  const handleDownloadEditedCoverLetter = useCallback(async () => {
    if (!coverLetterEditor || !isCoverLetterType(coverLetterEditor.type)) {
      return
    }
    if (typeof window === 'undefined') {
      setCoverLetterDownloadError('PDF download is not supported in this environment.')
      return
    }
    const type = coverLetterEditor.type
    const text = (coverLetterDrafts[type] ?? '').trim()
    if (!text) {
      setCoverLetterDownloadError('Add your personalised message before downloading.')
      return
    }
    setIsCoverLetterDownloading(true)
    setCoverLetterDownloadError('')
    try {
      const blob = await createCoverLetterPdf({
        text,
        title: coverLetterEditor.label || 'Cover Letter'
      })
      const safeLabel = (coverLetterEditor.label || type || 'cover-letter')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
      const fileName = `${safeLabel || 'cover-letter'}-updated.pdf`
      const blobUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(blobUrl)
      setCoverLetterClipboardStatus('Updated PDF downloaded.')
    } catch (err) {
      console.error('Cover letter PDF generation failed', err)
      setCoverLetterDownloadError('Unable to create the PDF. Please try again.')
    } finally {
      setIsCoverLetterDownloading(false)
    }
  }, [coverLetterEditor, coverLetterDrafts])

  const openCoverLetterEditorModal = useCallback(
    (file) => {
      if (!file || !isCoverLetterType(file.type)) return
      const presentation = file.presentation || getDownloadPresentation(file)
      setCoverLetterEditor({
        type: file.type,
        label: presentation.label,
        presentation,
        file
      })
      setCoverLetterDownloadError('')
      setCoverLetterClipboardStatus('')
    },
    [setCoverLetterEditor, setCoverLetterDownloadError, setCoverLetterClipboardStatus]
  )

  const closeCoverLetterEditor = useCallback(() => {
    setCoverLetterEditor(null)
    setCoverLetterDownloadError('')
    setCoverLetterClipboardStatus('')
  }, [])

  const openDownloadPreview = useCallback(
    (file) => {
      if (!file) return
      const presentation = file.presentation || getDownloadPresentation(file)
      if (presentation.category === 'cover' && isCoverLetterType(file.type)) {
        openCoverLetterEditorModal({ ...file, presentation })
        return
      }
      setPreviewFile({ ...file, presentation })
    },
    [openCoverLetterEditorModal]
  )

  const closeDownloadPreview = useCallback(() => {
    setPreviewFile(null)
  }, [])

  const renderDownloadCard = useCallback((file) => {
    if (!file) return null
    const presentation = file.presentation || getDownloadPresentation(file)
    const cardClass = `p-5 rounded-2xl shadow-sm flex flex-col gap-4 border ${
      presentation.cardBorder || 'border-purple-200'
    } ${presentation.cardAccent || 'bg-white/85'}`
    const badgeClass = `px-3 py-1 rounded-full border text-xs font-semibold uppercase tracking-wide ${
      presentation.badgeStyle || 'bg-purple-100 text-purple-700 border-purple-200'
    }`
    const buttonClass = `inline-flex items-center justify-center px-4 py-2 rounded-xl font-semibold text-white shadow focus:outline-none focus:ring-2 focus:ring-offset-2 ${
      presentation.buttonStyle || 'bg-purple-600 hover:bg-purple-700 focus:ring-purple-500'
    }`
    const secondaryButtonClass =
      'inline-flex items-center justify-center px-4 py-2 rounded-xl font-semibold border border-purple-200 text-purple-700 transition hover:text-purple-900 hover:border-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-200 focus:ring-offset-2'
    const expiryDate = file.expiresAt ? new Date(file.expiresAt) : null
    const expiryLabel =
      expiryDate && !Number.isNaN(expiryDate.getTime())
        ? expiryDate.toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short'
          })
        : null
    const isCoverLetter = presentation.category === 'cover' && isCoverLetterType(file.type)
    const coverDraftText = isCoverLetter ? coverLetterDrafts[file.type] ?? '' : ''
    const coverOriginalText = isCoverLetter
      ? coverLetterOriginals[file.type] ?? (typeof file.text === 'string' ? file.text : '')
      : ''
    const coverEdited = isCoverLetter && coverDraftText && coverDraftText !== coverOriginalText
    return (
      <div key={file.type} className={cardClass}>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-lg font-semibold text-purple-900">{presentation.label}</p>
            <p className="text-sm text-purple-700/90 leading-relaxed">{presentation.description}</p>
          </div>
          {presentation.badgeText && <span className={badgeClass}>{presentation.badgeText}</span>}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <button
              type="button"
              onClick={() =>
                isCoverLetter ? openCoverLetterEditorModal(file) : openDownloadPreview(file)
              }
              className={secondaryButtonClass}
            >
              {isCoverLetter ? 'Review & Edit' : 'Preview'}
            </button>
            <a
              href={file.url}
              className={buttonClass}
              target="_blank"
              rel="noopener noreferrer"
            >
              {presentation.linkLabel || 'Download'}
            </a>
          </div>
          {expiryLabel && (
            <p className="text-xs text-purple-600">Available until {expiryLabel}</p>
          )}
        </div>
        {isCoverLetter && (
          <p className={`text-xs ${coverEdited ? 'text-indigo-600 font-semibold' : 'text-purple-500'}`}>
            {coverEdited
              ? 'Edits pending — download the updated PDF from the editor.'
              : 'Open the editor to fine-tune the copy before downloading.'}
          </p>
        )}
      </div>
    )
  }, [
    openDownloadPreview,
    openCoverLetterEditorModal,
    coverLetterDrafts,
    coverLetterOriginals
  ])

  const rawBaseUrl = useMemo(() => getApiBaseCandidate(), [])
  const API_BASE_URL = useMemo(() => resolveApiBase(rawBaseUrl), [rawBaseUrl])

  useEffect(() => {
    if (!previewSuggestion || typeof window === 'undefined') {
      return undefined
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setPreviewSuggestion(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [previewSuggestion])

  useEffect(() => {
    if (!previewFile || typeof window === 'undefined') {
      return undefined
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setPreviewFile(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [previewFile])

  useEffect(() => {
    if (!Array.isArray(outputFiles) || outputFiles.length === 0) {
      autoPreviewSignatureRef.current = ''
      return
    }

    const candidates = outputFiles
      .map((file) => {
        if (!file || typeof file !== 'object') {
          return null
        }
        const presentation = file.presentation || getDownloadPresentation(file)
        const priority =
          typeof presentation.autoPreviewPriority === 'number'
            ? presentation.autoPreviewPriority
            : 50
        const signature = `${file.type || ''}|${file.url || ''}|${file.updatedAt || ''}`
        return { file, presentation, priority, signature }
      })
      .filter(Boolean)
      .sort((a, b) => a.priority - b.priority)

    const nextCandidate =
      candidates.find((entry) => entry.presentation?.category !== 'cover') || candidates[0]
    if (!nextCandidate || !nextCandidate.signature) {
      return
    }

    if (nextCandidate.presentation?.category === 'cover') {
      autoPreviewSignatureRef.current = nextCandidate.signature
      return
    }

    if (autoPreviewSignatureRef.current === nextCandidate.signature) {
      return
    }

    autoPreviewSignatureRef.current = nextCandidate.signature
    setPreviewFile({ ...nextCandidate.file, presentation: nextCandidate.presentation })
  }, [outputFiles, autoPreviewSignatureRef])

  useEffect(() => {
    if (!coverLetterEditor) {
      return
    }
    const exists = outputFiles.some((file) => file?.type === coverLetterEditor.type)
    if (!exists) {
      setCoverLetterEditor(null)
    }
  }, [coverLetterEditor, outputFiles])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    const isDevEnvironment =
      typeof import.meta !== 'undefined' &&
      import.meta.env &&
      import.meta.env.DEV

    if (isDevEnvironment) {
      window.__RESUMEFORGE_DEBUG_SET_IMPROVEMENTS__ = (payload) => {
        if (!Array.isArray(payload)) {
          setImprovementResults([])
          return
        }

        const hydrated = payload.map((entry, index) => ({
          id: entry?.id || `debug-improvement-${index}`,
          type: entry?.type || 'custom',
          title: entry?.title || 'Improvement',
          beforeExcerpt: entry?.beforeExcerpt || '',
          afterExcerpt: entry?.afterExcerpt || '',
          explanation: entry?.explanation || '',
          updatedResume: entry?.updatedResume || '',
          confidence: typeof entry?.confidence === 'number' ? entry.confidence : 0.6,
          accepted: entry?.accepted ?? null,
          improvementSummary: Array.isArray(entry?.improvementSummary)
            ? entry.improvementSummary
            : [],
          scoreDelta:
            typeof entry?.scoreDelta === 'number' && Number.isFinite(entry.scoreDelta)
              ? entry.scoreDelta
              : null,
          rescorePending: Boolean(entry?.rescorePending),
          rescoreError: typeof entry?.rescoreError === 'string' ? entry.rescoreError : ''
        }))

        setImprovementResults(hydrated)
      }
    }

    return () => {
      if (isDevEnvironment && window.__RESUMEFORGE_DEBUG_SET_IMPROVEMENTS__) {
        delete window.__RESUMEFORGE_DEBUG_SET_IMPROVEMENTS__
      }
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return undefined
    }

    const handleMessage = (event) => {
      const data = event.data
      if (!data || typeof data !== 'object') return

      if (data.type === 'OFFLINE_UPLOAD_COMPLETE') {
        const payload = data.payload || {}
        setQueuedMessage(
          payload.message || data.message || 'Upload processed after reconnection.'
        )
        setIsProcessing(false)
        setError('')
        const payloadUrls = Array.isArray(payload.urls) ? payload.urls : []
        setOutputFiles(payloadUrls)
        const { drafts, originals } = deriveCoverLetterStateFromFiles(payloadUrls)
        setCoverLetterDrafts(drafts)
        setCoverLetterOriginals(originals)
        setMatch(payload.match || null)
      } else if (data.type === 'OFFLINE_UPLOAD_FAILED') {
        setQueuedMessage('')
        setIsProcessing(false)
        const payloadError = data?.payload?.error
        const failureMessage =
          (typeof data?.message === 'string' && data.message.trim()) ||
          (typeof payloadError?.message === 'string' && payloadError.message.trim()) ||
          'Failed to process queued upload. Please try again.'
        setError(failureMessage)
      }
    }

    navigator.serviceWorker.addEventListener('message', handleMessage)

    navigator.serviceWorker.ready
      .then((registration) => {
        registration.active?.postMessage({ type: 'RETRY_UPLOADS' })
      })
      .catch(() => {})

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage)
    }
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && !file.name.toLowerCase().match(/\.(pdf|docx?)$/)) {
      setError('Only PDF, DOC, or DOCX files are supported.')
      return
    }
    if (file) setCvFile(file)
  }, [])

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file && !file.name.toLowerCase().match(/\.(pdf|docx?)$/)) {
      setError('Only PDF, DOC, or DOCX files are supported.')
      return
    }
    if (file) setCvFile(file)
  }

  const resetAnalysisState = () => {
    setOutputFiles([])
    setMatch(null)
    setScoreBreakdown([])
    setResumeText('')
    setJobDescriptionText('')
    setJobSkills([])
    setResumeSkills([])
    setKnownCertificates([])
    setManualCertificatesData([])
    setCertificateInsights(null)
    setSelectionInsights(null)
    setImprovementResults([])
    setChangeLog([])
    setInitialAnalysisSnapshot(null)
    setJobId('')
    setTemplateContext(null)
    setIsGeneratingDocs(false)
    setCoverLetterDrafts({})
    setCoverLetterOriginals({})
    setCoverLetterEditor(null)
    setCoverLetterDownloadError('')
    setCoverLetterClipboardStatus('')
    setResumeHistory([])
  }

  const handleScoreSubmit = async () => {
    const manualText = manualJobDescription.trim()
    const jobUrl = jobDescriptionUrl.trim()

    if (!cvFile) {
      setError('Please upload a CV before submitting.')
      return
    }
    if (manualJobDescriptionRequired && !manualText) {
      setError('Please paste the full job description before continuing.')
      manualJobDescriptionRef.current?.focus?.()
      return
    }
    if (!manualText && !jobUrl) {
      setError('Provide a job description URL or paste the full job description before continuing.')
      manualJobDescriptionRef.current?.focus?.()
      return
    }

    setIsProcessing(true)
    setError('')
    setMatch(null)
    setQueuedMessage('')
    resetAnalysisState()

    try {
      const formData = new FormData()
      formData.append('resume', cvFile)
      formData.append('linkedinProfileUrl', profileUrl)
      if (manualText) {
        formData.append('manualJobDescription', manualText)
      }
      if (jobUrl) {
        formData.append('jobDescriptionUrl', jobUrl)
      }
      if (credlyUrl) formData.append('credlyProfileUrl', credlyUrl)
      if (manualCertificatesInput.trim()) {
        formData.append('manualCertificates', manualCertificatesInput.trim())
      }
      if (selectedTemplate) {
        formData.append('template', selectedTemplate)
        formData.append('templateId', selectedTemplate)
      }

      const requestUrl = buildApiUrl(API_BASE_URL, '/api/process-cv')

      const response = await fetch(requestUrl, {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        let message = response.status >= 500 ? CV_GENERATION_ERROR_MESSAGE : 'Request failed'
        try {
          const data = await response.json()
          const apiMessage =
            data?.error?.message ||
            (typeof data?.message === 'string' ? data.message : undefined) ||
            (typeof data?.error === 'string' ? data.error : undefined)
          if (apiMessage) {
            message = apiMessage
          }
          if (data?.error?.code && data?.error?.code !== 'PROCESSING_FAILED') {
            message = `${message} (${data.error.code})`
          }
          const manualRequired = data?.error?.details?.manualInputRequired === true
          const fetchReason = typeof data?.error?.details?.reason === 'string' ? data.error.details.reason : ''
          if (manualRequired) {
            setManualJobDescriptionRequired(true)
            manualJobDescriptionRef.current?.focus?.()
            if (fetchReason && fetchReason.toUpperCase() === 'FETCH_BLOCKED') {
              message =
                'This job post blocks automated access. Paste the full job description to continue.'
            }
          }
        } catch {
          try {
            const text = await response.text()
            if (text) message = text
          } catch {}
        }
        console.error('Resume processing request failed', {
          status: response.status,
          statusText: response.statusText,
          message
        })
        throw new Error(message)
      }

      const contentType = response.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        const text = await response.text()
        const fallbackMessage =
          response.status >= 500 ? CV_GENERATION_ERROR_MESSAGE : 'Invalid JSON response'
        throw new Error(text || fallbackMessage)
      }

      const data = await response.json()

      if (response.status === 202 && data?.queued) {
        setQueuedMessage(
          data.message ||
            'You are offline. The upload will resume automatically once you reconnect.'
        )
        return
      }

      const outputFilesValue = Array.isArray(data.urls) ? data.urls : []
      setOutputFiles(outputFilesValue)
      const { drafts: analysisCoverLetterDrafts, originals: analysisCoverLetterOriginals } =
        deriveCoverLetterStateFromFiles(outputFilesValue)
      setCoverLetterDrafts(analysisCoverLetterDrafts)
      setCoverLetterOriginals(analysisCoverLetterOriginals)
      const jobIdValue = typeof data.jobId === 'string' ? data.jobId : ''
      setJobId(jobIdValue)
      const templateContextValue = normalizeTemplateContext(
        data && typeof data.templateContext === 'object' ? data.templateContext : null
      )
      setTemplateContext(templateContextValue)
      const probabilityBeforeValue =
        typeof data.selectionProbabilityBefore === 'number'
          ? data.selectionProbabilityBefore
          : typeof data.selectionInsights?.before?.probability === 'number'
            ? data.selectionInsights.before.probability
            : null
      const probabilityBeforeMeaning =
        data.selectionInsights?.before?.level ||
        (typeof probabilityBeforeValue === 'number'
          ? probabilityBeforeValue >= 75
            ? 'High'
            : probabilityBeforeValue >= 55
              ? 'Medium'
              : 'Low'
          : null)
      const probabilityBeforeRationale =
        data.selectionInsights?.before?.message ||
        data.selectionInsights?.before?.rationale ||
        (typeof probabilityBeforeValue === 'number' && probabilityBeforeMeaning
          ? `Projected ${probabilityBeforeMeaning.toLowerCase()} probability (${probabilityBeforeValue}%) that this resume will be shortlisted for the JD.`
          : null)
      const probabilityValue =
        typeof data.selectionProbability === 'number'
          ? data.selectionProbability
          : typeof data.selectionInsights?.after?.probability === 'number'
            ? data.selectionInsights.after.probability
            : typeof data.selectionInsights?.probability === 'number'
              ? data.selectionInsights.probability
              : null
      const probabilityMeaning =
        data.selectionInsights?.after?.level ||
        data.selectionInsights?.level ||
        (typeof probabilityValue === 'number'
          ? probabilityValue >= 75
            ? 'High'
            : probabilityValue >= 55
              ? 'Medium'
              : 'Low'
          : null)
      const probabilityRationale =
        data.selectionInsights?.after?.message ||
        data.selectionInsights?.after?.rationale ||
        data.selectionInsights?.message ||
        data.selectionInsights?.rationale ||
        (typeof probabilityValue === 'number' && probabilityMeaning
          ? `Projected ${probabilityMeaning.toLowerCase()} probability (${probabilityValue}%) that this resume will be shortlisted for the JD.`
          : null)

      const enhancedScoreResponse =
        typeof data.enhancedScore === 'number'
          ? data.enhancedScore
          : typeof data.originalScore === 'number'
            ? data.originalScore
            : null

      const matchPayload = {
        table: Array.isArray(data.table) ? data.table : [],
        addedSkills: Array.isArray(data.addedSkills) ? data.addedSkills : [],
        missingSkills: Array.isArray(data.missingSkills) ? data.missingSkills : [],
        originalScore:
          typeof data.originalScore === 'number'
            ? data.originalScore
            : enhancedScoreResponse ?? 0,
        enhancedScore: enhancedScoreResponse ?? 0,
        originalTitle: data.originalTitle || '',
        modifiedTitle: data.modifiedTitle || '',
        selectionProbability: probabilityValue,
        selectionProbabilityMeaning: probabilityMeaning,
        selectionProbabilityRationale: probabilityRationale,
        selectionProbabilityBefore: probabilityBeforeValue,
        selectionProbabilityBeforeMeaning: probabilityBeforeMeaning,
        selectionProbabilityBeforeRationale: probabilityBeforeRationale,
        selectionProbabilityAfter: probabilityValue,
        selectionProbabilityAfterMeaning: probabilityMeaning,
        selectionProbabilityAfterRationale: probabilityRationale
      }
      setMatch(matchPayload)
      const breakdownCandidates = Array.isArray(data.atsSubScores)
        ? data.atsSubScores
        : Array.isArray(data.scoreBreakdown)
          ? data.scoreBreakdown
          : Object.values(data.scoreBreakdown || {})
      const normalizedBreakdown = orderAtsMetrics(breakdownCandidates).map((metric) => ({
        ...metric,
        tip: metric?.tip ?? metric?.tips?.[0] ?? '',
      }))
      setScoreBreakdown(normalizedBreakdown)
      const resumeTextValue = typeof data.resumeText === 'string' ? data.resumeText : ''
      const originalResumeSnapshot =
        typeof data.originalResumeText === 'string' ? data.originalResumeText : resumeTextValue
      setResumeText(originalResumeSnapshot)
      const jobDescriptionValue =
        typeof data.jobDescriptionText === 'string' ? data.jobDescriptionText : ''
      setJobDescriptionText(jobDescriptionValue)
      const jobSkillsValue = Array.isArray(data.jobSkills) ? data.jobSkills : []
      setJobSkills(jobSkillsValue)
      const resumeSkillsValue = Array.isArray(data.resumeSkills) ? data.resumeSkills : []
      setResumeSkills(resumeSkillsValue)
      const knownCertificatesValue = (data.certificateInsights?.known || []).map((cert) => ({
        ...cert,
        source: cert.source || 'resume'
      }))
      setKnownCertificates(knownCertificatesValue)
      const manualCertificatesValue = data.manualCertificates || []
      setManualCertificatesData(manualCertificatesValue)
      const certificateInsightsValue = data.certificateInsights || null
      setCertificateInsights(certificateInsightsValue)
      const selectionInsightsValue = data.selectionInsights || null
      setSelectionInsights(selectionInsightsValue)
      const changeLogValue = Array.isArray(data.changeLog) ? data.changeLog : []
      setChangeLog(changeLogValue)

      setManualJobDescriptionRequired(false)

      setInitialAnalysisSnapshot({
        resumeText: originalResumeSnapshot,
        originalResumeText: originalResumeSnapshot,
        enhancedResumeText: resumeTextValue,
        jobDescriptionText: jobDescriptionValue,
        jobSkills: cloneData(jobSkillsValue),
        resumeSkills: cloneData(resumeSkillsValue),
        knownCertificates: cloneData(knownCertificatesValue),
        manualCertificatesData: cloneData(manualCertificatesValue),
        certificateInsights: cloneData(certificateInsightsValue),
        selectionInsights: cloneData(selectionInsightsValue),
        match: cloneData(matchPayload),
        scoreBreakdown: cloneData(normalizedBreakdown),
        outputFiles: cloneData(outputFilesValue),
        templateContext: cloneData(templateContextValue),
        changeLog: cloneData(changeLogValue),
        coverLetterDrafts: cloneData(analysisCoverLetterDrafts),
        coverLetterOriginals: cloneData(analysisCoverLetterOriginals)
      })
      setResumeHistory([])
    } catch (err) {
      console.error('Unable to enhance CV', err)
      const errorMessage =
        (typeof err?.message === 'string' && err.message.trim()) ||
        CV_GENERATION_ERROR_MESSAGE
      setError(errorMessage)
    } finally {
      setIsProcessing(false)
    }
  }

  const hasAcceptedImprovements = useMemo(
    () => improvementResults.some((item) => item.accepted === true),
    [improvementResults]
  )

  const baselineResumeText =
    typeof initialAnalysisSnapshot?.originalResumeText === 'string'
      ? initialAnalysisSnapshot.originalResumeText
      : initialAnalysisSnapshot?.resumeText ?? ''

  const resetAvailable =
    Boolean(initialAnalysisSnapshot) &&
    (baselineResumeText !== resumeText || changeLog.length > 0 || hasAcceptedImprovements)

  const handleResetToOriginal = useCallback(() => {
    if (!initialAnalysisSnapshot) return

    const snapshot = initialAnalysisSnapshot
    const resumeValue =
      typeof snapshot.originalResumeText === 'string'
        ? snapshot.originalResumeText
        : typeof snapshot.resumeText === 'string'
          ? snapshot.resumeText
          : ''
    setResumeText(resumeValue)
    const jobDescriptionValue =
      typeof snapshot.jobDescriptionText === 'string' ? snapshot.jobDescriptionText : ''
    setJobDescriptionText(jobDescriptionValue)

    const jobSkillsValue = Array.isArray(snapshot.jobSkills)
      ? cloneData(snapshot.jobSkills)
      : []
    setJobSkills(jobSkillsValue)

    const resumeSkillsValue = Array.isArray(snapshot.resumeSkills)
      ? cloneData(snapshot.resumeSkills)
      : []
    setResumeSkills(resumeSkillsValue)

    const knownCertificatesValue = Array.isArray(snapshot.knownCertificates)
      ? cloneData(snapshot.knownCertificates)
      : []
    setKnownCertificates(knownCertificatesValue)

    const manualCertificatesValue = cloneData(snapshot.manualCertificatesData)
    setManualCertificatesData(manualCertificatesValue || [])

    setCertificateInsights(cloneData(snapshot.certificateInsights))
    setSelectionInsights(cloneData(snapshot.selectionInsights))

    setMatch(snapshot.match ? cloneData(snapshot.match) : null)

    const scoreBreakdownValue = Array.isArray(snapshot.scoreBreakdown)
      ? cloneData(snapshot.scoreBreakdown)
      : []
    setScoreBreakdown(scoreBreakdownValue)

    const outputFilesValue = Array.isArray(snapshot.outputFiles)
      ? cloneData(snapshot.outputFiles)
      : []
    setOutputFiles(outputFilesValue)

    const snapshotCoverDrafts =
      snapshot.coverLetterDrafts && typeof snapshot.coverLetterDrafts === 'object'
        ? cloneData(snapshot.coverLetterDrafts)
        : deriveCoverLetterStateFromFiles(outputFilesValue).drafts
    const snapshotCoverOriginals =
      snapshot.coverLetterOriginals && typeof snapshot.coverLetterOriginals === 'object'
        ? cloneData(snapshot.coverLetterOriginals)
        : deriveCoverLetterStateFromFiles(outputFilesValue).originals
    setCoverLetterDrafts(snapshotCoverDrafts || {})
    setCoverLetterOriginals(snapshotCoverOriginals || {})
    setCoverLetterEditor(null)
    setCoverLetterDownloadError('')
    setCoverLetterClipboardStatus('')

    const templateContextValue = normalizeTemplateContext(
      snapshot.templateContext && typeof snapshot.templateContext === 'object'
        ? cloneData(snapshot.templateContext)
        : null
    )
    setTemplateContext(templateContextValue)

    const snapshotChangeLog = Array.isArray(snapshot.changeLog)
      ? cloneData(snapshot.changeLog)
      : []
    setChangeLog(snapshotChangeLog || [])
    setImprovementResults((prev) =>
      prev.map((item) => ({
        ...item,
        accepted: null,
        rescorePending: false,
        rescoreError: '',
        scoreDelta: null
      }))
    )
    setResumeHistory([])
    setError('')
    setPreviewSuggestion(null)
  }, [initialAnalysisSnapshot])

  const improvementAvailable =
    improvementsUnlocked && Boolean(resumeText && resumeText.trim()) && Boolean(jobDescriptionText && jobDescriptionText.trim())
  const hasAcceptedImprovement = useMemo(
    () => improvementResults.some((item) => item.accepted === true),
    [improvementResults]
  )
  const analysisHighlights = useMemo(() => {
    const items = []
    if (Array.isArray(match?.missingSkills) && match.missingSkills.length > 0) {
      items.push({
        key: 'missing-skills',
        tone: 'warning',
        title: 'Missing skills',
        message: `Add ${summariseItems(match.missingSkills, { limit: 6 })} to mirror the JD keywords.`
      })
    }
    if (
      match?.originalTitle &&
      match?.modifiedTitle &&
      match.modifiedTitle !== match.originalTitle
    ) {
      items.push({
        key: 'designation-mismatch',
        tone: 'info',
        title: 'Designation mismatch',
        message: `Resume lists ${match.originalTitle}; align it with the target designation ${match.modifiedTitle}.`
      })
    }
    const addedSkills = Array.isArray(match?.addedSkills) ? match.addedSkills : []
    if (addedSkills.length > 0) {
      items.push({
        key: 'added-skills',
        tone: 'success',
        title: 'Highlights added',
        message: `Enhanced drafts now surface ${summariseItems(addedSkills, { limit: 5 })}. Review them before the interview.`
      })
    }
    if (certificateInsights?.manualEntryRequired) {
      items.push({
        key: 'cert-manual',
        tone: 'warning',
        title: 'Missing certifications',
        message:
          'Credly requires authentication. Paste critical certifications manually so we can include them.'
      })
    }
    const recommendedCertificates = Array.isArray(certificateInsights?.suggestions)
      ? certificateInsights.suggestions.filter(Boolean)
      : []
    if (recommendedCertificates.length > 0) {
      items.push({
        key: 'cert-suggestions',
        tone: 'info',
        title: 'Recommended certifications',
        message: `Consider adding ${summariseItems(recommendedCertificates, { limit: 4 })} to strengthen the match.`
      })
    }
    return items
  }, [match, certificateInsights])

  const jobFitScores = useMemo(() => {
    if (!Array.isArray(selectionInsights?.jobFitScores)) {
      return []
    }
    return selectionInsights.jobFitScores.map((metric) => {
      const rawScore = typeof metric?.score === 'number' ? metric.score : 0
      const safeScore = Number.isFinite(rawScore)
        ? Math.min(Math.max(Math.round(rawScore), 0), 100)
        : 0
      return {
        ...metric,
        score: safeScore
      }
    })
  }, [selectionInsights])

  const jobFitAverage =
    typeof selectionInsights?.jobFitAverage === 'number' && Number.isFinite(selectionInsights.jobFitAverage)
      ? Math.min(Math.max(Math.round(selectionInsights.jobFitAverage), 0), 100)
      : null

  const deltaSummary = useMemo(
    () =>
      deriveDeltaSummary({
        match,
        changeLog,
        certificateInsights,
        manualCertificates: manualCertificatesData,
        jobSkills,
        resumeSkills
      }),
    [match, changeLog, certificateInsights, manualCertificatesData, jobSkills, resumeSkills]
  )

  const resumeComparisonData = useMemo(() => {
    const baselineRaw = typeof baselineResumeText === 'string' ? baselineResumeText : ''
    const improvedRaw = typeof resumeText === 'string' ? resumeText : ''
    const baselineTrimmed = baselineRaw.trim()
    const improvedTrimmed = improvedRaw.trim()

    if (!baselineTrimmed || !improvedTrimmed || baselineTrimmed === improvedTrimmed) {
      return null
    }

    const normaliseText = (value) => {
      if (typeof value === 'string') {
        return value.trim()
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value)
      }
      return ''
    }

    const toList = (value) => {
      if (Array.isArray(value)) {
        return value.map(normaliseText).filter(Boolean)
      }
      const text = normaliseText(value)
      return text ? [text] : []
    }

    const addItemsToSet = (targetSet, values) => {
      toList(values).forEach((item) => targetSet.add(item))
    }

    let segmentCounter = 0
    const segmentMap = new Map()

    const ensureSegmentBucket = ({ section, fallbackLabel = '', keyHint = '' }) => {
      const sectionLabel = normaliseText(section) || normaliseText(fallbackLabel) || 'Updated Section'
      let mapKey = normaliseText(keyHint) || sectionLabel.toLowerCase()
      if (!mapKey) {
        mapKey = `segment-${segmentCounter++}`
      }

      if (!segmentMap.has(mapKey)) {
        segmentMap.set(mapKey, {
          section: sectionLabel,
          added: new Set(),
          removed: new Set(),
          reason: new Set()
        })
      }

      const bucket = segmentMap.get(mapKey)
      if (!bucket.section && sectionLabel) {
        bucket.section = sectionLabel
      }
      return bucket
    }

    const pushReasons = (bucket, reasons, fallbackDetail = '') => {
      const lines = toList(reasons)
      if (lines.length === 0 && fallbackDetail) {
        lines.push(...toList(fallbackDetail))
      }
      lines.forEach((line) => bucket.reason.add(line))
    }

    const aggregatedAdded = new Set()
    const aggregatedRemoved = new Set()
    const changeLogEntries = Array.isArray(changeLog) ? changeLog : []

    changeLogEntries.forEach((entry) => {
      const entryAdded = toList(entry?.addedItems)
      const entryRemoved = toList(entry?.removedItems)

      addItemsToSet(aggregatedAdded, entryAdded)
      addItemsToSet(aggregatedRemoved, entryRemoved)

      const segments = Array.isArray(entry?.summarySegments) ? entry.summarySegments : []

      if (segments.length > 0) {
        segments.forEach((segment) => {
          addItemsToSet(aggregatedAdded, segment?.added)
          addItemsToSet(aggregatedRemoved, segment?.removed)

          const bucket = ensureSegmentBucket({
            section: segment?.section,
            fallbackLabel: entry?.title,
            keyHint: segment?.section || entry?.id || entry?.title
          })

          addItemsToSet(bucket.added, segment?.added)
          addItemsToSet(bucket.removed, segment?.removed)
          pushReasons(bucket, segment?.reason, entry?.detail)
        })
      } else if (entryAdded.length > 0 || entryRemoved.length > 0) {
        const bucket = ensureSegmentBucket({
          section: entry?.title,
          fallbackLabel: entry?.label,
          keyHint: entry?.id || entry?.title || entry?.label
        })

        addItemsToSet(bucket.added, entryAdded)
        addItemsToSet(bucket.removed, entryRemoved)
        pushReasons(bucket, [], entry?.detail)
      }
    })

    const summarySegments = Array.from(segmentMap.values())
      .map((segment) => ({
        section: segment.section,
        added: Array.from(segment.added),
        removed: Array.from(segment.removed),
        reason: Array.from(segment.reason)
      }))
      .filter(
        (segment) =>
          segment.section || segment.added.length > 0 || segment.removed.length > 0 || segment.reason.length > 0
      )

    return {
      before: baselineRaw,
      after: improvedRaw,
      summarySegments,
      addedItems: Array.from(aggregatedAdded),
      removedItems: Array.from(aggregatedRemoved)
    }
  }, [baselineResumeText, resumeText, changeLog])

  const showDeltaSummary = Boolean(
    match ||
      (certificateInsights &&
        ((certificateInsights.known && certificateInsights.known.length > 0) ||
          (certificateInsights.suggestions && certificateInsights.suggestions.length > 0) ||
          certificateInsights.manualEntryRequired)) ||
      manualCertificatesData.length > 0 ||
      changeLog.length > 0
  )

  const rescoreAfterImprovement = useCallback(
    async ({ updatedResume, baselineScore, previousMissingSkills }) => {
      const resumeDraft = typeof updatedResume === 'string' ? updatedResume : ''
      if (!resumeDraft.trim()) {
        return { delta: null, enhancedScore: null }
      }

      const payload = {
        resumeText: resumeDraft,
        jobDescriptionText,
        jobSkills,
        previousMissingSkills
      }

      if (typeof baselineScore === 'number' && Number.isFinite(baselineScore)) {
        payload.baselineScore = baselineScore
      }

      const requestUrl = buildApiUrl(API_BASE_URL, '/api/rescore-improvement')
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errPayload = await response.json().catch(() => ({}))
        const message =
          errPayload?.message ||
          errPayload?.error ||
          'Unable to refresh scores after applying the improvement.'
        throw new Error(message)
      }

      const data = await response.json()
      const metrics = orderAtsMetrics(
        Array.isArray(data.atsSubScores)
          ? data.atsSubScores
          : Array.isArray(data.scoreBreakdown)
            ? data.scoreBreakdown
            : Object.values(data.scoreBreakdown || {})
      )
      setScoreBreakdown(metrics)

      const nextResumeSkills = Array.isArray(data.resumeSkills) ? data.resumeSkills : []
      setResumeSkills(nextResumeSkills)

      const normalizeSkillList = (value) =>
        (Array.isArray(value) ? value : [])
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter(Boolean)

      const previousMissingList = normalizeSkillList(previousMissingSkills)
      const responseCovered = normalizeSkillList(data.coveredSkills)

      setMatch((prev) => {
        const base = prev || {}
        const nextMissing = Array.isArray(data.missingSkills) ? data.missingSkills : []
        const missingLower = new Set(
          nextMissing
            .map((item) => (typeof item === 'string' ? item.toLowerCase() : ''))
            .filter(Boolean)
        )
        const newlyCovered = previousMissingList.filter((skill) => {
          const lower = skill.toLowerCase()
          return !missingLower.has(lower)
        })
        const combinedCovered = Array.from(
          new Set(
            [...newlyCovered, ...responseCovered]
              .map((skill) => (typeof skill === 'string' ? skill.trim() : ''))
              .filter(Boolean)
          )
        )
        const existingAdded = Array.isArray(base.addedSkills) ? base.addedSkills : []
        const mergedAdded = Array.from(
          new Set(
            [...existingAdded, ...combinedCovered]
              .map((skill) => (typeof skill === 'string' ? skill.trim() : ''))
              .filter(Boolean)
          )
        )
        const enhancedScoreValue =
          typeof data.enhancedScore === 'number' && Number.isFinite(data.enhancedScore)
            ? Math.round(data.enhancedScore)
            : base.enhancedScore
        const nextTable = Array.isArray(data.table) ? data.table : base.table || []

        return {
          ...base,
          table: nextTable,
          missingSkills: nextMissing,
          addedSkills: mergedAdded,
          enhancedScore: enhancedScoreValue
        }
      })

      const baselineValid = typeof baselineScore === 'number' && Number.isFinite(baselineScore)
      const enhancedValid =
        typeof data.enhancedScore === 'number' && Number.isFinite(data.enhancedScore)
      const delta = baselineValid && enhancedValid ? data.enhancedScore - baselineScore : null

      return { delta, enhancedScore: enhancedValid ? data.enhancedScore : null }
    },
    [API_BASE_URL, jobDescriptionText, jobSkills]
  )

  const persistChangeLogEntry = useCallback(
    async (entry) => {
      if (!entry || !jobId || !profileUrl || !profileUrl.trim()) {
        return null
      }

      const payload = {
        jobId,
        linkedinProfileUrl: profileUrl.trim(),
        entry
      }

      const response = await fetch(buildApiUrl(API_BASE_URL, '/api/change-log'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errPayload = await response.json().catch(() => ({}))
        const message =
          errPayload?.error?.message ||
          (typeof errPayload?.message === 'string' ? errPayload.message : undefined) ||
          (typeof errPayload?.error === 'string' ? errPayload.error : undefined) ||
          'Unable to store the change log entry.'
        throw new Error(message)
      }

      const data = await response.json()
      const entries = Array.isArray(data.changeLog) ? data.changeLog : []
      setChangeLog(entries)
      return entries
    },
    [API_BASE_URL, jobId, profileUrl]
  )

  const applyImprovementSuggestion = useCallback(
    async (suggestion) => {
      if (!suggestion || !suggestion.id) {
        return false
      }

      const id = suggestion.id
      const updatedResumeDraft = suggestion.updatedResume || resumeText
      const baselineScore = Number.isFinite(match?.enhancedScore)
        ? match.enhancedScore
        : Number.isFinite(match?.originalScore)
          ? match.originalScore
          : null
      const previousMissingSkills = Array.isArray(match?.missingSkills) ? match.missingSkills : []
      const changeLogEntry = buildChangeLogEntry(suggestion)
      const historySnapshot = {
        id: changeLogEntry?.id || id,
        suggestionId: id,
        title: suggestion?.title || 'Improvement Applied',
        type: suggestion?.type || 'custom',
        timestamp: Date.now(),
        resumeBefore: resumeText,
        resumeAfter: updatedResumeDraft,
        matchBefore: match ? cloneData(match) : null,
        scoreBreakdownBefore: Array.isArray(scoreBreakdown) ? cloneData(scoreBreakdown) : [],
        resumeSkillsBefore: Array.isArray(resumeSkills) ? cloneData(resumeSkills) : [],
        changeLogBefore: Array.isArray(changeLog) ? cloneData(changeLog) : [],
        detail: changeLogEntry?.detail || '',
        changeLabel: changeLogEntry?.label || ''
      }
      setResumeHistory((prev) => {
        const filtered = Array.isArray(prev) ? prev.filter((entry) => entry.id !== historySnapshot.id) : []
        return [historySnapshot, ...filtered]
      })

      let previousChangeLog = null

      setImprovementResults((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, accepted: true, rescorePending: true, rescoreError: '' }
            : item
        )
      )

      if (updatedResumeDraft) {
        setResumeText(updatedResumeDraft)
      }

      let persistedEntryPayload = null
      if (changeLogEntry) {
        const entryPayload = { ...changeLogEntry }
        if (typeof historySnapshot.resumeBefore === 'string') {
          entryPayload.resumeBeforeText = historySnapshot.resumeBefore
        }
        if (typeof historySnapshot.resumeAfter === 'string') {
          entryPayload.resumeAfterText = historySnapshot.resumeAfter
        }
        const historyContextPayload = {}
        if (historySnapshot.matchBefore && typeof historySnapshot.matchBefore === 'object') {
          historyContextPayload.matchBefore = cloneData(historySnapshot.matchBefore)
        }
        if (Array.isArray(historySnapshot.scoreBreakdownBefore)) {
          historyContextPayload.scoreBreakdownBefore = cloneData(
            historySnapshot.scoreBreakdownBefore
          )
        }
        if (Array.isArray(historySnapshot.resumeSkillsBefore)) {
          historyContextPayload.resumeSkillsBefore = historySnapshot.resumeSkillsBefore
            .map((item) => (typeof item === 'string' ? item.trim() : ''))
            .filter(Boolean)
        }
        if (Object.keys(historyContextPayload).length > 0) {
          entryPayload.historyContext = historyContextPayload
        }
        persistedEntryPayload = entryPayload
        setChangeLog((prev) => {
          previousChangeLog = prev
          if (prev.some((entry) => entry.id === entryPayload.id)) {
            return prev.map((entry) => (entry.id === entryPayload.id ? { ...entry, ...entryPayload } : entry))
          }
          return [entryPayload, ...prev]
        })

        try {
          await persistChangeLogEntry(entryPayload)
        } catch (err) {
          console.error('Persisting change log entry failed', err)
          setError(err.message || 'Unable to store the change log entry.')
          setChangeLog(previousChangeLog || [])
        }
      }

      try {
        const result = await rescoreAfterImprovement({
          updatedResume: updatedResumeDraft,
          baselineScore,
          previousMissingSkills
        })
        const deltaValue = result && Number.isFinite(result.delta) ? result.delta : null

        if (changeLogEntry && Number.isFinite(deltaValue)) {
          setChangeLog((prev) =>
            prev.map((entry) =>
              entry.id === changeLogEntry.id ? { ...entry, scoreDelta: deltaValue } : entry
            )
          )
          try {
            const payloadWithDelta = persistedEntryPayload
              ? { ...persistedEntryPayload, scoreDelta: deltaValue }
              : { ...changeLogEntry, scoreDelta: deltaValue }
            await persistChangeLogEntry(payloadWithDelta)
          } catch (err) {
            console.error('Updating change log entry failed', err)
            setError(err.message || 'Unable to update the change log entry.')
          }
        }

        setImprovementResults((prev) =>
          prev.map((item) =>
            item.id === id
              ? {
                  ...item,
                  rescorePending: false,
                  scoreDelta: deltaValue,
                  rescoreError: ''
                }
              : item
          )
        )
      } catch (err) {
        console.error('Improvement rescore failed', err)
        setError(err.message || 'Unable to update scores after applying improvement.')
        setImprovementResults((prev) =>
          prev.map((item) =>
            item.id === id
              ? {
                  ...item,
                  rescorePending: false,
                  rescoreError: err.message || 'Unable to refresh ATS scores.'
                }
              : item
          )
        )
      }

      return true
    },
    [
      match,
      persistChangeLogEntry,
      rescoreAfterImprovement,
      resumeText,
      scoreBreakdown,
      resumeSkills,
      changeLog,
      setChangeLog,
      setError,
      setImprovementResults,
      setResumeText
    ]
  )

  const handleDownloadPreviousVersion = useCallback(
    (changeId) => {
      if (!changeId) {
        setError('Unable to download the previous version for this update.')
        return
      }
      let historyEntry = resumeHistoryMap.get(changeId)
      if (!historyEntry) {
        const changeEntry = changeLog.find((entry) => entry?.id === changeId)
        if (changeEntry && typeof changeEntry.resumeBeforeText === 'string') {
          historyEntry = {
            id: changeEntry.id,
            title: changeEntry.title || 'Improvement Applied',
            resumeBefore: changeEntry.resumeBeforeText
          }
        }
      }
      if (!historyEntry || typeof historyEntry.resumeBefore !== 'string') {
        setError('Previous version is unavailable for this update.')
        return
      }
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        setError('Download is not supported in this environment.')
        return
      }
      const resumeContent = historyEntry.resumeBefore
      const baseNameSource = historyEntry.title || 'Resume'
      const safeBase = baseNameSource
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
      const baseName = safeBase || 'resume'
      const stamp = new Date(historyEntry.timestamp || Date.now())
        .toISOString()
        .replace(/[:.]/g, '-')
      const fileName = `${baseName}-previous-${stamp}.txt`
      try {
        const blob = new Blob([resumeContent], { type: 'text/plain;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = fileName
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      } catch (err) {
        console.error('Unable to download previous resume version', err)
        setError('Unable to download the previous version. Please try again.')
      }
    },
    [changeLog, resumeHistoryMap, setError]
  )

  const handleRevertChange = useCallback(
    async (changeId) => {
      if (!changeId) {
        setError('Unable to revert this update.')
        return
      }
      let historyEntry = resumeHistoryMap.get(changeId)
      if (!historyEntry) {
        const changeEntry = changeLog.find((entry) => entry?.id === changeId)
        if (changeEntry && typeof changeEntry.resumeBeforeText === 'string') {
          historyEntry = {
            id: changeEntry.id,
            title: changeEntry.title || 'Improvement Applied',
            type: changeEntry.type || 'custom',
            detail: changeEntry.detail || '',
            changeLabel: changeEntry.label || '',
            resumeBefore: changeEntry.resumeBeforeText,
            resumeAfter: changeEntry.resumeAfterText,
            timestamp: changeEntry.acceptedAt
              ? new Date(changeEntry.acceptedAt).getTime()
              : Date.now(),
            matchBefore: changeEntry.historyContext?.matchBefore || null,
            scoreBreakdownBefore:
              changeEntry.historyContext?.scoreBreakdownBefore || [],
            resumeSkillsBefore: changeEntry.historyContext?.resumeSkillsBefore || []
          }
        }
      }
      if (!historyEntry) {
        setError('Previous version is unavailable for this update.')
        return
      }

      const previousResumeText =
        typeof historyEntry.resumeBefore === 'string'
          ? historyEntry.resumeBefore
          : typeof historyEntry.resumeBeforeText === 'string'
            ? historyEntry.resumeBeforeText
            : ''
      if (!previousResumeText) {
        setError('Previous version is unavailable for this update.')
        return
      }

      const revertTimestamp = Date.now()
      const previousState = {
        resumeText,
        match: match ? cloneData(match) : null,
        scoreBreakdown: Array.isArray(scoreBreakdown) ? cloneData(scoreBreakdown) : [],
        resumeSkills: Array.isArray(resumeSkills) ? cloneData(resumeSkills) : [],
        changeLog: Array.isArray(changeLog) ? cloneData(changeLog) : []
      }

      const baseChangeLog = Array.isArray(historyEntry.changeLogBefore)
        ? cloneData(historyEntry.changeLogBefore)
        : Array.isArray(changeLog)
          ? cloneData(changeLog)
          : []
      const existingEntry = changeLog.find((entry) => entry?.id === changeId) || null
      const fallbackEntry = existingEntry || {
        id: historyEntry.id,
        title: historyEntry.title || 'Improvement Applied',
        detail: historyEntry.detail || 'Change reverted to the earlier version.',
        label: historyEntry.changeLabel || 'fixed',
        type: historyEntry.type || 'custom'
      }
      const revertedEntry = {
        ...fallbackEntry,
        reverted: true,
        revertedAt: revertTimestamp
      }
      const nextChangeLog = [
        revertedEntry,
        ...baseChangeLog.filter((entry) => entry?.id !== changeId)
      ]

      setResumeText(previousResumeText)
      setMatch(historyEntry.matchBefore ? cloneData(historyEntry.matchBefore) : null)
      setScoreBreakdown(
        Array.isArray(historyEntry.scoreBreakdownBefore)
          ? cloneData(historyEntry.scoreBreakdownBefore)
          : []
      )
      setResumeSkills(
        Array.isArray(historyEntry.resumeSkillsBefore)
          ? cloneData(historyEntry.resumeSkillsBefore)
          : []
      )
      setChangeLog(nextChangeLog)
      setResumeHistory((prev) =>
        prev.map((entry) =>
          entry.id === changeId ? { ...entry, reverted: true, revertedAt: revertTimestamp } : entry
        )
      )
      setImprovementResults((prev) =>
        prev.map((item) =>
          item.id === historyEntry.suggestionId
            ? {
                ...item,
                accepted: false,
                rescorePending: false,
                rescoreError: '',
                scoreDelta: null
              }
            : item
        )
      )

      if (existingEntry) {
        try {
          await persistChangeLogEntry(revertedEntry)
        } catch (err) {
          console.error('Unable to persist change log revert', err)
          setError(
            err?.message
              ? err.message
              : 'Unable to mark the change as reverted. Please try again.'
          )
          setResumeText(previousState.resumeText)
          setMatch(previousState.match ? cloneData(previousState.match) : null)
          setScoreBreakdown(
            Array.isArray(previousState.scoreBreakdown)
              ? cloneData(previousState.scoreBreakdown)
              : []
          )
          setResumeSkills(
            Array.isArray(previousState.resumeSkills)
              ? cloneData(previousState.resumeSkills)
              : []
          )
          setChangeLog(previousState.changeLog)
          setResumeHistory((prev) =>
            prev.map((entry) =>
              entry.id === changeId
                ? { ...entry, reverted: false, revertedAt: undefined }
                : entry
            )
          )
        }
      }
    },
    [
      changeLog,
      match,
      persistChangeLogEntry,
      resumeHistoryMap,
      resumeSkills,
      resumeText,
      scoreBreakdown,
      setError
    ]
  )

  const removeChangeLogEntry = useCallback(
    async (entryId) => {
      if (!entryId || !jobId || !profileUrl || !profileUrl.trim()) {
        return null
      }

      const payload = {
        jobId,
        linkedinProfileUrl: profileUrl.trim(),
        remove: true,
        entryId
      }

      const response = await fetch(buildApiUrl(API_BASE_URL, '/api/change-log'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errPayload = await response.json().catch(() => ({}))
        const message =
          errPayload?.error?.message ||
          (typeof errPayload?.message === 'string' ? errPayload.message : undefined) ||
          (typeof errPayload?.error === 'string' ? errPayload.error : undefined) ||
          'Unable to remove the change log entry.'
        throw new Error(message)
      }

      const data = await response.json()
      const entries = Array.isArray(data.changeLog) ? data.changeLog : []
      setChangeLog(entries)
      return entries
    },
    [API_BASE_URL, jobId, profileUrl]
  )

  const handleGenerateEnhancedDocs = useCallback(async () => {
    if (!jobId) {
      setError('Upload your resume and job description before generating downloads.')
      return
    }
    if (!improvementsUnlocked) {
      setError('Complete the initial scoring and improvement review before generating downloads.')
      return
    }
    if (!hasAcceptedImprovement) {
      setError('Accept at least one improvement before generating the enhanced documents.')
      return
    }
    if (isGeneratingDocs) {
      return
    }

    setIsGeneratingDocs(true)
    setError('')
    try {
      const canonicalTemplate = canonicalizeTemplateId(selectedTemplate) || 'modern'
      const nextTemplateContext = normalizeTemplateContext(
        templateContext && typeof templateContext === 'object'
          ? { ...templateContext }
          : { template1: canonicalTemplate }
      ) || { template1: canonicalTemplate }
      if (!nextTemplateContext.template1) {
        nextTemplateContext.template1 = canonicalTemplate
      }
      nextTemplateContext.selectedTemplate =
        canonicalizeTemplateId(nextTemplateContext.selectedTemplate) || nextTemplateContext.template1

      const coverSyncedContext = ensureCoverTemplateContext(
        nextTemplateContext,
        canonicalTemplate
      )

      const payload = {
        jobId,
        resumeText,
        originalResumeText:
          typeof initialAnalysisSnapshot?.originalResumeText === 'string'
            ? initialAnalysisSnapshot.originalResumeText
            : initialAnalysisSnapshot?.resumeText || '',
        jobDescriptionText,
        jobSkills,
        resumeSkills,
        linkedinProfileUrl: profileUrl.trim(),
        credlyProfileUrl: credlyUrl,
        manualCertificates: manualCertificatesData,
        templateContext: coverSyncedContext,
        templateId: canonicalTemplate,
        template: canonicalTemplate,
        baseline: {
          table: cloneData(initialAnalysisSnapshot?.match?.table || []),
          missingSkills: cloneData(initialAnalysisSnapshot?.match?.missingSkills || []),
          originalScore:
            initialAnalysisSnapshot?.match?.originalScore ??
            initialAnalysisSnapshot?.match?.enhancedScore ??
            null,
          score: initialAnalysisSnapshot?.match?.originalScore ?? null
        }
      }

      const response = await fetch(buildApiUrl(API_BASE_URL, '/api/generate-enhanced-docs'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errPayload = await response.json().catch(() => ({}))
        const message =
          errPayload?.error?.message ||
          (typeof errPayload?.message === 'string' ? errPayload.message : undefined) ||
          (typeof errPayload?.error === 'string' ? errPayload.error : undefined) ||
          CV_GENERATION_ERROR_MESSAGE
        throw new Error(message)
      }

      const data = await response.json()
      const urlsValue = Array.isArray(data.urls) ? data.urls : []
      setOutputFiles(urlsValue)
      const { drafts: generatedCoverLetterDrafts, originals: generatedCoverLetterOriginals } =
        deriveCoverLetterStateFromFiles(urlsValue)
      setCoverLetterDrafts(generatedCoverLetterDrafts)
      setCoverLetterOriginals(generatedCoverLetterOriginals)
      if (typeof data.jobId === 'string' && data.jobId.trim()) {
        setJobId(data.jobId.trim())
      }
      const templateContextValue = normalizeTemplateContext(
        data && typeof data.templateContext === 'object' ? data.templateContext : null
      )
      setTemplateContext(templateContextValue)
      setChangeLog((prev) => (Array.isArray(data.changeLog) ? data.changeLog : prev))

      const probabilityValue =
        typeof data.selectionProbability === 'number'
          ? data.selectionProbability
          : typeof data.selectionInsights?.probability === 'number'
            ? data.selectionInsights.probability
            : null
      const probabilityMeaning =
        data.selectionInsights?.level ||
        (typeof probabilityValue === 'number'
          ? probabilityValue >= 75
            ? 'High'
            : probabilityValue >= 55
              ? 'Medium'
              : 'Low'
          : null)
      const probabilityRationale =
        data.selectionInsights?.message ||
        (typeof probabilityValue === 'number' && probabilityMeaning
          ? `Projected ${probabilityMeaning.toLowerCase()} probability (${probabilityValue}%) that this resume will be shortlisted for the JD.`
          : null)

      const updatedMatch = {
        table: data.table || [],
        addedSkills: data.addedSkills || [],
        missingSkills: data.missingSkills || [],
        originalScore: data.originalScore || 0,
        enhancedScore: data.enhancedScore || 0,
        originalTitle: data.originalTitle || '',
        modifiedTitle: data.modifiedTitle || '',
        selectionProbability: probabilityValue,
        selectionProbabilityMeaning: probabilityMeaning,
        selectionProbabilityRationale: probabilityRationale
      }
      setMatch(updatedMatch)

      const breakdownCandidates = Array.isArray(data.atsSubScores)
        ? data.atsSubScores
        : Array.isArray(data.scoreBreakdown)
          ? data.scoreBreakdown
          : Object.values(data.scoreBreakdown || {})
      const normalizedBreakdown = orderAtsMetrics(breakdownCandidates).map((metric) => ({
        ...metric,
        tip: metric?.tip ?? metric?.tips?.[0] ?? ''
      }))
      setScoreBreakdown(normalizedBreakdown)

      const resumeTextValue = typeof data.resumeText === 'string' ? data.resumeText : resumeText
      setResumeText(resumeTextValue)
      const jobDescriptionValue =
        typeof data.jobDescriptionText === 'string' ? data.jobDescriptionText : jobDescriptionText
      setJobDescriptionText(jobDescriptionValue)
      const jobSkillsValue = Array.isArray(data.jobSkills) ? data.jobSkills : jobSkills
      setJobSkills(jobSkillsValue)
      const resumeSkillsValue = Array.isArray(data.resumeSkills) ? data.resumeSkills : resumeSkills
      setResumeSkills(resumeSkillsValue)
      const knownCertificatesValue = (data.certificateInsights?.known || []).map((cert) => ({
        ...cert,
        source: cert.source || 'resume'
      }))
      setKnownCertificates(knownCertificatesValue)
      const manualCertificatesValue = data.manualCertificates || manualCertificatesData
      setManualCertificatesData(manualCertificatesValue)
      setCertificateInsights(data.certificateInsights || certificateInsights)
      setSelectionInsights(data.selectionInsights || selectionInsights)
    } catch (err) {
      console.error('Enhanced document generation failed', err)
      const message =
        (typeof err?.message === 'string' && err.message.trim()) ||
        CV_GENERATION_ERROR_MESSAGE
      setError(message)
    } finally {
      setIsGeneratingDocs(false)
    }
  }, [
    API_BASE_URL,
    credlyUrl,
    hasAcceptedImprovement,
    improvementsUnlocked,
    initialAnalysisSnapshot,
    isGeneratingDocs,
    jobDescriptionText,
    jobId,
    jobSkills,
    manualCertificatesData,
    profileUrl,
    resumeSkills,
    resumeText,
    selectionInsights,
    certificateInsights,
    templateContext,
    selectedTemplate
  ])

  const handleAcceptImprovement = useCallback(
    async (id) => {
      const suggestion = improvementResults.find((item) => item.id === id)
      if (!suggestion) {
        return
      }

      await applyImprovementSuggestion(suggestion)
    },
    [applyImprovementSuggestion, improvementResults]
  )

  const handleImprovementClick = async (type) => {
    if (type !== 'enhance-all') {
      setEnhanceAllSummaryText('')
    }

    if (improvementLockRef.current) {
      setError('Please wait for the current improvement to finish before requesting another one.')
      return
    }
    if (!jobId) {
      setError('Upload your resume and complete scoring before requesting improvements.')
      return
    }
    if (!improvementAvailable) {
      setError(
        improvementUnlockMessage || 'Complete the initial analysis before requesting improvements.'
      )
      return
    }
    improvementLockRef.current = true
    setActiveImprovement(type)
    setError('')
    try {
      const requestUrl = buildApiUrl(API_BASE_URL, `/api/${type}`)
      const payload = {
        jobId,
        linkedinProfileUrl: profileUrl.trim(),
        resumeText,
        jobDescription: jobDescriptionText,
        jobTitle: match?.modifiedTitle || match?.originalTitle || '',
        currentTitle: match?.modifiedTitle || match?.originalTitle || '',
        jobSkills,
        resumeSkills,
        missingSkills: match?.missingSkills || [],
        knownCertificates,
        manualCertificates: manualCertificatesData
      }
      if (manualCertificatesInput.trim()) {
        payload.manualCertificates = manualCertificatesInput.trim()
      }

      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errPayload = await response.json().catch(() => ({}))
        const serverMessage =
          errPayload?.error?.message ||
          (typeof errPayload?.message === 'string' ? errPayload.message : undefined) ||
          (typeof errPayload?.error === 'string' ? errPayload.error : undefined)
        const message =
          response.status >= 500
            ? CV_GENERATION_ERROR_MESSAGE
            : serverMessage || 'Unable to generate improvement.'
        throw new Error(message)
      }

      const data = await response.json()
      const improvementSummary = Array.isArray(data.improvementSummary)
        ? data.improvementSummary
        : []
      const enhanceAllSummary =
        type === 'enhance-all' && improvementSummary.length
          ? formatEnhanceAllSummary(improvementSummary)
          : ''
      let explanation = (data.explanation || 'Change generated successfully.').trim()
      if (!explanation) {
        explanation = 'Change generated successfully.'
      }
      if (type === 'enhance-all' && improvementSummary.length && enhanceAllSummary) {
        const meaningfulBase = explanation && !/^applied deterministic improvements/i.test(explanation)
        explanation = meaningfulBase ? `${explanation} ${enhanceAllSummary}` : enhanceAllSummary
      }
      const suggestion = {
        id: `${type}-${Date.now()}`,
        type,
        title:
          data.title || improvementActions.find((action) => action.key === type)?.label || 'Improvement',
        beforeExcerpt: data.beforeExcerpt || '',
        afterExcerpt: data.afterExcerpt || '',
        explanation,
        updatedResume: data.updatedResume || resumeText,
        confidence: typeof data.confidence === 'number' ? data.confidence : 0.6,
        accepted: null,
        improvementSummary,
        scoreDelta: null,
        rescorePending: false,
        rescoreError: ''
      }
      setImprovementResults((prev) => [suggestion, ...prev])

      if (type === 'enhance-all') {
        await applyImprovementSuggestion(suggestion)
        const summaryText = (enhanceAllSummary || explanation).trim()
        setEnhanceAllSummaryText(summaryText)
      }
    } catch (err) {
      console.error('Improvement request failed', err)
      const errorMessage =
        (typeof err?.message === 'string' && err.message.trim()) ||
        CV_GENERATION_ERROR_MESSAGE
      setError(errorMessage)
      if (type === 'enhance-all') {
        setEnhanceAllSummaryText('')
      }
    } finally {
      setActiveImprovement('')
      improvementLockRef.current = false
    }
  }

  const handleRejectImprovement = async (id) => {
    const targetSuggestion = improvementResults.find((item) => item.id === id)
    if (targetSuggestion?.type === 'enhance-all') {
      setEnhanceAllSummaryText('')
    }
    setImprovementResults((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, accepted: false, rescorePending: false, rescoreError: '' }
          : item
      )
    )
    let previousChangeLog = null
    setChangeLog((prev) => {
      previousChangeLog = prev
      return prev.filter((entry) => entry.id !== id)
    })
    try {
      await removeChangeLogEntry(id)
    } catch (err) {
      console.error('Removing change log entry failed', err)
      setError(err.message || 'Unable to remove the change log entry.')
      setChangeLog(previousChangeLog || [])
    }
  }

  const handlePreviewImprovement = useCallback(
    (suggestion) => {
      if (!suggestion) return
      const previewEntry = buildChangeLogEntry(suggestion)
      setPreviewSuggestion({
        id: suggestion.id,
        title: suggestion.title,
        updatedResume: suggestion.updatedResume || '',
        beforeExcerpt: suggestion.beforeExcerpt || '',
        afterExcerpt: suggestion.afterExcerpt || '',
        explanation: suggestion.explanation || '',
        baseResume: resumeText,
        summarySegments: previewEntry?.summarySegments || suggestion.improvementSummary || [],
        addedItems: previewEntry?.addedItems || [],
        removedItems: previewEntry?.removedItems || [],
        itemizedChanges: previewEntry?.itemizedChanges || []
      })
    },
    [resumeText]
  )

  const closePreview = useCallback(() => {
    setPreviewSuggestion(null)
  }, [])

  const hasManualJobDescriptionInput = Boolean(manualJobDescription && manualJobDescription.trim())
  const hasJobDescriptionUrlInput = Boolean(jobDescriptionUrl && jobDescriptionUrl.trim())
  const jobDescriptionReady = manualJobDescriptionRequired
    ? hasManualJobDescriptionInput
    : hasManualJobDescriptionInput || hasJobDescriptionUrlInput
  const scoreDisabled = !profileUrl || !cvFile || isProcessing || !jobDescriptionReady

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-200 via-purple-200 to-purple-300 flex flex-col items-center p-4 md:p-8">
      <div className="w-full max-w-5xl space-y-8">
        <header className="text-center space-y-2">
          <h1 className="text-4xl md:text-5xl font-black text-purple-900 drop-shadow-sm">
            ResumeForge ATS Optimiser
          </h1>
          <p className="text-purple-800/90 max-w-2xl mx-auto">
            Upload your CV, paste the job description, and instantly receive a five-metric ATS
            breakdown with tailored improvements you can accept or reject.
          </p>
        </header>

        <section className="rounded-3xl border border-slate-200/80 bg-white/70 p-6 shadow-lg">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="space-y-3 md:max-w-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
                Explore the output
              </p>
              <h2 className="text-2xl font-bold text-slate-900">Preview an optimised resume</h2>
              <p className="text-sm leading-relaxed text-slate-600">
                Scan the QR code to view an example of the AI-enhanced download package. Every section shown
                in the dashboard is preserved in the PDF so you can confidently review the final design on any device.
              </p>
            </div>
            <figure className="mx-auto flex flex-col items-center gap-3 rounded-2xl bg-slate-50/80 p-4 shadow-inner">
              <img
                src={qrOptimisedResume}
                alt="QR code linking to a sample optimised resume"
                className="h-32 w-32 md:h-36 md:w-36"
              />
              <figcaption className="text-xs font-medium uppercase tracking-[0.25em] text-slate-500">
                Scan &amp; explore
              </figcaption>
            </figure>
          </div>
        </section>

        <ProcessFlow steps={flowSteps} />

        <section className="bg-white/80 backdrop-blur rounded-3xl border border-purple-200/60 shadow-xl p-6 md:p-8 space-y-6">
          <div
            className="w-full p-6 border-2 border-dashed border-purple-300 rounded-2xl text-center bg-gradient-to-r from-white to-purple-50"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            {cvFile ? (
              <p className="text-purple-800 font-semibold">{cvFile.name}</p>
            ) : (
              <p className="text-purple-700">
                Drag and drop your CV here, or click to select (PDF, DOC, or DOCX · max 5MB)
              </p>
            )}
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={handleFileChange}
              className="hidden"
              id="cv-input"
            />
            <label
              htmlFor="cv-input"
              className="inline-flex mt-3 px-4 py-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold cursor-pointer hover:from-indigo-600 hover:to-purple-700"
            >
              Choose File
            </label>
          </div>

          <div className="pt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <button
              onClick={handleScoreSubmit}
              disabled={scoreDisabled}
              className={`w-full md:w-auto px-6 py-3 rounded-full text-white font-semibold shadow-lg transition ${
                scoreDisabled
                  ? 'bg-purple-300 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700'
              }`}
            >
              {isProcessing ? 'Scoring…' : 'Score my CV'}
            </button>
            <p className="text-sm text-purple-700/90 md:text-right">
              Evaluate how your CV stacks up against the target JD before generating improvements.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="url"
              placeholder="LinkedIn Profile URL"
              value={profileUrl}
              onChange={(e) => setProfileUrl(e.target.value)}
              className="w-full p-3 rounded-xl border border-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
            <input
              type="url"
              placeholder="Job Description URL (optional)"
              value={jobDescriptionUrl}
              onChange={(e) => setJobDescriptionUrl(e.target.value)}
              className="w-full p-3 rounded-xl border border-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
            <div className="md:col-span-2 space-y-2">
              <label className="text-sm font-semibold text-purple-700" htmlFor="manual-job-description">
                Paste Full Job Description{' '}
                {manualJobDescriptionRequired && <span className="text-rose-600">*</span>}
              </label>
              <textarea
                id="manual-job-description"
                value={manualJobDescription}
                onChange={(e) => setManualJobDescription(e.target.value)}
                placeholder="Paste the entire job post here."
                className="w-full h-32 p-3 rounded-xl border border-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-400"
                required={manualJobDescriptionRequired}
                ref={manualJobDescriptionRef}
              />
              <p
                className={`text-xs ${
                  manualJobDescriptionRequired
                    ? 'text-rose-600 font-semibold'
                    : 'text-purple-500'
                }`}
              >
                {manualJobDescriptionRequired
                  ? 'This job post blocked automatic access. Paste the full JD to continue.'
                  : 'Paste the JD text here or provide the job post URL above and we will fetch it automatically.'}
              </p>
              {hasManualJobDescriptionInput && (
                <JobDescriptionPreview text={manualJobDescription} />
              )}
            </div>
            <input
              type="url"
              placeholder="Credly Profile URL (optional)"
              value={credlyUrl}
              onChange={(e) => setCredlyUrl(e.target.value)}
              className="w-full p-3 rounded-xl border border-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
            <div className="space-y-2">
              <label className="text-sm font-semibold text-purple-700" htmlFor="manual-certificates">
                Manual Certificates
              </label>
              <textarea
                id="manual-certificates"
                value={manualCertificatesInput}
                onChange={(e) => setManualCertificatesInput(e.target.value)}
                placeholder="e.g. AWS Certified Solutions Architect - Amazon; PMP by PMI"
                className="w-full h-24 p-3 rounded-xl border border-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
              <p className="text-xs text-purple-500">
                Paste certificates if Credly is unavailable. Separate entries with commas or new
                lines.
              </p>
            </div>
          </div>

          <TemplateSelector
            options={availableTemplateOptions}
            selectedTemplate={selectedTemplate}
            onSelect={handleTemplateSelect}
            disabled={isProcessing}
          />

          {queuedMessage && <p className="text-blue-700 text-center">{queuedMessage}</p>}
          {isProcessing && (
            <div className="flex justify-center">
              <div className="mt-4 h-10 w-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {error && <p className="text-red-600 text-center font-semibold">{error}</p>}
        </section>

        {scoreBreakdown.length > 0 && (
          <ATSScoreDashboard metrics={scoreBreakdown} match={match} />
        )}

        {showDeltaSummary && <DeltaSummaryPanel summary={deltaSummary} />}

        {selectionInsights && (
          <section className="space-y-4 rounded-3xl bg-white/85 border border-emerald-200/70 shadow-xl p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-emerald-600">
                  Selection Probability
                </p>
                <p className="mt-3 text-5xl font-black text-emerald-700">
                  {selectionInsights.probability ?? '—'}%
                </p>
                <p className="mt-2 text-sm text-emerald-700/90">
                  {selectionInsights.message ||
                    'Projected probability that this resume will be shortlisted for the JD.'}
                </p>
              </div>
              {selectionInsights.level && (
                <span className="self-start rounded-full bg-emerald-100 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700">
                  {selectionInsights.level} Outlook
                </span>
              )}
            </div>
            <p className="text-sm text-emerald-800/90">
              {selectionInsights.summary ||
                'Your chances of selection have increased. Prepare for the interview and learn these skills!'}
            </p>
            {jobFitScores.length > 0 && (
              <div className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.35em] text-emerald-600">
                    Job Fit Breakdown
                  </h3>
                  {typeof jobFitAverage === 'number' && (
                    <span className="inline-flex items-center justify-center rounded-full bg-emerald-500/10 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-widest text-emerald-700">
                      Avg {jobFitAverage}%
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {jobFitScores.map((metric) => {
                    const tone = jobFitToneStyles[metric.status] || jobFitToneStyles.default
                    const safeScore = typeof metric.score === 'number' ? metric.score : 0
                    return (
                      <div
                        key={metric.key}
                        className={`rounded-2xl border px-4 py-3 shadow-sm ${tone.container}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">{metric.label}</p>
                            {metric.status && (
                              <span
                                className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-widest ${tone.chip}`}
                              >
                                {formatStatusLabel(metric.status)}
                              </span>
                            )}
                          </div>
                          <span className={`text-lg font-bold ${tone.scoreText}`}>{safeScore}%</span>
                        </div>
                        <div className="mt-3 h-2 w-full rounded-full bg-white/60" role="img" aria-label={`${metric.label} score ${safeScore}%`}>
                          <div
                            className={`h-full rounded-full ${tone.bar}`}
                            style={{ width: `${Math.min(Math.max(safeScore, 0), 100)}%` }}
                            aria-hidden="true"
                          />
                        </div>
                        <p className="mt-2 text-xs leading-relaxed">{metric.message}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            {selectionInsights.flags?.length > 0 && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {selectionInsights.flags.map((flag) => {
                  const toneClass =
                    flag.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : flag.type === 'warning'
                        ? 'bg-amber-50 border-amber-200 text-amber-800'
                        : 'bg-sky-50 border-sky-200 text-sky-800'
                  return (
                    <div
                      key={`${flag.key}-${flag.title}`}
                      className={`rounded-2xl border px-4 py-3 shadow-sm ${toneClass}`}
                    >
                      <p className="text-sm font-semibold">{flag.title}</p>
                      <p className="mt-1 text-sm leading-relaxed">
                        {flag.detail || flag.message || ''}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {analysisHighlights.length > 0 && (
          <section className="space-y-4 rounded-3xl bg-white/85 border border-purple-200/70 shadow-xl p-6">
            <div>
              <h2 className="text-xl font-semibold text-purple-900">Match Checklist</h2>
              <p className="mt-1 text-sm text-purple-700/80">
                Review these alignment notes to close remaining gaps before submitting your application.
              </p>
            </div>
            <ul className="space-y-3">
              {analysisHighlights.map((item) => (
                <li
                  key={item.key}
                  className={`rounded-2xl border px-4 py-3 shadow-sm ${
                    highlightToneStyles[item.tone] || highlightToneStyles.info
                  }`}
                >
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 text-sm leading-relaxed">{item.message}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {match && (
          <section className="space-y-4">
            <div className="rounded-3xl bg-white/80 backdrop-blur border border-purple-200/70 shadow-xl p-6 space-y-4">
              <h3 className="text-xl font-semibold text-purple-900">Skill Coverage Snapshot</h3>
              <table className="w-full text-left text-sm text-purple-800">
                <thead>
                  <tr className="uppercase text-xs tracking-wide text-purple-500">
                    <th className="py-2">Skill</th>
                    <th className="py-2 text-right">Match</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const rows = [...(match.table || [])]
                    while (rows.length < 5) rows.push({ skill: '—', matched: false })
                    return rows.slice(0, 5).map((row, idx) => (
                      <tr key={`${row.skill}-${idx}`} className="border-t border-purple-100/60">
                        <td className="py-2">{row.skill}</td>
                        <td className="py-2 text-right font-semibold">
                          {row.matched ? '✓' : '✗'}
                        </td>
                      </tr>
                    ))
                  })()}
                </tbody>
              </table>
              <p className="text-purple-800 font-medium">
                {formatMatchMessage(match.originalScore, match.enhancedScore)}
              </p>
              <div className="text-sm text-purple-700 space-y-1">
                <p>
                  Added keywords: {match.addedSkills.length > 0 ? match.addedSkills.join(', ') : 'None'}
                </p>
                {match.missingSkills.length > 0 && (
                  <p>Still missing: {match.missingSkills.join(', ')}</p>
                )}
              </div>
            </div>
          </section>
        )}

        {certificateInsights && (
          <section className="space-y-3 rounded-3xl bg-white/80 border border-blue-200/70 shadow-xl p-6">
            <h2 className="text-xl font-semibold text-blue-900">Certificate Insights</h2>
            <p className="text-sm text-blue-800/90">
              We detected {certificateInsights.known?.length || 0} certificates across your resume,
              LinkedIn, and manual inputs.
            </p>
            {certificateInsights.manualEntryRequired && (
              <p className="text-sm text-rose-600 font-semibold">
                Credly requires authentication. Please paste key certifications manually above so we can
                include them.
              </p>
            )}
            {certificateInsights.suggestions?.length > 0 ? (
              <div className="text-sm text-blue-800/90 space-y-1">
                <p className="font-semibold">Recommended additions for this job:</p>
                <ul className="list-disc pl-5 space-y-1">
                  {certificateInsights.suggestions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-blue-700/80">No additional certifications recommended.</p>
            )}
          </section>
        )}

        {scoreDashboardReady && improvementActions.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-purple-900">Targeted Improvements</h2>
            <p className="text-sm text-purple-700/80">
              Launch AI-powered fixes for any category below. Each enhancement rewrites your resume snippets without adding
              unrealistic claims.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {improvementActions.map((action) => {
                const isActive = activeImprovement === action.key
                const buttonDisabled = isProcessing || improvementBusy || !improvementsUnlocked
                return (
                  <button
                    key={action.key}
                    type="button"
                    onClick={() => handleImprovementClick(action.key)}
                    disabled={buttonDisabled}
                    className={`rounded-2xl border border-purple-200 bg-white/80 p-4 text-left shadow-sm hover:shadow-lg transition ${
                      isActive
                        ? 'opacity-70 cursor-wait'
                        : buttonDisabled
                          ? 'opacity-60 cursor-not-allowed'
                          : 'hover:-translate-y-0.5'
                    }`}
                    aria-busy={isActive}
                    aria-disabled={buttonDisabled}
                    title={
                      !improvementsUnlocked && improvementUnlockMessage ? improvementUnlockMessage : undefined
                    }
                  >
                    <div className="flex items-center gap-4">
                      {action.icon && (
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-purple-50/90 p-2 ring-1 ring-purple-100">
                          <img src={action.icon} alt="" className="h-8 w-8" aria-hidden="true" />
                        </span>
                      )}
                      <div className="flex-1">
                        <p className="text-lg font-semibold text-purple-800">{action.label}</p>
                        <p className="text-sm text-purple-600">{action.helper}</p>
                      </div>
                      {isActive && (
                        <span className="h-6 w-6 shrink-0 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
            {improvementsUnlocked && improvementResults.length === 0 && (
              <div className="rounded-2xl border border-dashed border-purple-300 bg-white/70 p-4 text-sm text-purple-700">
                Review your ATS results, then pick an improvement above to see tailored rewrites before generating downloads.
              </div>
            )}
          </section>
        )}

        {!scoreDashboardReady && improvementActions.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-purple-900">Targeted Improvements</h2>
            <div className="rounded-2xl border border-dashed border-purple-300 bg-white/70 p-4 text-sm text-purple-700">
              Run the ATS scoring first to populate your dashboard. Once the metrics are ready, you can unlock focused
              improvement options tailored to the analysis.
            </div>
          </section>
        )}

        {improvementResults.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-purple-900">Suggested Edits</h2>
            <div className="rounded-2xl border border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 p-4 text-sm text-purple-700">
              These skills and highlights were added to match the JD. Please prepare for the interview accordingly.
            </div>
            {enhanceAllSummaryText && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-900">
                <p className="text-sm font-semibold text-emerald-700">Enhance All applied automatically</p>
                <p className="mt-1 leading-relaxed">
                  We rolled out every recommended fix in one pass. Combined updates — {enhanceAllSummaryText}
                </p>
              </div>
            )}
            <div className="space-y-4">
              {improvementResults.map((item) => (
                <ImprovementCard
                  key={item.id}
                  suggestion={item}
                  onAccept={() => handleAcceptImprovement(item.id)}
                  onReject={() => handleRejectImprovement(item.id)}
                  onPreview={() => handlePreviewImprovement(item)}
                />
              ))}
            </div>
          </section>
        )}

        {changeLog.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-purple-900">Change Log</h2>
                <p className="text-sm text-purple-700/80">
                  Track every accepted enhancement and why it strengthens your selection chances.
                </p>
              </div>
              <span className="text-xs font-semibold text-purple-600 bg-white/70 border border-purple-200 rounded-full px-3 py-1">
                {changeLog.length} update{changeLog.length === 1 ? '' : 's'}
              </span>
            </div>
            <ul className="space-y-3">
              {changeLog.map((entry) => {
                const historyEntry = resumeHistoryMap.get(entry.id)
                const reverted = Boolean(entry.reverted)
                const revertedAtLabel = (() => {
                  if (!reverted) return ''
                  const timestamp = entry.revertedAt ? new Date(entry.revertedAt) : null
                  if (!timestamp || Number.isNaN(timestamp.getTime())) {
                    return 'Reverted'
                  }
                  return `Reverted ${timestamp.toLocaleString()}`
                })()
                return (
                  <li
                    key={entry.id}
                    className="rounded-2xl border border-purple-200 bg-white/85 shadow-sm p-4 space-y-2"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-base font-semibold text-purple-900">{entry.title}</p>
                        <p className="text-sm text-purple-700/90 leading-relaxed">{entry.detail}</p>
                      </div>
                      <span
                        className={`text-xs font-semibold uppercase tracking-wide px-3 py-1 rounded-full ${
                          changeLabelStyles[entry.label] || changeLabelStyles.fixed
                        }`}
                      >
                        {CHANGE_TYPE_LABELS[entry.label] || CHANGE_TYPE_LABELS.fixed}
                      </span>
                    </div>
                    {historyEntry && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleDownloadPreviousVersion(entry.id)}
                          className="px-3 py-1.5 rounded-full border border-purple-200 text-xs font-semibold text-purple-700 hover:border-purple-300 hover:text-purple-900 transition"
                        >
                          Download previous version
                        </button>
                        {!reverted && (
                          <button
                            type="button"
                            onClick={() => handleRevertChange(entry.id)}
                            className="px-3 py-1.5 rounded-full border border-rose-200 text-xs font-semibold text-rose-600 hover:border-rose-300 hover:text-rose-700 transition"
                          >
                            Undo change
                          </button>
                        )}
                        {reverted && (
                          <span className="text-xs font-semibold text-rose-600">{revertedAtLabel}</span>
                        )}
                      </div>
                    )}
                    {(entry.before ||
                      entry.after ||
                      (entry.summarySegments && entry.summarySegments.length > 0) ||
                      (entry.addedItems && entry.addedItems.length > 0) ||
                      (entry.removedItems && entry.removedItems.length > 0) ||
                      (entry.itemizedChanges && entry.itemizedChanges.length > 0)) && (
                      <ChangeComparisonView
                        before={entry.before}
                        after={entry.after}
                        summarySegments={entry.summarySegments}
                        addedItems={entry.addedItems}
                        removedItems={entry.removedItems}
                        itemizedChanges={entry.itemizedChanges}
                      />
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {resumeComparisonData && (
          <section className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold text-purple-900">Original vs Enhanced CV</h2>
              <p className="text-sm text-purple-700/80">
                Review the baseline upload alongside the improved version. Highlights call out key additions and removals.
              </p>
            </div>
            <ChangeComparisonView
              before={resumeComparisonData.before}
              after={resumeComparisonData.after}
              beforeLabel="Original CV"
              afterLabel="Enhanced CV"
              summarySegments={resumeComparisonData.summarySegments}
              addedItems={resumeComparisonData.addedItems}
              removedItems={resumeComparisonData.removedItems}
              itemizedChanges={resumeComparisonData.itemizedChanges}
              className="text-purple-900"
            />
          </section>
        )}

        {resumeText && (
          <section className="space-y-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-purple-900">Original CV Preview</h2>
                <p className="text-xs font-medium text-purple-600">
                  This is the exact text parsed from your upload. Review it, then run ATS improvements only if needed.
                </p>
              </div>
              {initialAnalysisSnapshot && (
                <button
                  type="button"
                  onClick={handleResetToOriginal}
                  disabled={!resetAvailable}
                  className="inline-flex items-center justify-center rounded-full border border-purple-300 px-4 py-2 text-sm font-semibold text-purple-700 transition hover:border-purple-400 hover:text-purple-900 disabled:cursor-not-allowed disabled:opacity-60"
                  title={
                    resetAvailable
                      ? 'Restore the resume and dashboard scores from your original upload.'
                      : 'Original upload already in view.'
                  }
                >
                  Reset to original upload
                </button>
              )}
            </div>
            <textarea
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              className="w-full h-64 p-4 rounded-2xl border border-purple-200 bg-white/80 text-sm text-purple-900"
            />
            <p className="text-xs text-purple-600">
              Accepting improvements updates this preview so you can compare every change against the original upload.
            </p>
          </section>
        )}

        {outputFiles.length === 0 && improvementsUnlocked && !hasAcceptedImprovement && (
          <section className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold text-purple-900">Review Improvements First</h2>
              <p className="text-sm text-purple-700/80">
                Apply at least one AI-generated improvement to unlock the enhanced CV and cover letter downloads.
              </p>
            </div>
            <div className="rounded-2xl border border-dashed border-purple-300 bg-white/70 p-4 text-sm text-purple-700">
              Explore the targeted fixes above, accept the ones you like, and then return here to generate the upgraded documents.
            </div>
          </section>
        )}

        {outputFiles.length === 0 && improvementsUnlocked && hasAcceptedImprovement && (
          <section className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold text-purple-900">Generate Enhanced Documents</h2>
              <p className="text-sm text-purple-700/80">
                Apply the improvements you like, then create polished CV and cover letter downloads tailored to the JD.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              <button
                type="button"
                onClick={handleGenerateEnhancedDocs}
                disabled={isProcessing || improvementBusy || isGeneratingDocs}
                className="inline-flex items-center justify-center rounded-full bg-purple-600 px-5 py-3 text-sm font-semibold text-white shadow transition hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-purple-300"
              >
                {isGeneratingDocs ? 'Generating enhanced documents…' : 'Generate enhanced CV & cover letters'}
              </button>
            </div>
          </section>
        )}

        {outputFiles.length > 0 && (
          <section className="space-y-5">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold text-purple-900">Download Enhanced Documents</h2>
              <p className="text-sm text-purple-700/80">
                Download tailored cover letters plus your original and AI-enhanced CVs. Links remain active for 60 minutes.
              </p>
            </div>
            <div className="space-y-6">
              {downloadGroups.resume.length > 0 && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <h3 className="text-xl font-semibold text-purple-900">CV Files</h3>
                    <p className="text-sm text-purple-700/80">
                      Compare the uploaded CV with enhanced versions optimised for the job description.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {downloadGroups.resume.map((file) => renderDownloadCard(file))}
                  </div>
                </div>
              )}
              {downloadGroups.cover.length > 0 && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <h3 className="text-xl font-semibold text-purple-900">Cover Letters</h3>
                    <p className="text-sm text-purple-700/80">
                      Two tailored narratives to suit different recruiter preferences.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {downloadGroups.cover.map((file) => renderDownloadCard(file))}
                  </div>
                </div>
              )}
              {downloadGroups.other.length > 0 && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <h3 className="text-xl font-semibold text-purple-900">Additional Files</h3>
                    <p className="text-sm text-purple-700/80">Other generated documents are available below.</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {downloadGroups.other.map((file) => renderDownloadCard(file))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {previewFile && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4 py-6"
            role="dialog"
            aria-modal="true"
            aria-label={`Preview for ${previewFile.presentation?.label || 'generated file'}`}
            onClick={closeDownloadPreview}
          >
            <div
              className="w-full max-w-5xl rounded-3xl bg-white shadow-2xl border border-purple-200/70 overflow-hidden"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 border-b border-purple-100 bg-gradient-to-r from-purple-50 to-indigo-50 px-6 py-4">
                <div>
                  <h3 className="text-xl font-semibold text-purple-900">
                    {previewFile.presentation?.label || 'Generated document preview'}
                  </h3>
                  <p className="text-sm text-purple-700/90">
                    Review this PDF before downloading to confirm the enhancements look right.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeDownloadPreview}
                  className="text-sm font-semibold text-purple-700 hover:text-purple-900"
                >
                  Close
                </button>
              </div>
              <div className="bg-slate-50 px-6 py-6">
                <div className="h-[70vh] w-full overflow-hidden rounded-2xl border border-purple-100 bg-white shadow-inner">
                  <iframe
                    src={`${previewFile.url}#toolbar=0&navpanes=0`}
                    title={previewFile.presentation?.label || 'Document preview'}
                    className="h-full w-full"
                  />
                </div>
                <p className="mt-3 text-xs text-purple-600">
                  Trouble viewing? Download the PDF instead to open it in your preferred reader.
                </p>
              </div>
            </div>
          </div>
        )}

        {coverLetterEditor && (() => {
          const type = coverLetterEditor.type
          const draftText =
            coverLetterDrafts[type] ??
            (typeof coverLetterEditor.file?.text === 'string' ? coverLetterEditor.file.text : '')
          const originalText =
            coverLetterOriginals[type] ??
            (typeof coverLetterEditor.file?.text === 'string' ? coverLetterEditor.file.text : '')
          const hasChanges = draftText !== originalText
          const wordCount = draftText.trim()
            ? draftText
                .trim()
                .split(/\s+/)
                .filter(Boolean).length
            : 0
          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4 py-6"
              role="dialog"
              aria-modal="true"
              aria-label={`Edit ${coverLetterEditor.label || 'cover letter'}`}
              onClick={closeCoverLetterEditor}
            >
              <div
                className="w-full max-w-4xl rounded-3xl bg-white shadow-2xl border border-indigo-200/70 overflow-hidden"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4 border-b border-indigo-100 bg-gradient-to-r from-indigo-50 to-sky-50 px-6 py-4">
                  <div>
                    <h3 className="text-xl font-semibold text-indigo-900">
                      {coverLetterEditor.label || 'Cover letter'}
                    </h3>
                    <p className="mt-1 text-sm text-indigo-700/90">
                      Refine the draft text before downloading your personalised PDF.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeCoverLetterEditor}
                    className="text-sm font-semibold text-indigo-700 hover:text-indigo-900"
                  >
                    Close
                  </button>
                </div>
                <div className="px-6 py-6 space-y-4 text-indigo-900">
                  <textarea
                    value={draftText}
                    onChange={(event) => handleCoverLetterTextChange(type, event.target.value)}
                    rows={14}
                    className="w-full rounded-2xl border border-indigo-200 bg-white/90 px-4 py-3 text-sm leading-relaxed shadow-inner focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    placeholder="Introduce yourself, highlight the top accomplishments that match the JD, and close with a confident call to action."
                  />
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between text-sm">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-indigo-600/80">
                        {wordCount} word{wordCount === 1 ? '' : 's'}
                      </span>
                      {hasChanges ? (
                        <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
                          Edited
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Original draft
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => resetCoverLetterDraft(type)}
                        className="px-4 py-2 rounded-xl border border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                      >
                        Reset to original
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopyCoverLetter(type)}
                        className="px-4 py-2 rounded-xl border border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                      >
                        Copy to clipboard
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadEditedCoverLetter}
                        disabled={isCoverLetterDownloading}
                        className={`px-4 py-2 rounded-xl font-semibold text-white shadow ${
                          isCoverLetterDownloading
                            ? 'bg-indigo-300 cursor-wait'
                            : 'bg-indigo-600 hover:bg-indigo-700'
                        }`}
                      >
                        {isCoverLetterDownloading ? 'Preparing PDF…' : 'Download updated PDF'}
                      </button>
                    </div>
                  </div>
                  {coverLetterDownloadError && (
                    <p className="text-sm font-medium text-rose-600">
                      {coverLetterDownloadError}
                    </p>
                  )}
                  {coverLetterClipboardStatus && (
                    <p className="text-sm text-indigo-600/80">
                      {coverLetterClipboardStatus}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )
        })()}

        {previewSuggestion && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6"
            role="dialog"
            aria-modal="true"
            aria-label={`Preview for ${previewSuggestion.title}`}
            onClick={closePreview}
          >
            <div
              className="w-full max-w-5xl rounded-3xl bg-white shadow-2xl border border-purple-200/70 overflow-hidden"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 border-b border-purple-100 bg-gradient-to-r from-purple-50 to-indigo-50 px-6 py-4">
                <div>
                  <h3 className="text-xl font-semibold text-purple-900">{previewSuggestion.title}</h3>
                  <p className="text-sm text-purple-700/90">
                    Review how this change will look alongside your current resume before accepting or downloading.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closePreview}
                  className="text-sm font-semibold text-purple-700 hover:text-purple-900"
                >
                  Close
                </button>
              </div>
              <div className="px-6 py-6 text-sm text-purple-900">
                <ChangeComparisonView
                  before={previewSuggestion.baseResume}
                  after={previewSuggestion.updatedResume}
                  beforeLabel="Current Resume"
                  afterLabel="With Improvement"
                  summarySegments={previewSuggestion.summarySegments}
                  addedItems={previewSuggestion.addedItems}
                  removedItems={previewSuggestion.removedItems}
                  itemizedChanges={previewSuggestion.itemizedChanges}
                  variant="modal"
                  className="text-purple-900"
                />
              </div>
              {(previewSuggestion.beforeExcerpt || previewSuggestion.afterExcerpt) && (
                <div className="border-t border-purple-100 bg-slate-50 px-6 py-4 text-sm text-slate-700">
                  <p className="font-semibold text-slate-800">Focused change</p>
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {previewSuggestion.beforeExcerpt && (
                      <div className="rounded-xl border border-purple-100 bg-white p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-purple-500">Before snippet</p>
                        <p className="mt-1 whitespace-pre-wrap leading-snug">{previewSuggestion.beforeExcerpt}</p>
                      </div>
                    )}
                    {previewSuggestion.afterExcerpt && (
                      <div className="rounded-xl border border-indigo-100 bg-white p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">After snippet</p>
                        <p className="mt-1 whitespace-pre-wrap leading-snug">{previewSuggestion.afterExcerpt}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
