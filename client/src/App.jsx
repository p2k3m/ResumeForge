import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { formatMatchMessage } from './formatMatchMessage.js'
import { buildApiUrl, resolveApiBase } from './resolveApiBase.js'
import ATSScoreDashboard from './components/ATSScoreDashboard.jsx'
import InfoTooltip from './components/InfoTooltip.jsx'
import TemplateSelector from './components/TemplateSelector.jsx'
import DeltaSummaryPanel from './components/DeltaSummaryPanel.jsx'
import ProcessFlow from './components/ProcessFlow.jsx'
import ChangeComparisonView from './components/ChangeComparisonView.jsx'
import { deriveDeltaSummary } from './deriveDeltaSummary.js'

const CV_GENERATION_ERROR_MESSAGE =
  'Your new CV could not be generated. Please try again or contact support.'

const improvementActions = [
  {
    key: 'improve-summary',
    label: 'Improve Summary',
    helper: 'Refresh your summary to mirror the JD tone and keywords.'
  },
  {
    key: 'add-missing-skills',
    label: 'Add Missing Skills',
    helper: 'Blend missing keywords into the skills and experience sections.'
  },
  {
    key: 'change-designation',
    label: 'Change Designation',
    helper: 'Align your visible job title with the target role.'
  },
  {
    key: 'align-experience',
    label: 'Align Experience',
    helper: 'Emphasise accomplishments that mirror the job requirements.'
  },
  {
    key: 'enhance-all',
    label: 'Enhance All',
    helper: 'Apply every improvement in one pass for a best-fit CV.'
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

const templateOptions = [
  {
    id: 'modern',
    name: 'Modern Minimal',
    description: 'Two-column balance, subtle dividers, ATS-safe typography.'
  },
  {
    id: 'professional',
    name: 'Professional Blue',
    description: 'Classic layout with blue accents and bullet precision.'
  },
  {
    id: 'vibrant',
    name: 'Vibrant Gradient',
    description: 'Bold gradients with strong section separation.'
  },
  {
    id: '2025',
    name: '2025 Vision',
    description: 'Latest Inter font styling with responsive grid sections.'
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

function getDownloadPresentation(file = {}) {
  const type = file?.type || ''
  switch (type) {
    case 'original_upload':
      return {
        label: 'Original CV Upload',
        description: 'Exact resume you submitted before any AI enhancements—keep this for applications that prefer the untouched version.',
        badgeText: 'Original',
        badgeStyle: 'bg-slate-100 text-slate-700 border-slate-200',
        buttonStyle: 'bg-slate-700 hover:bg-slate-800 focus:ring-slate-500',
        cardAccent: 'bg-gradient-to-br from-slate-50 via-white to-white',
        cardBorder: 'border-slate-200',
        linkLabel: 'Download original file',
        category: 'resume'
      }
    case 'version1':
      return {
        label: 'Enhanced CV Version 1',
        description: 'Primary rewrite balanced for ATS scoring and recruiter readability with the strongest keyword alignment.',
        badgeText: 'Enhanced',
        badgeStyle: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        buttonStyle: 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500',
        cardAccent: 'bg-gradient-to-br from-emerald-50 via-white to-white',
        cardBorder: 'border-emerald-200',
        linkLabel: 'Download PDF',
        category: 'resume'
      }
    case 'version2':
      return {
        label: 'Enhanced CV Version 2',
        description: 'Alternate layout that spotlights impact metrics and leadership achievements for different screening preferences.',
        badgeText: 'Enhanced Alt',
        badgeStyle: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        buttonStyle: 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500',
        cardAccent: 'bg-gradient-to-br from-emerald-50 via-white to-white',
        cardBorder: 'border-emerald-200',
        linkLabel: 'Download PDF',
        category: 'resume'
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
        category: 'cover'
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
        category: 'cover'
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
        category: 'other'
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
    if (type === 'add-missing-skills' || type === 'align-experience') return 'added'
    if (type === 'enhance-all') return 'fixed'
  }

  const fallback =
    type === 'improve-summary'
      ? 'rephrased'
      : type === 'change-designation'
        ? 'fixed'
        : type === 'add-missing-skills' || type === 'align-experience'
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
    'change-designation':
      'Aligned the visible designation with the target role title.',
    'align-experience':
      'Expanded experience bullets to reflect the selection criteria.',
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
    'change-designation': 'Selection focus: resolves designation mismatch flagged in ATS scans.',
    'align-experience': 'Selection focus: evidences accomplishments tied to job metrics.',
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

  return {
    id: suggestion?.id,
    label,
    title: suggestion?.title || 'Improvement Applied',
    detail: detailText.trim(),
    before: (suggestion?.beforeExcerpt || '').trim(),
    after: (suggestion?.afterExcerpt || '').trim(),
    timestamp: Date.now(),
    type: suggestion?.type || 'custom',
    summarySegments,
    addedItems,
    removedItems,
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
  const acceptDisabled = Boolean(suggestion.rescorePending)
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
          Accept
        </button>
      </div>
    </div>
  )
}

function App() {
  const [profileUrl, setProfileUrl] = useState('')
  const [jobUrl, setJobUrl] = useState('')
  const [credlyUrl, setCredlyUrl] = useState('')
  const [manualJobDescription, setManualJobDescription] = useState('')
  const [manualJobDescriptionRequired, setManualJobDescriptionRequired] = useState(false)
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
  const [initialAnalysisSnapshot, setInitialAnalysisSnapshot] = useState(null)
  const [jobId, setJobId] = useState('')
  const [templateContext, setTemplateContext] = useState(null)
  const [isGeneratingDocs, setIsGeneratingDocs] = useState(false)
  const improvementLockRef = useRef(false)

  const hasMatch = Boolean(match)
  const hasCvFile = Boolean(cvFile)
  const improvementCount = improvementResults.length
  const downloadCount = outputFiles.length
  const changeCount = changeLog.length
  const scoreMetricCount = scoreBreakdown.length
  const queuedText = typeof queuedMessage === 'string' ? queuedMessage.trim() : ''
  const hasAnalysisData =
    scoreMetricCount > 0 || hasMatch || improvementCount > 0 || downloadCount > 0 || changeCount > 0
  const uploadComplete =
    (hasCvFile && (isProcessing || Boolean(queuedText))) || hasAnalysisData || Boolean(queuedText)
  const scoreComplete = scoreMetricCount > 0
  const jdValidationComplete = Boolean(jobDescriptionText && jobDescriptionText.trim()) && !manualJobDescriptionRequired
  const improvementsUnlocked = uploadComplete && scoreComplete && jdValidationComplete
  const improvementUnlockMessage = !uploadComplete
    ? 'Upload your resume and job description to unlock improvements.'
    : !scoreComplete
      ? 'Wait for the ATS scoring to finish before generating improvements.'
      : !jdValidationComplete
        ? 'Job description validation is still in progress. Please wait until it completes.'
        : ''
  const improvementBusy = Boolean(activeImprovement)
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
          <a
            href={file.url}
            className={buttonClass}
            target="_blank"
            rel="noopener noreferrer"
          >
            {presentation.linkLabel || 'Download'}
          </a>
        </div>
      </div>
    )
  }, [])

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
        setOutputFiles(Array.isArray(payload.urls) ? payload.urls : [])
        setMatch(payload.match || null)
      } else if (data.type === 'OFFLINE_UPLOAD_FAILED') {
        setQueuedMessage('')
        setIsProcessing(false)
        const payloadError = data?.payload?.error
        if (
          payloadError?.details?.manualInputRequired ||
          payloadError?.code === 'JOB_DESCRIPTION_FETCH_FAILED' ||
          (typeof data?.message === 'string' && /unable to fetch jd/i.test(data.message))
        ) {
          setManualJobDescriptionRequired(true)
        }
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
  }

  const handleSubmit = async () => {
    if (!cvFile) {
      setError('Please upload a CV before submitting.')
      return
    }
    if (manualJobDescriptionRequired && !manualJobDescription.trim()) {
      setError('Please paste the full job description before continuing.')
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
      formData.append('jobDescriptionUrl', jobUrl)
      if (manualJobDescription.trim()) {
        formData.append('manualJobDescription', manualJobDescription.trim())
      }
      if (credlyUrl) formData.append('credlyProfileUrl', credlyUrl)
      if (manualCertificatesInput.trim()) {
        formData.append('manualCertificates', manualCertificatesInput.trim())
      }
      if (selectedTemplate) {
        formData.append('template', selectedTemplate)
      }

      const requestUrl = buildApiUrl(API_BASE_URL, '/api/process-cv')

      const response = await fetch(requestUrl, {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        let message = response.status >= 500 ? CV_GENERATION_ERROR_MESSAGE : 'Request failed'
        let manualFallbackTriggered = false
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
          if (data?.error?.details?.manualInputRequired) {
            manualFallbackTriggered = true
          }
        } catch {
          try {
            const text = await response.text()
            if (text) message = text
          } catch {}
        }
        if (manualFallbackTriggered) {
          setManualJobDescriptionRequired(true)
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
      const jobIdValue = typeof data.jobId === 'string' ? data.jobId : ''
      setJobId(jobIdValue)
      const templateContextValue =
        data && typeof data.templateContext === 'object' ? data.templateContext : null
      setTemplateContext(templateContextValue)
      setManualJobDescriptionRequired(false)
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
        selectionProbabilityRationale: probabilityRationale
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
      setResumeText(resumeTextValue)
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

      setInitialAnalysisSnapshot({
        resumeText: resumeTextValue,
        originalResumeText: originalResumeSnapshot,
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
        templateContext: cloneData(templateContextValue)
      })
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

  const resetAvailable =
    Boolean(initialAnalysisSnapshot) &&
    ((initialAnalysisSnapshot?.resumeText ?? '') !== resumeText ||
      changeLog.length > 0 ||
      hasAcceptedImprovements)

  const handleResetToOriginal = useCallback(() => {
    if (!initialAnalysisSnapshot) return

    const snapshot = initialAnalysisSnapshot
    const resumeValue = typeof snapshot.resumeText === 'string' ? snapshot.resumeText : ''
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

    const templateContextValue =
      snapshot.templateContext && typeof snapshot.templateContext === 'object'
        ? cloneData(snapshot.templateContext)
        : null
    setTemplateContext(templateContextValue)

    setChangeLog([])
    setImprovementResults((prev) =>
      prev.map((item) => ({
        ...item,
        accepted: null,
        rescorePending: false,
        rescoreError: '',
        scoreDelta: null
      }))
    )
    setError('')
    setPreviewSuggestion(null)
  }, [initialAnalysisSnapshot])

  const improvementAvailable =
    improvementsUnlocked && Boolean(resumeText && resumeText.trim()) && Boolean(jobDescriptionText && jobDescriptionText.trim())
  const hasAcceptedImprovement = useMemo(
    () => improvementResults.some((item) => item.accepted === true),
    [improvementResults]
  )
  const manualJobDescriptionActive =
    manualJobDescriptionRequired || manualJobDescription.trim().length > 0

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

  const showDeltaSummary = Boolean(
    match ||
      (certificateInsights &&
        ((certificateInsights.known && certificateInsights.known.length > 0) ||
          (certificateInsights.suggestions && certificateInsights.suggestions.length > 0) ||
          certificateInsights.manualEntryRequired)) ||
      manualCertificatesData.length > 0 ||
      changeLog.length > 0
  )

  const handleImprovementClick = async (type) => {
    if (improvementLockRef.current) {
      setError('Please wait for the current improvement to finish before requesting another one.')
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
      let explanation = (data.explanation || 'Change generated successfully.').trim()
      if (!explanation) {
        explanation = 'Change generated successfully.'
      }
      if (type === 'enhance-all' && improvementSummary.length) {
        const combinedSummary = formatEnhanceAllSummary(improvementSummary)
        if (combinedSummary) {
          const meaningfulBase =
            explanation && !/^applied deterministic improvements/i.test(explanation)
          explanation = meaningfulBase
            ? `${explanation} ${combinedSummary}`
            : combinedSummary
        }
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
    } catch (err) {
      console.error('Improvement request failed', err)
      const errorMessage =
        (typeof err?.message === 'string' && err.message.trim()) ||
        CV_GENERATION_ERROR_MESSAGE
      setError(errorMessage)
    } finally {
      setActiveImprovement('')
      improvementLockRef.current = false
    }
  }

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
        linkedinProfileUrl: profileUrl,
        credlyProfileUrl: credlyUrl,
        manualCertificates: manualCertificatesData,
        templateContext: templateContext || { template1: selectedTemplate },
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
      if (typeof data.jobId === 'string' && data.jobId.trim()) {
        setJobId(data.jobId.trim())
      }
      const templateContextValue =
        data && typeof data.templateContext === 'object' ? data.templateContext : null
      setTemplateContext(templateContextValue)

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

  const handleAcceptImprovement = async (id) => {
    const suggestion = improvementResults.find((item) => item.id === id)
    if (!suggestion) {
      return
    }

    const updatedResumeDraft = suggestion.updatedResume || resumeText
    const baselineScore = Number.isFinite(match?.enhancedScore)
      ? match.enhancedScore
      : Number.isFinite(match?.originalScore)
        ? match.originalScore
        : null
    const previousMissingSkills = Array.isArray(match?.missingSkills) ? match.missingSkills : []
    const changeLogEntry = buildChangeLogEntry(suggestion)

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

    if (changeLogEntry) {
      setChangeLog((prev) => {
        if (prev.some((entry) => entry.id === changeLogEntry.id)) {
          return prev.map((entry) =>
            entry.id === changeLogEntry.id ? { ...entry, ...changeLogEntry } : entry
          )
        }
        return [changeLogEntry, ...prev]
      })
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
  }

  const handleRejectImprovement = (id) => {
    setImprovementResults((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, accepted: false, rescorePending: false, rescoreError: '' }
          : item
      )
    )
    setChangeLog((prev) => prev.filter((entry) => entry.id !== id))
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
        removedItems: previewEntry?.removedItems || []
      })
    },
    [resumeText]
  )

  const closePreview = useCallback(() => {
    setPreviewSuggestion(null)
  }, [])

  const disabled = !profileUrl || !jobUrl || !cvFile || isProcessing

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
              placeholder="Job Description URL"
              value={jobUrl}
              onChange={(e) => setJobUrl(e.target.value)}
              className="w-full p-3 rounded-xl border border-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
            {manualJobDescriptionActive && (
              <div className="md:col-span-2 space-y-2">
                <label className="text-sm font-semibold text-purple-700" htmlFor="manual-job-description">
                  Paste Full Job Description
                </label>
                <textarea
                  id="manual-job-description"
                  value={manualJobDescription}
                  onChange={(e) => setManualJobDescription(e.target.value)}
                  placeholder="Paste the entire job post when automatic fetching is blocked."
                  className="w-full h-32 p-3 rounded-xl border border-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
                {manualJobDescriptionRequired ? (
                  <p className="text-xs font-semibold text-rose-600">
                    Unable to fetch JD from this URL. Please paste full job description below.
                  </p>
                ) : (
                  <p className="text-xs text-purple-500">
                    We&apos;ll analyse this text directly instead of scraping the URL.
                  </p>
                )}
              </div>
            )}
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
            options={templateOptions}
            selectedTemplate={selectedTemplate}
            onSelect={setSelectedTemplate}
            disabled={isProcessing}
          />

          <button
            onClick={handleSubmit}
            disabled={disabled}
            className={`w-full md:w-auto px-6 py-3 rounded-full text-white font-semibold shadow-lg transition ${
              disabled
                ? 'bg-purple-300 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700'
            }`}
          >
            {isProcessing ? 'Processing…' : 'Enhance CV Now'}
          </button>

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

        {improvementActions.length > 0 && (
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
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-lg font-semibold text-purple-800">{action.label}</p>
                        <p className="text-sm text-purple-600">{action.helper}</p>
                      </div>
                      {isActive && (
                        <span className="h-6 w-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
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

        {improvementResults.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-purple-900">Suggested Edits</h2>
            <div className="rounded-2xl border border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 p-4 text-sm text-purple-700">
              These skills and highlights were added to match the JD. Please prepare for the interview accordingly.
            </div>
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
              {changeLog.map((entry) => (
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
                  {(entry.before ||
                    entry.after ||
                    (entry.summarySegments && entry.summarySegments.length > 0) ||
                    (entry.addedItems && entry.addedItems.length > 0) ||
                    (entry.removedItems && entry.removedItems.length > 0)) && (
                    <ChangeComparisonView
                      before={entry.before}
                      after={entry.after}
                      summarySegments={entry.summarySegments}
                      addedItems={entry.addedItems}
                      removedItems={entry.removedItems}
                    />
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {resumeText && (
          <section className="space-y-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <h2 className="text-xl font-semibold text-purple-900">Latest Resume Preview</h2>
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
              This preview updates whenever you accept an improvement. You can copy, edit, or export it
              as needed.
            </p>
          </section>
        )}

        {outputFiles.length === 0 && improvementsUnlocked && (
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
                disabled={
                  isProcessing ||
                  improvementBusy ||
                  isGeneratingDocs ||
                  !hasAcceptedImprovement
                }
                className="inline-flex items-center justify-center rounded-full bg-purple-600 px-5 py-3 text-sm font-semibold text-white shadow transition hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-purple-300"
              >
                {isGeneratingDocs ? 'Generating enhanced documents…' : 'Generate enhanced CV & cover letters'}
              </button>
              {!hasAcceptedImprovement && (
                <p className="text-sm text-purple-600">
                  Accept at least one improvement to activate the enhanced downloads.
                </p>
              )}
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
