import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { formatMatchMessage } from './formatMatchMessage.js'
import { buildApiUrl, resolveApiBase } from './resolveApiBase.js'
import ATSScoreDashboard from './components/ATSScoreDashboard.jsx'
import InfoTooltip from './components/InfoTooltip.jsx'
import TemplatePicker from './components/TemplatePicker.jsx'
import DeltaSummaryPanel from './components/DeltaSummaryPanel.jsx'
import ProcessFlow from './components/ProcessFlow.jsx'
import ChangeComparisonView from './components/ChangeComparisonView.jsx'
import DashboardStage from './components/DashboardStage.jsx'
import JobDescriptionPreview from './components/JobDescriptionPreview.jsx'
import ChangeLogSummaryPanel from './components/ChangeLogSummaryPanel.jsx'
import CoverLetterEditorModal from './components/CoverLetterEditorModal.jsx'
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
import { normalizeOutputFiles } from './utils/normalizeOutputFiles.js'
import { normalizePdfBlob } from './utils/assetValidation.js'
import { buildImprovementHintFromSegment } from './utils/actionableAdvice.js'
import parseJobDescriptionText from './utils/parseJobDescriptionText.js'
import { buildCategoryChangeLog } from './utils/changeLogCategorySummaries.js'
import { buildAggregatedChangeLogSummary } from './utils/changeLogSummaryShared.js'
import { extractErrorMetadata } from './utils/extractErrorMetadata.js'
import { BASE_TEMPLATE_OPTIONS, canonicalizeTemplateId } from './templateRegistry.js'
import { BUILD_VERSION } from './buildInfo.js'
import {
  CV_GENERATION_ERROR_MESSAGE,
  DOWNLOAD_SESSION_EXPIRED_MESSAGE
} from './shared/serviceErrorContracts.js'
import {
  FRIENDLY_ERROR_MESSAGES,
  SERVICE_ERROR_SOURCE_BY_CODE,
  SERVICE_ERROR_STEP_BY_CODE,
  SERVICE_ERROR_STEP_BY_SOURCE,
  deriveServiceContextFromError,
  extractServerMessages,
  isRetryableErrorCode,
  isRetryableServiceSource,
  normalizeServiceSource,
  resolveApiError
} from './shared/apiErrorHandling.js'

export { BASE_TEMPLATE_OPTIONS, canonicalizeTemplateId } from './templateRegistry.js'
export { SUPPORTED_RESUME_TEMPLATE_IDS } from './templateRegistry.js'

const TEMPLATE_DISPLAY_NAME_MAP = new Map(
  BASE_TEMPLATE_OPTIONS.map((option) => [option.id, option.name])
)

const SCORE_UPDATE_IN_PROGRESS_MESSAGE =
  'Please wait for the current ATS score refresh to finish before applying another improvement.'

const POST_DOWNLOAD_INVITE_MESSAGE =
  'Download complete! Upload another resume or job description, or try a different template to compare results.'

const FLOW_STAGE_KEYS = Object.freeze(['upload', 'score', 'enhance', 'generate', 'download'])

function createStageErrorState() {
  return FLOW_STAGE_KEYS.reduce((acc, key) => {
    acc[key] = ''
    return acc
  }, {})
}

function normalizeStageKey(stage) {
  if (typeof stage !== 'string') {
    return ''
  }
  const normalized = stage.trim().toLowerCase()
  return FLOW_STAGE_KEYS.includes(normalized) ? normalized : ''
}

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

const IMPROVE_ALL_BATCH_KEYS = improvementActions
  .map((action) => action.key)
  .filter((key) => key && key !== 'enhance-all')

const METRIC_IMPROVEMENT_PRESETS = [
  {
    category: 'Layout & Searchability',
    actionKey: 'enhance-all',
    label: 'Improve ATS Layout',
    helper: 'Streamline structure and sections so ATS bots read your resume without errors.'
  },
  {
    category: 'Readability',
    actionKey: 'enhance-all',
    label: 'Boost Readability',
    helper: 'Tighten headings and formatting so automated scanners instantly grasp your experience.'
  },
  {
    category: 'Impact',
    actionKey: 'align-experience',
    label: 'Improve Experience Impact',
    helper: 'Refocus accomplishments on the achievements this JD values most.'
  },
  {
    category: 'Crispness',
    actionKey: 'improve-summary',
    label: 'Improve Summary Tone',
    helper: 'Sharpen your intro so recruiters see a confident, concise story.'
  },
  {
    category: 'Other',
    actionKey: 'improve-highlights',
    label: 'Improve Highlights',
    helper: 'Polish standout wins so they pop during quick ATS and recruiter scans.'
  }
]

function buildActionDecorator(actionBuilder) {
  return (value) => {
    const text = typeof value === 'string' ? value.trim() : String(value || '').trim()
    if (!text) return ''
    const action = typeof actionBuilder === 'function' ? actionBuilder(text) : ''
    const actionText = typeof action === 'string' ? action.trim() : ''
    return actionText ? `${text} (${actionText})` : text
  }
}

function summariseItems(items, { limit = 5, decorate } = {}) {
  const list = Array.isArray(items)
    ? items
      .map((item) => (typeof item === 'string' ? item.trim() : String(item || '').trim()))
      .filter(Boolean)
    : []
  if (!list.length) return ''
  const unique = Array.from(new Set(list))
  const decorated =
    typeof decorate === 'function'
      ? unique
        .map((value) => decorate(value))
        .map((value) => (typeof value === 'string' ? value.trim() : String(value || '').trim()))
        .filter(Boolean)
      : unique
  if (!decorated.length) return ''
  if (decorated.length <= limit) {
    return decorated.join(', ')
  }
  const shown = decorated.slice(0, limit).join(', ')
  const remaining = decorated.length - limit
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

function normalizeImprovementValidation(validation) {
  if (!validation || typeof validation !== 'object') {
    return { jobAlignment: { status: 'unknown', matchedSkills: [], coveredSkills: [], reason: '' } }
  }

  const jobAlignmentSource =
    validation.jobAlignment && typeof validation.jobAlignment === 'object'
      ? validation.jobAlignment
      : {}

  const allowedStatuses = ['passed', 'failed', 'skipped', 'unknown']
  const statusInput = typeof jobAlignmentSource.status === 'string' ? jobAlignmentSource.status.trim().toLowerCase() : 'unknown'
  const status = allowedStatuses.includes(statusInput) ? statusInput : 'unknown'

  const matchedSkills = toUniqueList(jobAlignmentSource.matchedSkills)
  const coveredSkills = toUniqueList(jobAlignmentSource.coveredSkills)
  const beforeMissingSkills = toUniqueList(jobAlignmentSource.beforeMissingSkills)
  const afterMissingSkills = toUniqueList(jobAlignmentSource.afterMissingSkills)
  const reason = typeof jobAlignmentSource.reason === 'string' ? jobAlignmentSource.reason.trim() : ''
  const jobTitleMatched = jobAlignmentSource.jobTitleMatched === true
  const scoreDelta =
    typeof jobAlignmentSource.scoreDelta === 'number' && Number.isFinite(jobAlignmentSource.scoreDelta)
      ? jobAlignmentSource.scoreDelta
      : null
  const overallScoreDelta =
    typeof jobAlignmentSource.overallScoreDelta === 'number' &&
      Number.isFinite(jobAlignmentSource.overallScoreDelta)
      ? jobAlignmentSource.overallScoreDelta
      : null

  return {
    jobAlignment: {
      status,
      reason,
      matchedSkills,
      coveredSkills,
      beforeMissingSkills,
      afterMissingSkills,
      jobTitleMatched,
      scoreDelta,
      overallScoreDelta
    }
  }
}

function resolveImprovementValidationStatus(validation) {
  const status = validation?.jobAlignment?.status
  if (typeof status === 'string') {
    const normalized = status.trim().toLowerCase()
    if (['passed', 'failed', 'skipped', 'unknown'].includes(normalized)) {
      return normalized
    }
  }
  return 'unknown'
}

function improvementValidationPassed(validation) {
  const status = resolveImprovementValidationStatus(validation)
  return status === 'passed' || status === 'skipped'
}

function formatReadableList(items) {
  const list = toUniqueList(Array.isArray(items) ? items : [items])
  if (!list.length) return ''
  if (list.length === 1) return list[0]
  if (list.length === 2) return `${list[0]} and ${list[1]}`
  return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`
}

function normalizeSegmentText(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length ? trimmed : ''
  }
  if (value === null || value === undefined) {
    return ''
  }
  return String(value || '').trim()
}

function normalizeSegmentList(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeSegmentText(entry)).filter(Boolean)
  }
  const text = normalizeSegmentText(value)
  return text ? [text] : []
}

function formatCertificateDisplay(value) {
  if (!value && value !== 0) {
    return ''
  }
  if (typeof value === 'string') {
    return normalizeSegmentText(value)
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  if (typeof value === 'object') {
    const name = normalizeSegmentText(value.name || value.title)
    const provider = normalizeSegmentText(
      value.provider || value.issuer || value.organization || value.organisation
    )
    const combined = [name, provider].filter(Boolean).join(' — ')
    return combined || name || provider
  }
  return ''
}

function buildSummarySegmentSignature(segments) {
  if (!Array.isArray(segments) || segments.length === 0) {
    return ''
  }

  const normalized = segments.map((segment) => ({
    section: normalizeSegmentText(segment?.section || segment?.label || segment?.key),
    added: normalizeSegmentList(segment?.added),
    removed: normalizeSegmentList(segment?.removed),
    reason: normalizeSegmentList(segment?.reason)
  }))

  return JSON.stringify(normalized)
}

const COVER_LETTER_TYPES = new Set(['cover_letter1', 'cover_letter2'])

function isCoverLetterType(type) {
  return COVER_LETTER_TYPES.has(type)
}

function extractCoverLetterRawText(input) {
  if (!input) return ''
  if (typeof input === 'string') return input
  if (typeof input === 'object') {
    if (typeof input.raw === 'string') return input.raw
    if (Array.isArray(input.paragraphs) && input.paragraphs.length) {
      return input.paragraphs.join('\n\n')
    }
  }
  return ''
}

function getCoverLetterTextFromFile(file) {
  if (!file || typeof file !== 'object') return ''
  return extractCoverLetterRawText(file.text)
}

function resolveCoverLetterDraftText(drafts, originals, type, file) {
  if (!isCoverLetterType(type)) return ''

  if (drafts && Object.prototype.hasOwnProperty.call(drafts, type)) {
    const draftValue = drafts[type]
    return typeof draftValue === 'string' ? draftValue : ''
  }

  const originalValue =
    originals && typeof originals[type] === 'string' ? originals[type] : ''
  if (originalValue) {
    return originalValue
  }

  return getCoverLetterTextFromFile(file)
}

function getBaselineScoreFromMatch(matchData) {
  if (!matchData || typeof matchData !== 'object') return null
  const { atsScoreAfter, enhancedScore, atsScoreBefore, originalScore } = matchData
  if (Number.isFinite(atsScoreAfter)) return atsScoreAfter
  if (Number.isFinite(enhancedScore)) return enhancedScore
  if (Number.isFinite(atsScoreBefore)) return atsScoreBefore
  if (Number.isFinite(originalScore)) return originalScore
  return null
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
    const text = getCoverLetterTextFromFile(file)
    drafts[type] = text
    originals[type] = text
  })
  return { drafts, originals }
}

function getDownloadStateKey(file = {}) {
  const type = typeof file.type === 'string' ? file.type.trim() : ''
  if (type) return type
  const url = typeof file.url === 'string' ? file.url.trim() : ''
  return url
}

function extractFileNameFromDisposition(header) {
  if (!header || typeof header !== 'string') return ''
  const utf8Match = header.match(/filename\*=(?:UTF-8'')?([^;]+)/i)
  if (utf8Match && utf8Match[1]) {
    const rawValue = utf8Match[1].trim().replace(/^['"]|['"]$/g, '')
    try {
      const decoded = decodeURIComponent(rawValue)
      if (decoded) return decoded
    } catch (err) {
      return rawValue
    }
    return rawValue
  }
  const asciiMatch = header.match(/filename="?([^";]+)"?/i)
  if (asciiMatch && asciiMatch[1]) {
    return asciiMatch[1].trim()
  }
  return ''
}

function extractFileNameFromUrl(downloadUrl) {
  if (!downloadUrl || typeof downloadUrl !== 'string') return ''
  try {
    const parsed = new URL(downloadUrl)
    const pathname = parsed.pathname || ''
    const segments = pathname.split('/')
    while (segments.length && !segments[segments.length - 1]) {
      segments.pop()
    }
    const candidate = segments.pop() || ''
    return candidate ? decodeURIComponent(candidate) : ''
  } catch (err) {
    const sanitized = downloadUrl.split('?')[0]
    const parts = sanitized.split('/')
    const candidate = parts.pop() || parts.pop() || ''
    return candidate || ''
  }
}

function extractFileExtension(source) {
  if (!source || typeof source !== 'string') {
    return ''
  }
  const sanitized = source.trim()
  if (!sanitized) {
    return ''
  }
  const withoutQuery = sanitized.split('?')[0]
  const withoutHash = withoutQuery.split('#')[0]
  const lastDot = withoutHash.lastIndexOf('.')
  if (lastDot === -1 || lastDot === withoutHash.length - 1) {
    return ''
  }
  return withoutHash.slice(lastDot).toLowerCase()
}

function isSameOriginUrl(downloadUrl) {
  if (!downloadUrl || typeof downloadUrl !== 'string') return false
  try {
    const parsed = new URL(downloadUrl, typeof window !== 'undefined' ? window.location.href : undefined)
    if (typeof window === 'undefined' || !window?.location) {
      return false
    }
    return parsed.origin === window.location.origin
  } catch (err) {
    return false
  }
}

function openUrlInNewTab(downloadUrl) {
  if (!downloadUrl || typeof downloadUrl !== 'string') return false
  try {
    const link = document.createElement('a')
    link.href = downloadUrl
    link.rel = 'noopener noreferrer'
    link.target = '_blank'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    return true
  } catch (err) {
    try {
      window.open(downloadUrl, '_blank', 'noopener,noreferrer')
      return true
    } catch (openErr) {
      console.warn('Failed to open download URL in a new tab', openErr)
      return false
    }
  }
}

function sanitizeFileNameSegment(segment) {
  if (!segment || typeof segment !== 'string') {
    return 'document'
  }
  const normalized = segment
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || 'document'
}

function formatDownloadTimestampLabel(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function normalizeIsoTimestamp(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString()
}

function extractSessionLabelFromStorageKey(storageKey) {
  if (!storageKey || typeof storageKey !== 'string') {
    return ''
  }
  const segments = storageKey.split('/').filter(Boolean)
  if (segments.length < 3) {
    return ''
  }
  const sessionSegments = segments.slice(2)
  const explicitSession = sessionSegments.find((segment) =>
    /^session[-_]/i.test(segment)
  )
  if (explicitSession) {
    return explicitSession
  }
  const [firstSegment = '', secondSegment = ''] = sessionSegments
  const dateMatch = firstSegment.match(/^([0-9]{4})([0-9]{2})([0-9]{2})$/)
  if (dateMatch) {
    const formattedDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
    return secondSegment ? `${formattedDate}/${secondSegment}` : formattedDate
  }
  if (secondSegment) {
    return `${firstSegment}/${secondSegment}`
  }
  return firstSegment
}

function buildTimestampSlug(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value) => String(value).padStart(2, '0')
  const year = date.getFullYear()
  const month = pad(date.getMonth() + 1)
  const day = pad(date.getDate())
  const hours = pad(date.getHours())
  const minutes = pad(date.getMinutes())
  return `${year}${month}${day}-${hours}${minutes}`
}

function deriveDownloadFileName(file, presentation = {}, response, options = {}) {
  const disposition = response?.headers?.get?.('content-disposition') || ''
  const dispositionName = extractFileNameFromDisposition(disposition)
  if (dispositionName) {
    return dispositionName
  }

  const urlName = extractFileNameFromUrl(file?.url)
  if (urlName) {
    return urlName
  }

  const baseSource =
    (typeof file?.fileName === 'string' && file.fileName.trim()) ||
    (typeof presentation?.label === 'string' && presentation.label.trim()) ||
    (typeof file?.type === 'string' && file.type.trim()) ||
    'document'
  const base = sanitizeFileNameSegment(baseSource)

  const templateSegmentRaw =
    (typeof options?.templateName === 'string' && options.templateName.trim()) ||
    (typeof options?.templateId === 'string' && options.templateId.trim()) ||
    ''
  const templateSegment = templateSegmentRaw ? sanitizeFileNameSegment(templateSegmentRaw) : ''

  const timestampInput = options?.timestamp || options?.generatedAt || Date.now()
  const timestampSegment = buildTimestampSlug(timestampInput)

  const versionSegmentRaw =
    (typeof options?.versionId === 'string' && options.versionId.trim()) ||
    (typeof file?.versionId === 'string' && file.versionId.trim()) ||
    ''
  const versionSegment = versionSegmentRaw
    ? sanitizeFileNameSegment(versionSegmentRaw).slice(0, 40)
    : ''
  const hashSegmentRaw =
    (typeof options?.versionHash === 'string' && options.versionHash.trim()) ||
    (typeof file?.versionHash === 'string' && file.versionHash.trim()) ||
    ''
  const hashSegment =
    !versionSegment && hashSegmentRaw
      ? sanitizeFileNameSegment(hashSegmentRaw.slice(0, 12))
      : ''

  const segments = [base]
  if (templateSegment && !segments.includes(templateSegment)) {
    segments.push(templateSegment)
  }
  if (timestampSegment && !segments.includes(timestampSegment)) {
    segments.push(timestampSegment)
  }
  if (versionSegment && !segments.includes(versionSegment)) {
    segments.push(versionSegment)
  } else if (hashSegment && !segments.includes(hashSegment)) {
    segments.push(hashSegment)
  }

  const overrideType =
    (typeof options?.contentTypeOverride === 'string' && options.contentTypeOverride.trim()) || ''
  const headerContentType = response?.headers?.get?.('content-type') || ''
  const contentType = overrideType || headerContentType
  const normalizedType = contentType.split(';')[0]?.trim().toLowerCase()

  let extension = '.pdf'
  if (!options?.forcePdfExtension && normalizedType) {
    if (normalizedType.includes('pdf')) {
      extension = '.pdf'
    } else if (normalizedType.includes('wordprocessingml')) {
      extension = '.docx'
    } else if (normalizedType.includes('msword')) {
      extension = '.doc'
    } else if (normalizedType === 'application/json') {
      extension = '.json'
    }
  }

  return `${segments.filter(Boolean).join('-')}${extension}`
}

function buildActionableHint(segment) {
  return buildImprovementHintFromSegment(segment)
}

const TEMPLATE_PREFERENCE_STORAGE_KEY = 'resumeForge.templatePreferences'
const USER_ID_STORAGE_KEY = 'resumeForge.userId'

function readTemplatePreferenceStore() {
  if (typeof window === 'undefined' || !window?.localStorage) {
    return {}
  }
  try {
    const raw = window.localStorage.getItem(TEMPLATE_PREFERENCE_STORAGE_KEY)
    if (!raw) {
      return {}
    }
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch (err) {
    console.warn('Failed to read template preference store', err)
    return {}
  }
}

function writeTemplatePreferenceStore(store) {
  if (typeof window === 'undefined' || !window?.localStorage) {
    return
  }
  try {
    window.localStorage.setItem(
      TEMPLATE_PREFERENCE_STORAGE_KEY,
      JSON.stringify(store || {})
    )
  } catch (err) {
    console.warn('Failed to persist template preference store', err)
  }
}

function getStoredTemplatePreference(userIdentifier) {
  if (!userIdentifier) {
    return ''
  }
  const store = readTemplatePreferenceStore()
  const entry = store[userIdentifier]
  if (!entry) {
    return ''
  }
  if (typeof entry === 'string') {
    return entry
  }
  if (entry && typeof entry === 'object') {
    return typeof entry.template === 'string' ? entry.template : ''
  }
  return ''
}

function setStoredTemplatePreference(userIdentifier, templateId) {
  if (!userIdentifier || typeof templateId !== 'string' || !templateId.trim()) {
    return
  }
  const store = readTemplatePreferenceStore()
  const normalizedTemplate = templateId.trim()
  const existing = store[userIdentifier]
  if (
    (typeof existing === 'string' && existing === normalizedTemplate) ||
    (existing && typeof existing === 'object' && existing.template === normalizedTemplate)
  ) {
    return
  }
  store[userIdentifier] = {
    template: normalizedTemplate,
    updatedAt: new Date().toISOString()
  }
  writeTemplatePreferenceStore(store)
}

function generateUserIdentifier() {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID()
    }
  } catch (err) {
    console.warn('Failed to generate UUID via crypto', err)
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function readStoredUserId() {
  if (typeof window === 'undefined' || !window?.localStorage) {
    return ''
  }
  try {
    const raw = window.localStorage.getItem(USER_ID_STORAGE_KEY)
    if (typeof raw === 'string') {
      const trimmed = raw.trim()
      if (trimmed) {
        return trimmed
      }
    }
  } catch (err) {
    console.warn('Failed to read stored user id', err)
  }
  return ''
}

function persistStoredUserId(userId) {
  if (typeof window === 'undefined' || !window?.localStorage || !userId) {
    return
  }
  try {
    window.localStorage.setItem(USER_ID_STORAGE_KEY, userId)
  } catch (err) {
    console.warn('Failed to persist user id', err)
  }
}

function getOrCreateUserId() {
  const stored = readStoredUserId()
  if (stored) {
    return stored
  }
  const generated = generateUserIdentifier()
  persistStoredUserId(generated)
  return generated
}

function canonicalizeProfileIdentifier(profileUrl) {
  if (typeof profileUrl !== 'string') {
    return ''
  }
  const trimmed = profileUrl.trim()
  if (!trimmed) {
    return ''
  }
  try {
    const hasScheme = /^[a-z][a-z\d+\-.]*:/i.test(trimmed)
    const url = new URL(hasScheme ? trimmed : `https://${trimmed}`)
    url.hash = ''
    url.search = ''
    let host = url.hostname.toLowerCase()
    if (host.startsWith('www.')) {
      host = host.slice(4)
    }
    let path = url.pathname.replace(/\s+/g, '').replace(/\/+/g, '/')
    if (path.endsWith('/')) {
      path = path.slice(0, -1)
    }
    if (!path || path === '/') {
      return host
    }
    return `${host}${path.toLowerCase()}`
  } catch {
    return trimmed.toLowerCase()
  }
}

const PROHIBITED_JOB_DESCRIPTION_TAGS = Object.freeze([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'applet',
  'meta',
  'link',
  'base',
  'form',
  'input',
  'button',
  'textarea'
])

function looksLikeJobDescriptionUrl(text) {
  if (typeof text !== 'string') {
    return false
  }
  const trimmed = text.trim()
  if (!trimmed) {
    return false
  }
  if (/\s/.test(trimmed)) {
    return false
  }
  const urlPattern = /^(?:https?:\/\/|ftp:\/\/|www\.)\S+$/i
  if (urlPattern.test(trimmed)) {
    return true
  }
  const domainPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+(?:\/\S*)?$/i
  return domainPattern.test(trimmed)
}

function containsProhibitedJobDescriptionHtml(text) {
  if (typeof text !== 'string') {
    return false
  }
  const normalized = text.replace(/\u0000/g, '')
  return PROHIBITED_JOB_DESCRIPTION_TAGS.some((tag) => {
    const pattern = new RegExp(`<\\/?${tag}(?=\b|[\s>\/])`, 'i')
    return pattern.test(normalized)
  })
}

function deriveUserIdentifier({ profileUrl, userId } = {}) {
  const explicitId = typeof userId === 'string' ? userId.trim() : ''
  if (explicitId) {
    return explicitId.toLowerCase()
  }
  return canonicalizeProfileIdentifier(profileUrl)
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

const COVER_TEMPLATE_IDS = [
  'cover_modern',
  'cover_classic',
  'cover_professional',
  'cover_ats',
  'cover_2025'
]

const COVER_TEMPLATE_ALIASES = {
  modern: 'cover_modern',
  classic: 'cover_classic',
  professional: 'cover_professional',
  ats: 'cover_ats',
  '2025': 'cover_2025',
  futuristic: 'cover_2025',
  'cover-modern': 'cover_modern',
  'cover-classic': 'cover_classic',
  'cover-professional': 'cover_professional',
  'cover-ats': 'cover_ats',
  'cover-2025': 'cover_2025',
  'modern-cover': 'cover_modern',
  'classic-cover': 'cover_classic',
  'professional-cover': 'cover_professional',
  'ats-cover': 'cover_ats',
  '2025-cover': 'cover_2025',
  'cover modern': 'cover_modern',
  'cover classic': 'cover_classic',
  'cover professional': 'cover_professional',
  'cover ats': 'cover_ats',
  'cover 2025': 'cover_2025',
  covermodern: 'cover_modern',
  coverclassic: 'cover_classic',
  coverprofessional: 'cover_professional',
  coverats: 'cover_ats',
  cover2025: 'cover_2025',
  covermidnight: 'cover_classic'
}

const RESUME_TO_COVER_TEMPLATE = {
  modern: 'cover_modern',
  professional: 'cover_professional',
  classic: 'cover_classic',
  ats: 'cover_ats',
  2025: 'cover_2025'
}

const DEFAULT_COVER_TEMPLATE = 'cover_modern'

const canonicalizeCoverTemplateId = (value, fallback = '') => {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  if (!trimmed) return fallback
  const lowerTrimmed = trimmed.toLowerCase()
  if (COVER_TEMPLATE_IDS.includes(lowerTrimmed)) return lowerTrimmed
  const normalized = lowerTrimmed.replace(/\s+/g, '_')
  if (COVER_TEMPLATE_IDS.includes(normalized)) {
    return normalized
  }
  const alias = COVER_TEMPLATE_ALIASES[normalized] || COVER_TEMPLATE_ALIASES[lowerTrimmed]
  if (alias) return alias
  if (normalized.includes('classic')) return 'cover_classic'
  if (normalized.includes('modern')) return 'cover_modern'
  if (normalized.includes('professional')) return 'cover_professional'
  if (normalized.includes('2025')) return 'cover_2025'
  if (normalized.includes('ats')) return 'cover_ats'
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
  if (RESUME_TO_COVER_TEMPLATE[canonical]) {
    return RESUME_TO_COVER_TEMPLATE[canonical]
  }
  return DEFAULT_COVER_TEMPLATE
}

const ensureCoverTemplateContext = (
  context,
  templateId,
  { linkCoverToResume } = {}
) => {
  const derived = deriveCoverTemplateFromResume(templateId || DEFAULT_COVER_TEMPLATE)
  const base = context ? { ...context } : {}
  const requestedLink =
    typeof linkCoverToResume === 'boolean'
      ? linkCoverToResume
      : base.coverTemplateLinkedToResume !== false
  let coverTemplate1 = canonicalizeCoverTemplateId(base.coverTemplate1)
  if (requestedLink || !coverTemplate1) {
    coverTemplate1 = derived
  }
  const coverTemplates = normalizeCoverTemplateList(base.coverTemplates)
  const coverTemplate2 = canonicalizeCoverTemplateId(base.coverTemplate2)
  const mergedTemplates = normalizeCoverTemplateList([
    coverTemplate1,
    derived,
    coverTemplate2,
    ...coverTemplates
  ])
  if (!mergedTemplates.length) {
    mergedTemplates.push(DEFAULT_COVER_TEMPLATE)
  }

  if (!mergedTemplates.includes(derived)) {
    mergedTemplates.unshift(derived)
  }

  const fallback =
    mergedTemplates.find((tpl) => tpl !== coverTemplate1) ||
    COVER_TEMPLATE_IDS.find((tpl) => tpl !== coverTemplate1) ||
    DEFAULT_COVER_TEMPLATE

  base.coverTemplates = mergedTemplates
  base.coverTemplate1 = coverTemplate1
  if (!coverTemplate2 || coverTemplate2 === coverTemplate1) {
    base.coverTemplate2 = fallback
  } else {
    base.coverTemplate2 = coverTemplate2
  }
  base.coverTemplateLinkedToResume = requestedLink

  return base
}

const buildResumeTemplateMetadata = (templateId) => {
  const canonical = canonicalizeTemplateId(templateId)
  if (!canonical) return null
  const templateName = formatTemplateName(canonical)
  const templateLabel = templateName ? `${templateName} Resume` : 'Resume Template'
  return {
    templateId: canonical,
    templateName,
    templateType: 'resume',
    templateLabel
  }
}

const buildCoverTemplateMetadata = (templateId) => {
  const canonical = canonicalizeCoverTemplateId(templateId)
  if (!canonical) return null
  const templateName = formatCoverTemplateName(canonical)
  const templateLabel = templateName || 'Cover Letter'
  return {
    templateId: canonical,
    templateName,
    templateType: 'cover',
    templateLabel
  }
}

const decorateTemplateContext = (context) => {
  if (!context || typeof context !== 'object') return context
  const canonicalPrimary = canonicalizeTemplateId(context.template1)
  const canonicalSecondary = canonicalizeTemplateId(context.template2)
  const canonicalSelected =
    canonicalizeTemplateId(context.selectedTemplate) ||
    canonicalPrimary ||
    canonicalSecondary ||
    ''
  const canonicalCoverPrimary = canonicalizeCoverTemplateId(context.coverTemplate1)
  const canonicalCoverSecondary = canonicalizeCoverTemplateId(context.coverTemplate2)

  const templateMetadata = {
    resume: {
      primary: buildResumeTemplateMetadata(canonicalPrimary),
      secondary: buildResumeTemplateMetadata(canonicalSecondary),
      selected: buildResumeTemplateMetadata(canonicalSelected)
    },
    cover: {
      primary: buildCoverTemplateMetadata(canonicalCoverPrimary),
      secondary: buildCoverTemplateMetadata(canonicalCoverSecondary)
    }
  }

  return { ...context, templateMetadata }
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
  const historyList = []
  if (Array.isArray(context.templateHistory)) {
    context.templateHistory.forEach((item) => {
      const canonical = canonicalizeTemplateId(item)
      if (canonical && !historyList.includes(canonical)) {
        historyList.push(canonical)
      }
    })
  }
  const ensureHistory = (value) => {
    const canonical = canonicalizeTemplateId(value)
    if (!canonical) return
    const index = historyList.indexOf(canonical)
    if (index >= 0) {
      historyList.splice(index, 1)
    }
    historyList.unshift(canonical)
  }
  ensureHistory(selected)
  ensureHistory(primary)
  ensureHistory(secondary)
  if (historyList.length) {
    normalized.templateHistory = historyList
  } else if ('templateHistory' in normalized) {
    delete normalized.templateHistory
  }
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
    normalized.templates = Array.from(
      new Set(['modern', ...enrichedTemplates.filter(Boolean)])
    )
  }
  const templateForCover = normalized.selectedTemplate || normalized.template1 || 'modern'
  const shouldLinkCover = normalized.coverTemplateLinkedToResume !== false
  const contextWithCover = ensureCoverTemplateContext(normalized, templateForCover, {
    linkCoverToResume: shouldLinkCover
  })
  return decorateTemplateContext(contextWithCover)
}

const buildTemplateRequestContext = (templateContext, selectedTemplate) => {
  const canonicalSelectedTemplate = canonicalizeTemplateId(selectedTemplate) || 'modern'
  const baseContext =
    templateContext && typeof templateContext === 'object'
      ? { ...templateContext }
      : {}

  if (!baseContext.template1) {
    baseContext.template1 = canonicalSelectedTemplate
  }
  if (!baseContext.selectedTemplate) {
    baseContext.selectedTemplate = canonicalSelectedTemplate
  }

  const normalizedContext = normalizeTemplateContext(baseContext) || {
    template1: canonicalSelectedTemplate,
    template2: canonicalSelectedTemplate,
    selectedTemplate: canonicalSelectedTemplate
  }

  const canonicalPrimaryTemplate =
    canonicalizeTemplateId(normalizedContext.template1) || canonicalSelectedTemplate
  const canonicalSecondaryTemplate =
    canonicalizeTemplateId(normalizedContext.template2) || canonicalPrimaryTemplate
  const canonicalTemplate =
    canonicalizeTemplateId(normalizedContext.selectedTemplate) || canonicalPrimaryTemplate

  const derivedCoverTemplate = deriveCoverTemplateFromResume(canonicalTemplate)
  const canonicalCoverPrimaryTemplate =
    canonicalizeCoverTemplateId(
      normalizedContext.coverTemplate1,
      canonicalizeCoverTemplateId(derivedCoverTemplate, DEFAULT_COVER_TEMPLATE)
    ) || DEFAULT_COVER_TEMPLATE

  let canonicalCoverSecondaryTemplate = canonicalizeCoverTemplateId(
    normalizedContext.coverTemplate2,
    canonicalCoverPrimaryTemplate
  )

  const coverTemplateCandidatesRaw = Array.isArray(normalizedContext.coverTemplates)
    ? normalizedContext.coverTemplates
    : []
  const canonicalCoverTemplateCandidates = coverTemplateCandidatesRaw
    .map((item) => canonicalizeCoverTemplateId(item))
    .filter(Boolean)

  if (
    !canonicalCoverSecondaryTemplate ||
    canonicalCoverSecondaryTemplate === canonicalCoverPrimaryTemplate
  ) {
    const fallbackCandidate =
      canonicalCoverTemplateCandidates.find((tpl) => tpl !== canonicalCoverPrimaryTemplate) ||
      COVER_TEMPLATE_IDS.find((tpl) => tpl !== canonicalCoverPrimaryTemplate) ||
      canonicalCoverPrimaryTemplate
    canonicalCoverSecondaryTemplate = fallbackCandidate
  }

  const canonicalCoverTemplate = canonicalCoverPrimaryTemplate || DEFAULT_COVER_TEMPLATE

  const templateCandidatesRaw = Array.isArray(normalizedContext.templates)
    ? normalizedContext.templates
    : []
  const canonicalTemplateCandidates = templateCandidatesRaw
    .map((item) => canonicalizeTemplateId(item))
    .filter(Boolean)

  const canonicalTemplateList = Array.from(
    new Set(
      [
        canonicalTemplate,
        canonicalPrimaryTemplate,
        canonicalSecondaryTemplate,
        ...canonicalTemplateCandidates
      ].filter(Boolean)
    )
  )

  const canonicalCoverTemplateList = Array.from(
    new Set(
      [
        canonicalCoverPrimaryTemplate,
        canonicalCoverSecondaryTemplate,
        ...canonicalCoverTemplateCandidates
      ].filter(Boolean)
    )
  )

  const preparedContext = {
    ...normalizedContext,
    template1: canonicalPrimaryTemplate,
    template2: canonicalSecondaryTemplate,
    selectedTemplate: canonicalTemplate,
    templates: canonicalTemplateList,
    coverTemplate1: canonicalCoverPrimaryTemplate,
    coverTemplate2: canonicalCoverSecondaryTemplate,
    coverTemplates: canonicalCoverTemplateList
  }

  return {
    canonicalTemplate,
    canonicalPrimaryTemplate,
    canonicalSecondaryTemplate,
    canonicalCoverTemplate,
    canonicalCoverPrimaryTemplate,
    canonicalCoverSecondaryTemplate,
    canonicalTemplateList,
    canonicalCoverTemplateList,
    context: preparedContext
  }
}

const formatTemplateName = (id) => {
  if (!id) return 'Custom Template'
  const raw = typeof id === 'string' ? id.trim() : String(id || '').trim()
  if (!raw) return 'Custom Template'
  const canonical = canonicalizeTemplateId(raw)
  if (canonical && TEMPLATE_DISPLAY_NAME_MAP.has(canonical)) {
    return TEMPLATE_DISPLAY_NAME_MAP.get(canonical)
  }
  const lower = raw.toLowerCase()
  if (TEMPLATE_DISPLAY_NAME_MAP.has(lower)) {
    return TEMPLATE_DISPLAY_NAME_MAP.get(lower)
  }
  const normalized = canonical || raw
  return normalized
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

const COVER_TEMPLATE_DETAILS = {
  cover_modern: {
    name: 'Modern Cover Letter',
    description: 'Gradient header with confident typography and clean paragraph rhythm.'
  },
  cover_classic: {
    name: 'Classic Cover Letter',
    description: 'Elegant serif presentation with letterhead-inspired spacing and signature close.'
  },
  cover_professional: {
    name: 'Professional Cover Letter',
    description: 'Boardroom-ready styling with navy accents and structured paragraph spacing.'
  },
  cover_ats: {
    name: 'ATS Cover Letter',
    description: 'Single-column focus with neutral tones engineered for parsing clarity.'
  },
  cover_2025: {
    name: 'Future Vision 2025 Cover Letter',
    description: 'Futuristic layout with dark canvas, neon accents, and confident typography.'
  }
}

const COVER_TEMPLATE_ORDER = [
  'cover_modern',
  'cover_classic',
  'cover_professional',
  'cover_ats',
  'cover_2025'
]

const COVER_TEMPLATE_OPTIONS = COVER_TEMPLATE_ORDER.filter((id) => COVER_TEMPLATE_DETAILS[id]).map(
  (id) => ({
    id,
    name: COVER_TEMPLATE_DETAILS[id].name,
    description: COVER_TEMPLATE_DETAILS[id].description
  })
)

const formatCoverTemplateName = (id) => {
  if (!id) return 'Cover Letter'
  return COVER_TEMPLATE_DETAILS[id]?.name || 'Cover Letter'
}

const getCoverTemplateDescription = (id) => {
  if (!id) return ''
  return COVER_TEMPLATE_DETAILS[id]?.description || ''
}

const resolveCoverTemplateSelection = ({
  file = {},
  type = '',
  downloadTemplateMetadata = {},
  templateContext = {}
} = {}) => {
  const metadataForType =
    (downloadTemplateMetadata && typeof downloadTemplateMetadata === 'object'
      ? downloadTemplateMetadata[type]
      : null) || {}
  const fileTemplateMeta =
    (file.templateMeta && typeof file.templateMeta === 'object' ? file.templateMeta : null) ||
    metadataForType ||
    {}
  const context = templateContext && typeof templateContext === 'object' ? templateContext : {}

  const resolvedTemplateId = canonicalizeCoverTemplateId(
    fileTemplateMeta.templateId ||
    file.templateId ||
    file.coverTemplateId ||
    metadataForType?.id ||
    context.coverTemplate1 ||
    DEFAULT_COVER_TEMPLATE,
    DEFAULT_COVER_TEMPLATE
  )

  const resolvedTemplateName =
    (typeof fileTemplateMeta.templateName === 'string' && fileTemplateMeta.templateName.trim()) ||
    (typeof file.coverTemplateName === 'string' && file.coverTemplateName.trim()) ||
    (typeof metadataForType?.name === 'string' && metadataForType.name.trim()) ||
    formatCoverTemplateName(resolvedTemplateId)

  const coverTemplateCandidates = normalizeCoverTemplateList([
    resolvedTemplateId,
    fileTemplateMeta.templateId,
    file.coverTemplateId,
    metadataForType?.id,
    context.coverTemplate1,
    context.coverTemplate2,
    ...(Array.isArray(context.coverTemplates) ? context.coverTemplates : [])
  ])

  return {
    templateId: resolvedTemplateId,
    templateName: resolvedTemplateName,
    templateMeta: fileTemplateMeta,
    candidates: coverTemplateCandidates
  }
}

const ATS_SUB_SCORE_ORDER = [
  'Layout & Searchability',
  'Readability',
  'Impact',
  'Crispness',
  'Other'
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

const CHANGE_LOG_SECTION_LABELS = {
  summary: 'Summary',
  skills: 'Skills',
  experience: 'Work Experience',
  certifications: 'Certifications',
  projects: 'Projects',
  highlights: 'Highlights',
  designation: 'Designation',
  education: 'Education',
  resume: 'Entire Resume'
}

const CHANGE_LOG_SECTIONS_BY_TYPE = {
  'improve-summary': { key: 'summary', label: 'Summary' },
  'add-missing-skills': { key: 'skills', label: 'Skills' },
  'align-experience': { key: 'experience', label: 'Work Experience' },
  'improve-certifications': { key: 'certifications', label: 'Certifications' },
  'improve-projects': { key: 'projects', label: 'Projects' },
  'improve-highlights': { key: 'highlights', label: 'Highlights' },
  'change-designation': { key: 'designation', label: 'Designation' },
  'enhance-all': { key: 'resume', label: 'Entire Resume' }
}

const DOWNLOAD_VARIANT_BADGE_STYLES = {
  original: {
    text: 'Original',
    className:
      'inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700'
  },
  enhanced: {
    text: 'Enhanced',
    className:
      'inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700'
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
        linkLabel: 'Download Original CV',
        category: 'resume',
        variantType: 'original',
        autoPreviewPriority: 4
      }
    case 'original_upload_pdf':
      return {
        label: 'Original CV (Plain PDF)',
        description:
          'Text-only PDF fallback generated from your upload. Logos and design elements may be missing—use when you strictly need a PDF copy.',
        badgeText: 'Plain PDF',
        badgeStyle: 'bg-slate-100 text-slate-600 border-slate-200',
        buttonStyle: 'bg-slate-600 hover:bg-slate-700 focus:ring-slate-500',
        cardAccent: 'bg-gradient-to-br from-slate-50 via-white to-slate-50',
        cardBorder: 'border-slate-200',
        linkLabel: 'Download Plain PDF',
        category: 'resume',
        variantType: 'original',
        autoPreviewPriority: 5
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
        linkLabel: 'Download Enhanced CV',
        category: 'resume',
        variantType: 'enhanced',
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
        linkLabel: 'Download Enhanced CV',
        category: 'resume',
        variantType: 'enhanced',
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
        linkLabel: 'Download Cover Letter',
        category: 'cover',
        variantType: 'enhanced',
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
        linkLabel: 'Download Cover Letter',
        category: 'cover',
        variantType: 'enhanced',
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
        linkLabel: 'Download File',
        category: 'other',
        variantType: 'enhanced',
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

  const normalizeSectionKey = (value) => {
    const text = typeof value === 'string' ? value.trim() : ''
    if (!text) return ''
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '_')
  }

  const resolveSectionLabel = (key, label) => {
    const trimmed = typeof label === 'string' ? label.trim() : ''
    if (trimmed) {
      return trimmed
    }
    const keyCandidate = normalizeSectionKey(key)
    if (keyCandidate && CHANGE_LOG_SECTION_LABELS[keyCandidate]) {
      return CHANGE_LOG_SECTION_LABELS[keyCandidate]
    }
    if (keyCandidate) {
      return keyCandidate.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
    }
    return ''
  }

  const sectionChangeMap = new Map()

  const registerSectionChange = (keyCandidate, labelCandidate, weight = 1) => {
    const label = resolveSectionLabel(keyCandidate, labelCandidate)
    const key = normalizeSectionKey(keyCandidate) || normalizeSectionKey(label)
    if (!key && !label) {
      return
    }
    const existing = sectionChangeMap.get(key) || { key, label, count: 0 }
    if (label && !existing.label) {
      existing.label = label
    }
    const increment = Number.isFinite(weight) && weight > 0 ? weight : 1
    existing.count += increment
    if (!existing.label) {
      existing.label = resolveSectionLabel(key)
    }
    sectionChangeMap.set(key, existing)
  }

  summarySegments.forEach((segment) => {
    if (!segment || !segment.section) return
    registerSectionChange(segment.section, segment.section)
  })

  if (Array.isArray(suggestion?.sectionChanges)) {
    suggestion.sectionChanges.forEach((section) => {
      if (!section) return
      const weight = Number.isFinite(section.count) ? Number(section.count) : 1
      registerSectionChange(
        section.key || section.section || section.label,
        section.label || section.section || section.key,
        weight
      )
    })
  }

  if (suggestion?.rescore?.section) {
    const rescoreSection = suggestion.rescore.section
    registerSectionChange(rescoreSection.key || rescoreSection.label, rescoreSection.label || rescoreSection.key)
  }

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

  const categoryChangelog = buildCategoryChangeLog({
    summarySegments,
    detail: detailText,
    addedItems,
    removedItems,
    itemizedChanges,
    before: beforeExcerpt,
    after: afterExcerpt,
    scoreDelta: suggestion?.scoreDelta,
    suggestionType: suggestion?.type
  })

  if (sectionChangeMap.size === 0) {
    const fallbackSection = CHANGE_LOG_SECTIONS_BY_TYPE[suggestionType]
    if (fallbackSection) {
      registerSectionChange(fallbackSection.key, fallbackSection.label)
    }
  }

  const sectionChanges = Array.from(sectionChangeMap.values()).sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count
    }
    return a.label.localeCompare(b.label)
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
    categoryChangelog,
    sectionChanges,
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

function resolveDeltaTone(delta) {
  if (typeof delta !== 'number' || Number.isNaN(delta)) {
    return 'text-slate-600'
  }
  if (delta > 0) {
    return 'text-emerald-600'
  }
  if (delta < 0) {
    return 'text-rose-600'
  }
  return 'text-slate-600'
}

function normalizeRescoreSummary(summary) {
  if (!summary || typeof summary !== 'object') {
    return null
  }

  try {
    return cloneData(summary)
  } catch (err) {
    console.error('Unable to clone rescore summary, falling back to shallow copy', err)
    return { ...summary }
  }
}

function deriveSelectionMeaning(value, fallback = null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }
  if (value >= 75) {
    return 'High'
  }
  if (value >= 55) {
    return 'Medium'
  }
  return 'Low'
}

function buildSelectionRationale(value, meaning, fallback = null) {
  if (typeof fallback === 'string' && fallback.trim()) {
    return fallback.trim()
  }
  if (typeof value === 'number' && Number.isFinite(value) && meaning) {
    const rounded = Math.round(value)
    return `Projected ${meaning.toLowerCase()} probability (${rounded}%) that this resume will be shortlisted for the JD.`
  }
  return fallback
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

function ImprovementCard({ suggestion, onReject, onPreview }) {
  const deltaText = formatScoreDelta(suggestion.scoreDelta)
  const deltaTone = resolveDeltaTone(suggestion.scoreDelta)
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
  const improvementHints = useMemo(() => {
    if (!Array.isArray(suggestion.improvementSummary)) return []
    return suggestion.improvementSummary.map((segment) => buildActionableHint(segment)).filter(Boolean)
  }, [suggestion.improvementSummary])
  const normalizedValidation = useMemo(
    () => normalizeImprovementValidation(suggestion.validation),
    [suggestion.validation]
  )
  const jobAlignment = normalizedValidation.jobAlignment || {}
  const validationStatus = resolveImprovementValidationStatus(normalizedValidation)
  const validationLabel = (() => {
    switch (validationStatus) {
      case 'passed':
        return 'JD alignment confirmed'
      case 'failed':
        return 'Needs JD alignment'
      case 'skipped':
        return 'JD validation unavailable'
      default:
        return 'JD validation pending'
    }
  })()
  const validationToneClass =
    validationStatus === 'passed'
      ? 'text-emerald-700'
      : validationStatus === 'failed'
        ? 'text-rose-600'
        : 'text-slate-600'
  const validationMessage = (() => {
    if (jobAlignment.reason) {
      return jobAlignment.reason
    }
    if (validationStatus === 'failed') {
      return 'No JD keywords matched this rewrite.'
    }
    if (validationStatus === 'skipped') {
      return 'No JD keywords were supplied to validate this section.'
    }
    if (validationStatus === 'unknown') {
      return 'Validation pending — rerun ATS scoring once improvements are applied.'
    }
    return ''
  })()
  const validationHighlights = useMemo(() => {
    const highlights = [
      ...(Array.isArray(jobAlignment.matchedSkills) ? jobAlignment.matchedSkills : []),
      ...(Array.isArray(jobAlignment.coveredSkills) ? jobAlignment.coveredSkills : [])
    ]
    return toUniqueList(highlights)
  }, [jobAlignment.coveredSkills, jobAlignment.matchedSkills])
  const areaImpactRows = useMemo(() => {
    const overallSummary = suggestion?.rescoreSummary?.overall
    if (!overallSummary || typeof overallSummary !== 'object') {
      return []
    }

    const toMetricList = (section) => {
      if (!section || typeof section !== 'object') {
        return []
      }
      if (Array.isArray(section.atsSubScores)) {
        return orderAtsMetrics(section.atsSubScores)
      }
      if (Array.isArray(section.scoreBreakdown)) {
        return orderAtsMetrics(section.scoreBreakdown)
      }
      if (section.scoreBreakdown && typeof section.scoreBreakdown === 'object') {
        return orderAtsMetrics(Object.values(section.scoreBreakdown))
      }
      return []
    }

    const beforeList = toMetricList(overallSummary.before)
    const afterList = toMetricList(overallSummary.after)
    if (!beforeList.length && !afterList.length) {
      return []
    }

    const combined = orderAtsMetrics([...beforeList, ...afterList])
    const seen = new Set()

    return combined
      .map((metric) => {
        const category = metric?.category
        if (!category || seen.has(category)) {
          return null
        }
        seen.add(category)

        const beforeMetric = beforeList.find((item) => item?.category === category)
        const afterMetric = afterList.find((item) => item?.category === category)
        const beforeScore =
          typeof beforeMetric?.score === 'number' && Number.isFinite(beforeMetric.score)
            ? beforeMetric.score
            : null
        const afterScore =
          typeof afterMetric?.score === 'number' && Number.isFinite(afterMetric.score)
            ? afterMetric.score
            : null
        const delta =
          beforeScore !== null && afterScore !== null ? afterScore - beforeScore : null

        if (beforeScore === null && afterScore === null) {
          return null
        }

        return {
          category,
          beforeScore,
          afterScore,
          delta
        }
      })
      .filter(Boolean)
  }, [suggestion?.rescoreSummary])
  const actionableHints = improvementHints.length
    ? improvementHints
    : ['Review this update and prepare to speak to the new talking points.']
  const formatMetricScore = (value) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : '—'

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
            className={`text-xs px-3 py-1 rounded-full ${suggestion.accepted
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
      <div className="rounded-lg border border-purple-200/70 bg-white/70 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-purple-600">
          JD Alignment Check
        </p>
        <p className={`text-sm font-semibold ${validationToneClass}`}>{validationLabel}</p>
        {validationMessage && (
          <p className="mt-1 text-xs text-purple-700/80">{validationMessage}</p>
        )}
        {validationHighlights.length > 0 && (
          <p className="mt-2 text-xs text-purple-700/80">
            Reinforced keywords: {validationHighlights.join(', ')}
          </p>
        )}
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
      {areaImpactRows.length > 0 && (
        <div className="rounded-lg border border-purple-200/60 bg-purple-50/50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-purple-600">
            ATS area impact
          </p>
          <div className="mt-2 space-y-2">
            {areaImpactRows.map((row) => {
              const areaDeltaText = formatScoreDelta(row.delta)
              const areaTone = resolveDeltaTone(row.delta)
              return (
                <div
                  key={row.category}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white/70 px-3 py-2"
                >
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-purple-500">
                      {row.category}
                    </p>
                    <p className="text-sm text-purple-900/80">
                      {formatMetricScore(row.beforeScore)} → {formatMetricScore(row.afterScore)}
                    </p>
                  </div>
                  {areaDeltaText && (
                    <p className={`text-sm font-semibold ${areaTone}`}>{areaDeltaText}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-3 justify-end pt-2">
        <button
          type="button"
          onClick={onPreview}
          className="px-4 py-2 rounded-full text-sm font-semibold border border-indigo-200 text-indigo-600 hover:bg-indigo-50"
        >
          Show Me Proposed Changes
        </button>
        <button
          type="button"
          onClick={onReject}
          className="px-4 py-2 rounded-full text-sm font-medium border border-rose-300 text-rose-600 hover:bg-rose-50"
        >
          Reject
        </button>
      </div>
    </div>
  )
}

function App() {
  console.log('App component rendering...');
  const [manualJobDescription, setManualJobDescription] = useState('')
  const [manualCertificatesInput, setManualCertificatesInput] = useState('')
  const [cvFile, setCvFile] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [outputFiles, setOutputFiles] = useState([])
  const [downloadGeneratedAt, setDownloadGeneratedAt] = useState('')
  const [downloadStates, setDownloadStates] = useState({})
  const [artifactsUploaded, setArtifactsUploaded] = useState(false)
  const [match, setMatch] = useState(null)
  const [scoreBreakdown, setScoreBreakdown] = useState([])
  const [baselineScoreBreakdown, setBaselineScoreBreakdown] = useState([])
  const [resumeText, setResumeText] = useState('')
  const [jobDescriptionText, setJobDescriptionText] = useState('')
  const manualJobDescriptionValue = useMemo(() => {
    return typeof manualJobDescription === 'string' ? manualJobDescription.trim() : ''
  }, [manualJobDescription])
  const manualJobDescriptionHasProhibitedHtml = useMemo(
    () => containsProhibitedJobDescriptionHtml(manualJobDescription),
    [manualJobDescription]
  )
  const manualJobDescriptionLooksLikeUrl = useMemo(
    () => looksLikeJobDescriptionUrl(manualJobDescriptionValue),
    [manualJobDescriptionValue]
  )
  const parsedJobDescription = useMemo(
    () => parseJobDescriptionText(jobDescriptionText),
    [jobDescriptionText]
  )
  const parsedJobTitle = useMemo(() => {
    const candidateTitle = typeof parsedJobDescription?.title === 'string'
      ? parsedJobDescription.title.trim()
      : ''
    if (!candidateTitle) return ''
    if (/^job description$/i.test(candidateTitle)) return ''
    return candidateTitle
  }, [parsedJobDescription])
  const [jobSkills, setJobSkills] = useState([])
  const [resumeSkills, setResumeSkills] = useState([])
  const [knownCertificates, setKnownCertificates] = useState([])
  const [manualCertificatesData, setManualCertificatesData] = useState([])
  const [certificateInsights, setCertificateInsights] = useState(null)
  const [selectionInsights, setSelectionInsights] = useState(null)
  const [improvementResults, setImprovementResults] = useState([])
  const [changeLog, setChangeLog] = useState([])
  const changeLogSummaryData = useMemo(
    () => buildAggregatedChangeLogSummary(changeLog),
    [changeLog]
  )
  const changeLogSummaryContext = useMemo(() => {
    const jobDescriptionValue = typeof jobDescriptionText === 'string' ? jobDescriptionText.trim() : ''
    const jobTitleCandidates = [
      parsedJobTitle,
      typeof parsedJobDescription?.title === 'string' ? parsedJobDescription.title : '',
      selectionInsights?.designation?.targetTitle || ''
    ]
    const jobTitle = jobTitleCandidates
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .find((value) => value && !/^job description$/i.test(value)) || ''

    const targetTitleCandidates = [
      match?.modifiedTitle,
      selectionInsights?.designation?.currentTitle,
      match?.originalTitle,
      selectionInsights?.designation?.targetTitle
    ]
    const targetTitle = targetTitleCandidates
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .find(Boolean) || ''

    const originalTitle =
      typeof match?.originalTitle === 'string' ? match.originalTitle.trim() : ''

    const targetSummaryCandidates = [
      enhanceAllSummaryText,
      selectionInsights?.summary,
      selectionInsights?.message,
      selectionInsights?.designation?.message
    ]
    const targetSummary = targetSummaryCandidates
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .find(Boolean) || ''

    return {
      jobTitle,
      jobDescription: jobDescriptionValue,
      targetTitle,
      originalTitle,
      targetSummary
    }
  }, [
    jobDescriptionText,
    parsedJobDescription,
    parsedJobTitle,
    selectionInsights,
    match,
    enhanceAllSummaryText
  ])
  const [activeDashboardStage, setActiveDashboardStage] = useState('score')
  const [activeImprovement, setActiveImprovement] = useState('')
  const [activeImprovementBatchKeys, setActiveImprovementBatchKeys] = useState([])
  const [selectedImprovementKeys, setSelectedImprovementKeys] = useState([])
  const selectedImprovementSet = useMemo(
    () => new Set(selectedImprovementKeys.filter((key) => typeof key === 'string' && key.trim())),
    [selectedImprovementKeys]
  )
  const selectedImprovementCount = selectedImprovementSet.size
  const hasSelectedImprovements = selectedImprovementCount > 0
  const [isBulkAccepting, setIsBulkAccepting] = useState(false)
  const [error, setErrorState] = useState('')
  const [errorRecovery, setErrorRecovery] = useState(null)
  const [errorContext, setErrorContext] = useState({ source: '', code: '', requestId: '' })
  const [errorLogs, setErrorLogs] = useState([])
  const [stageErrors, setStageErrors] = useState(() => createStageErrorState())
  const [environmentHost] = useState(() => {
    if (typeof window === 'undefined' || !window.location) {
      return ''
    }
    return typeof window.location.hostname === 'string' ? window.location.hostname : ''
  })
  const [environmentOrigin] = useState(() => {
    if (typeof window === 'undefined' || !window.location) {
      return ''
    }
    return typeof window.location.origin === 'string' ? window.location.origin : ''
  })
  const [cloudfrontMetadata, setCloudfrontMetadata] = useState(() => {
    if (typeof window === 'undefined') {
      return { canonicalUrl: '', canonicalHost: '', apiGatewayUrl: '', updatedAt: '' }
    }
    const preload = window.__RESUMEFORGE_CLOUDFRONT_DEGRADE__ || {}
    const canonicalUrl =
      typeof preload.canonicalUrl === 'string' && preload.canonicalUrl.trim()
        ? preload.canonicalUrl.trim()
        : ''
    let canonicalHost = ''
    if (canonicalUrl) {
      try {
        canonicalHost = new URL(canonicalUrl, window.location.href).hostname
      } catch (error) {
        console.warn('Unable to parse canonical CloudFront URL from preload metadata.', error)
        canonicalHost = ''
      }
    }
    const apiGatewayUrl =
      typeof preload.backupApiGatewayUrl === 'string' && preload.backupApiGatewayUrl.trim()
        ? preload.backupApiGatewayUrl.trim()
        : typeof window.location?.origin === 'string'
          ? window.location.origin
          : ''
    const detectedAt =
      typeof preload.detectedAt === 'string' && preload.detectedAt.trim()
        ? preload.detectedAt.trim()
        : ''
    return {
      canonicalUrl,
      canonicalHost,
      apiGatewayUrl,
      updatedAt: detectedAt
    }
  })
  const setError = useCallback((value, options = {}) => {
    const nextMessage =
      typeof value === 'string'
        ? value
        : typeof value === 'number'
          ? String(value)
          : ''
    const trimmedMessage = nextMessage.trim()
    setErrorState(trimmedMessage)
    const normalizedStage = normalizeStageKey(options?.stage)
    if (normalizedStage) {
      setStageErrors((prev) => {
        const safePrev =
          prev && typeof prev === 'object' ? prev : createStageErrorState()
        const currentValue =
          typeof safePrev[normalizedStage] === 'string'
            ? safePrev[normalizedStage]
            : ''
        if (currentValue === trimmedMessage) {
          return safePrev === prev ? prev : { ...safePrev }
        }
        return { ...safePrev, [normalizedStage]: trimmedMessage }
      })
    } else if (!trimmedMessage) {
      setStageErrors(createStageErrorState())
    }
    const allowRetryOption =
      typeof options?.allowRetry === 'boolean' ? options.allowRetry : undefined
    const allowRetry = allowRetryOption !== false
    const rawRecoveryKey =
      typeof options?.recovery === 'string' && options.recovery.trim()
        ? options.recovery.trim()
        : allowRetry
          ? 'generation'
          : ''
    let normalizedRecoveryKey = rawRecoveryKey
      ? rawRecoveryKey.toLowerCase()
      : ''
    const requestIdOption =
      typeof options?.requestId === 'string' ? options.requestId.trim() : ''
    const logsOption =
      Array.isArray(options?.logs) && options.logs.length > 0
        ? options.logs.filter((entry) => entry && typeof entry === 'object')
        : []
    if (trimmedMessage) {
      const providedCode =
        typeof options?.errorCode === 'string'
          ? options.errorCode.trim().toUpperCase()
          : ''
      const providedSource = normalizeServiceSource(options?.serviceError)
      const derivedSource =
        providedSource ||
        (providedCode
          ? normalizeServiceSource(
            SERVICE_ERROR_SOURCE_BY_CODE[providedCode] || ''
          )
          : '')
      if (!normalizedRecoveryKey && allowRetry) {
        normalizedRecoveryKey = 'generation'
      }
      setErrorContext({ source: derivedSource, code: providedCode, requestId: requestIdOption })
      setErrorLogs(logsOption)
    } else {
      setErrorContext({ source: '', code: '', requestId: '' })
      setErrorLogs([])
    }
    if (trimmedMessage && normalizedRecoveryKey) {
      setErrorRecovery(normalizedRecoveryKey)
    } else {
      setErrorRecovery(null)
    }
  }, [setErrorContext, setErrorLogs, setStageErrors])
  const cloudfrontFallbackActive = useMemo(() => {
    if (!environmentHost) {
      return false
    }
    if (/\.execute-api\.[^.]+\.amazonaws\.com$/i.test(environmentHost)) {
      return true
    }
    if (cloudfrontMetadata.canonicalHost) {
      const canonicalHost = cloudfrontMetadata.canonicalHost
      const canonicalLooksLikeCloudfront = /\.cloudfront\.net$/i.test(canonicalHost)
      const locationLooksLikeCloudfront = /\.cloudfront\.net$/i.test(environmentHost)
      if (canonicalLooksLikeCloudfront && canonicalHost !== environmentHost && !locationLooksLikeCloudfront) {
        return true
      }
    }
    return false
  }, [cloudfrontMetadata.canonicalHost, environmentHost])
  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined
    }
    const value = cloudfrontMetadata.apiGatewayUrl || environmentOrigin || ''
    const inputs = document.querySelectorAll('input[data-backup-api-base]')
    inputs.forEach((input) => {
      if (input) {
        input.value = value
        input.setAttribute('value', value)
      }
    })
    return undefined
  }, [cloudfrontMetadata.apiGatewayUrl, environmentOrigin])
  useEffect(() => {
    if (typeof window === 'undefined' || typeof fetch !== 'function') {
      return undefined
    }
    let cancelled = false
    let controller = null
    if (typeof AbortController === 'function') {
      controller = new AbortController()
    }
    const options = controller ? { signal: controller.signal } : undefined
    const endpoints = ['/api/published-cloudfront', '/api/published-cloudfront.json']

      ; (async () => {
        let lastError = null
        for (const endpoint of endpoints) {
          if (cancelled) {
            return
          }

          const url = typeof endpoint === 'string' ? endpoint : ''
          if (!url) {
            continue
          }

          let response
          try {
            response = await fetch(url, options)
          } catch (error) {
            if (error?.name === 'AbortError') {
              return
            }
            lastError = error
            continue
          }

          if (!response || !response.ok) {
            continue
          }

          let data = null
          try {
            data = await response.json()
          } catch (error) {
            lastError = error
            continue
          }

          if (cancelled || !data || !data.cloudfront) {
            continue
          }

          const canonicalUrl =
            typeof data.cloudfront.url === 'string' && data.cloudfront.url.trim()
              ? data.cloudfront.url.trim()
              : ''
          let canonicalHost = ''
          if (canonicalUrl) {
            try {
              canonicalHost = new URL(canonicalUrl, window.location.href).hostname
            } catch (error) {
              console.warn('Unable to parse canonical CloudFront URL from API metadata.', error)
              canonicalHost = ''
            }
          }
          const apiGatewayUrl =
            typeof data.cloudfront.apiGatewayUrl === 'string' && data.cloudfront.apiGatewayUrl.trim()
              ? data.cloudfront.apiGatewayUrl.trim()
              : ''
          const updatedAt =
            typeof data.cloudfront.updatedAt === 'string' && data.cloudfront.updatedAt.trim()
              ? data.cloudfront.updatedAt.trim()
              : ''
          setCloudfrontMetadata((prev) => ({
            canonicalUrl: canonicalUrl || prev.canonicalUrl,
            canonicalHost: canonicalHost || prev.canonicalHost,
            apiGatewayUrl: apiGatewayUrl || prev.apiGatewayUrl || environmentOrigin,
            updatedAt: updatedAt || prev.updatedAt
          }))
          return
        }

        if (lastError && lastError?.name !== 'AbortError') {
          console.warn('Unable to load published CloudFront metadata within the app.', lastError)
        }
      })()
    return () => {
      cancelled = true
      if (controller) {
        controller.abort()
      }
    }
  }, [environmentOrigin])
  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }
    if (!cloudfrontFallbackActive) {
      return undefined
    }
    try {
      window.__RESUMEFORGE_CLOUDFRONT_DEGRADE__ = {
        canonicalUrl: cloudfrontMetadata.canonicalUrl || '',
        backupApiGatewayUrl: cloudfrontMetadata.apiGatewayUrl || environmentOrigin || '',
        detectedAt: cloudfrontMetadata.updatedAt || new Date().toISOString()
      }
    } catch (error) {
      console.warn('Unable to update CloudFront fallback metadata on the window.', error)
    }
    return undefined
  }, [
    cloudfrontFallbackActive,
    cloudfrontMetadata.apiGatewayUrl,
    cloudfrontMetadata.canonicalUrl,
    cloudfrontMetadata.updatedAt,
    environmentOrigin
  ])
  const [queuedMessage, setQueuedMessage] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('modern')
  const [previewSuggestion, setPreviewSuggestion] = useState(null)
  const [previewActionBusy, setPreviewActionBusy] = useState(false)
  const [previewActiveAction, setPreviewActiveAction] = useState('')
  const [previewFile, setPreviewFile] = useState(null)
  const [pendingDownloadFile, setPendingDownloadFile] = useState(null)
  const [initialAnalysisSnapshot, setInitialAnalysisSnapshot] = useState(null)
  const [jobId, setJobId] = useState('')
  const [templateContext, setTemplateContext] = useState(null)
  const [isGeneratingDocs, setIsGeneratingDocs] = useState(false)
  const [manualJobDescriptionRequired, setManualJobDescriptionRequired] = useState(false)
  const manualJobDescriptionHasError =
    manualJobDescriptionRequired ||
    manualJobDescriptionLooksLikeUrl ||
    manualJobDescriptionHasProhibitedHtml
  const manualJobDescriptionHelperText = manualJobDescriptionHasProhibitedHtml
    ? 'Remove HTML tags like <script> before continuing.'
    : manualJobDescriptionLooksLikeUrl
      ? 'Paste the full job description text instead of a link.'
      : manualJobDescriptionRequired
        ? 'Paste the full job description to continue.'
        : 'Paste the full JD so we analyse the exact role requirements.'
  const [enhanceAllSummaryText, setEnhanceAllSummaryText] = useState('')
  const [coverLetterDrafts, setCoverLetterDrafts] = useState({})
  const [coverLetterOriginals, setCoverLetterOriginals] = useState({})
  const [coverLetterEditor, setCoverLetterEditor] = useState(null)
  const [isCoverLetterDownloading, setIsCoverLetterDownloading] = useState(false)
  const [coverLetterDownloadError, setCoverLetterDownloadError] = useState('')
  const [coverLetterClipboardStatus, setCoverLetterClipboardStatus] = useState('')
  const [coverLetterReviewState, setCoverLetterReviewState] = useState({})
  const [resumeHistory, setResumeHistory] = useState([])

  const updateOutputFiles = useCallback((files, options = {}) => {
    setOutputFiles(files)
    let nextTimestamp = ''
    const providedTimestamp = options?.generatedAt
    if (providedTimestamp) {
      const providedDate = new Date(providedTimestamp)
      if (!Number.isNaN(providedDate.getTime())) {
        nextTimestamp = providedDate.toISOString()
      }
    }
    if (!nextTimestamp && Array.isArray(files) && files.length > 0) {
      nextTimestamp = new Date().toISOString()
    }
    setDownloadGeneratedAt(nextTimestamp)
  }, [])
  const resetAnalysisState = useCallback(() => {
    analysisContextRef.current = { hasAnalysis: false, cvSignature: '', jobSignature: '', jobId: '' }
    pendingImprovementRescoreRef.current = []
    setDownloadStates({})
    setDownloadGeneratedAt('')
    setPendingDownloadFile(null)
    setCoverLetterReviewState({})
    setArtifactsUploaded(false)
    updateOutputFiles([])
    setMatch(null)
    setScoreBreakdown([])
    setBaselineScoreBreakdown([])
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
    setActiveImprovement('')
    setError('')
    setQueuedMessage('')
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
    setPreviewSuggestion(null)
    setPreviewFile(null)
    setPreviewActionBusy(false)
    setPreviewActiveAction('')
    setEnhanceAllSummaryText('')
    setIsCoverLetterDownloading(false)
    setActiveDashboardStage('score')
  }, [
    setActiveDashboardStage,
    setCoverLetterReviewState,
    setDownloadGeneratedAt,
    setDownloadStates,
    setPendingDownloadFile,
    setPreviewActionBusy,
    setPreviewActiveAction,
    updateOutputFiles
  ])
  const resetUiAfterDownload = useCallback(
    (message = POST_DOWNLOAD_INVITE_MESSAGE) => {
      resetAnalysisState()
      setPendingDownloadFile(null)
      setManualJobDescription('')
      setManualJobDescriptionRequired(false)
      setManualCertificatesInput('')
      setCvFile(null)
      setSelectedTemplate((current) => canonicalizeTemplateId(current) || 'modern')
      lastAutoScoreSignatureRef.current = ''
      const inviteMessage = typeof message === 'string' ? message.trim() : ''
      if (inviteMessage) {
        setQueuedMessage(inviteMessage)
      }
    },
    [resetAnalysisState]
  )
  const improvementLockRef = useRef(false)
  const scoreUpdateLockRef = useRef(false)
  const pendingImprovementRescoreRef = useRef([])
  const autoPreviewSignatureRef = useRef('')
  const lastAutoScoreSignatureRef = useRef('')
  const manualJobDescriptionRef = useRef(null)
  const cvInputRef = useRef(null)
  const analysisContextRef = useRef({ hasAnalysis: false, cvSignature: '', jobSignature: '', jobId: '' })
  const cvSignatureRef = useRef('')
  const jobSignatureRef = useRef('')
  const [localUserId] = useState(() => getOrCreateUserId())
  const userIdentifier = useMemo(
    () => deriveUserIdentifier({ userId: localUserId }),
    [localUserId]
  )

  const currentCvSignature = useMemo(() => {
    if (!cvFile) {
      return ''
    }
    const name = typeof cvFile.name === 'string' ? cvFile.name : ''
    const lastModified = typeof cvFile.lastModified === 'number' ? cvFile.lastModified : 0
    return `${name}|${lastModified}`
  }, [cvFile])

  const currentJobSignature = useMemo(() => {
    if (manualJobDescriptionValue && !manualJobDescriptionLooksLikeUrl) {
      return `manual:${manualJobDescriptionValue}`
    }
    return ''
  }, [manualJobDescriptionLooksLikeUrl, manualJobDescriptionValue])

  const hasMatch = Boolean(match)
  const hasCvFile = Boolean(cvFile)
  const hasManualJobDescriptionInput = Boolean(
    manualJobDescriptionValue && !manualJobDescriptionLooksLikeUrl
  )
  const improvementCount = improvementResults.length
  const downloadCount = outputFiles.length
  const downloadsReady = artifactsUploaded && downloadCount > 0
  const visibleDownloadCount = downloadsReady ? downloadCount : 0
  const downloadSuccessCount = useMemo(
    () => {
      if (!downloadsReady || !downloadStates || typeof downloadStates !== 'object') {
        return 0
      }
      return Object.values(downloadStates).reduce((count, state) => {
        if (!state || typeof state !== 'object') {
          return count
        }
        return state.status === 'completed' ? count + 1 : count
      }, 0)
    },
    [downloadStates, downloadsReady]
  )
  const changeCount = changeLog.length
  const scoreMetricCount = scoreBreakdown.length
  const scoreDashboardReady = scoreMetricCount > 0
  const hasFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value)
  const matchHasAtsScore =
    hasFiniteNumber(match?.originalScore) ||
    hasFiniteNumber(match?.scoreBefore) ||
    hasFiniteNumber(match?.atsScoreBefore) ||
    hasFiniteNumber(match?.score) ||
    hasFiniteNumber(match?.atsScore) ||
    hasFiniteNumber(match?.enhancedScore) ||
    hasFiniteNumber(match?.scoreAfter) ||
    hasFiniteNumber(match?.atsScoreAfter)
  const matchHasSelectionProbability =
    hasFiniteNumber(match?.selectionProbabilityBefore) ||
    hasFiniteNumber(match?.selectionProbabilityAfter) ||
    hasFiniteNumber(match?.selectionProbability) ||
    hasFiniteNumber(match?.selectionProbabilityDelta)
  const scoreDashboardHasContent =
    scoreDashboardReady || matchHasAtsScore || matchHasSelectionProbability
  const queuedText = typeof queuedMessage === 'string' ? queuedMessage.trim() : ''
  const hasAnalysisData =
    scoreMetricCount > 0 ||
    hasMatch ||
    improvementCount > 0 ||
    visibleDownloadCount > 0 ||
    changeCount > 0
  const uploadReady = hasCvFile && hasManualJobDescriptionInput
  const uploadComplete =
    uploadReady ||
    (hasManualJobDescriptionInput && (hasAnalysisData || Boolean(queuedText)))
  const scoreComplete = scoreMetricCount > 0
  const jdValidationComplete = Boolean(jobDescriptionText && jobDescriptionText.trim())
  const improvementsUnlocked = uploadComplete && scoreComplete && jdValidationComplete
  const improvementUnlockMessage = !uploadComplete
    ? 'Complete Step 1 by uploading your resume and JD to unlock scoring.'
    : !scoreComplete
      ? 'Finish Step 2 — we’re still calculating your ATS metrics.'
      : !jdValidationComplete
        ? 'Job description validation is still in progress. Please wait until it completes.'
        : ''
  const improvementBusy = Boolean(activeImprovement)
  const improvementAvailable =
    improvementsUnlocked &&
    Boolean(resumeText && resumeText.trim()) &&
    Boolean(jobDescriptionText && jobDescriptionText.trim())
  const acceptedImprovements = useMemo(
    () => improvementResults.filter((item) => item.accepted === true),
    [improvementResults]
  )
  const hasAcceptedImprovement = acceptedImprovements.length > 0
  const acceptedImprovementsValidated = useMemo(
    () => acceptedImprovements.every((item) => improvementValidationPassed(item.validation)),
    [acceptedImprovements]
  )
  const hasPendingImprovementRescore = useMemo(
    () => acceptedImprovements.some((item) => item.rescorePending),
    [acceptedImprovements]
  )
  const hasPendingImprovementDecisions = useMemo(
    () => improvementResults.some((item) => item.accepted === null),
    [improvementResults]
  )
  const improvementsRequireAcceptance = useMemo(
    () => improvementResults.length > 0,
    [improvementResults]
  )
  const canGenerateEnhancedDocs = useMemo(
    () =>
      !improvementsRequireAcceptance ||
      (hasAcceptedImprovement && acceptedImprovementsValidated),
    [improvementsRequireAcceptance, hasAcceptedImprovement, acceptedImprovementsValidated]
  )

  const formattedCvFileSize = useMemo(() => {
    if (!cvFile || typeof cvFile.size !== 'number' || Number.isNaN(cvFile.size)) {
      return ''
    }
    const bytes = cvFile.size
    if (bytes <= 0) {
      return '0 B'
    }
    const units = ['B', 'KB', 'MB', 'GB']
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
    const size = bytes / Math.pow(1024, exponent)
    const formattedValue = size >= 10 || exponent === 0 ? size.toFixed(0) : size.toFixed(1)
    return `${formattedValue} ${units[exponent]}`
  }, [cvFile])

  const uploadStatusDetail = useMemo(() => {
    const uploadStageError =
      typeof stageErrors?.upload === 'string' ? stageErrors.upload.trim() : ''
    if (uploadStageError) {
      return {
        label: uploadStageError,
        badgeClass:
          'border-rose-200/80 bg-rose-50/80 text-rose-600'
      }
    }
    if (error && !uploadStageError) {
      return {
        label: error,
        badgeClass:
          'border-rose-200/80 bg-rose-50/80 text-rose-600'
      }
    }
    if (isProcessing) {
      return {
        label: 'Uploading and scoring in progress…',
        badgeClass:
          'border-amber-200/80 bg-amber-50/80 text-amber-700'
      }
    }
    if (queuedText) {
      return {
        label: queuedText,
        badgeClass:
          'border-sky-200/80 bg-sky-50/80 text-sky-700'
      }
    }
    if (uploadReady) {
      return {
        label: 'Resume and JD ready — run ATS scoring when you are set.',
        badgeClass:
          'border-emerald-200/80 bg-emerald-50/80 text-emerald-700'
      }
    }
    if (hasCvFile && !hasManualJobDescriptionInput) {
      return {
        label: 'Must paste JD',
        badgeClass:
          'border-amber-200/80 bg-amber-50/80 text-amber-700'
      }
    }
    if (hasCvFile) {
      return {
        label: 'Resume uploaded and waiting for ATS scoring.',
        badgeClass:
          'border-purple-200/80 bg-white/80 text-purple-600'
      }
    }
    return {
      label: 'No resume selected. Drag & drop or browse to upload.',
      badgeClass:
        'border-slate-200/80 bg-white/80 text-slate-600'
    }
  }, [
    error,
    hasCvFile,
    hasManualJobDescriptionInput,
    isProcessing,
    queuedText,
    uploadReady,
    stageErrors
  ])

  const uploadStatusMessage = useMemo(() => {
    if (isProcessing) {
      return 'Uploading and scoring your resume…'
    }
    if (!cvFile) {
      return 'Drag & drop a file or browse to upload. Supported formats: PDF, DOC, or DOCX (max 5 MB).'
    }
    if (!hasManualJobDescriptionInput) {
      return 'Must paste JD to unlock ATS scoring.'
    }
    if (!scoreMetricCount) {
      return 'Resume and JD ready — we’ll generate your ATS breakdown automatically.'
    }
    return 'Resume and JD uploaded. You can rerun ATS scoring at any time from the Score stage.'
  }, [cvFile, hasManualJobDescriptionInput, isProcessing, scoreMetricCount])

  useEffect(() => {
    cvSignatureRef.current = currentCvSignature
  }, [currentCvSignature])

  useEffect(() => {
    jobSignatureRef.current = currentJobSignature
  }, [currentJobSignature])
  const improvementActionMap = useMemo(() => {
    const map = new Map()
    improvementActions.forEach((action) => {
      map.set(action.key, action)
    })
    return map
  }, [])
  const metricImprovementActionMap = useMemo(() => {
    const map = new Map()
    METRIC_IMPROVEMENT_PRESETS.forEach((preset) => {
      const base = improvementActionMap.get(preset.actionKey) || {}
      map.set(preset.category, {
        actionKey: preset.actionKey,
        label: preset.label || base.label || 'Improve this area',
        helper: preset.helper || base.helper || ''
      })
    })
    return map
  }, [improvementActionMap])
  const metricImprovementState = useMemo(
    () => ({
      activeKey: activeImprovement,
      activeBatchKeys: activeImprovementBatchKeys,
      locked: !improvementsUnlocked,
      lockMessage: improvementsUnlocked ? '' : improvementUnlockMessage
    }),
    [
      activeImprovement,
      activeImprovementBatchKeys,
      improvementUnlockMessage,
      improvementsUnlocked
    ]
  )
  const improvementButtonsDisabled =
    isProcessing || improvementBusy || isBulkAccepting || !improvementsUnlocked
  const improveSkillsAction = improvementActionMap.get('add-missing-skills') || {
    label: 'Improve Skills',
    helper: 'Blend missing keywords into the right sections to lift your ATS alignment.'
  }
  const improveCertificationsAction = improvementActionMap.get('improve-certifications') || {
    label: 'Improve Certifications',
    helper: 'Highlight the certifications that strengthen your case for this role.'
  }

  const resumeExperienceMissing = useMemo(() => {
    const experience = selectionInsights?.experience || null
    const message = typeof experience?.message === 'string' ? experience.message : ''
    const rawStatus = typeof experience?.status === 'string' ? experience.status : ''
    const status = rawStatus.toLowerCase()
    const candidateYears =
      typeof experience?.candidateYears === 'number' && Number.isFinite(experience.candidateYears)
        ? experience.candidateYears
        : null
    const placeholderDetected =
      typeof resumeText === 'string' &&
      /work experience[\s\S]{0,200}information not provided/i.test(resumeText)

    if (placeholderDetected) {
      return true
    }

    if (message && /not detected/i.test(message)) {
      return true
    }

    if ((status === 'gap' || status === 'unknown') && (candidateYears === null || candidateYears <= 0)) {
      return true
    }

    return false
  }, [selectionInsights, resumeText])

  const coverLetterContentMissing = useMemo(() => {
    if (!Array.isArray(outputFiles) || outputFiles.length === 0) {
      return false
    }

    const hasCoverLetterFiles = outputFiles.some((file) => isCoverLetterType(file?.type))
    if (!hasCoverLetterFiles) {
      return false
    }

    const coverLetterTypes = Array.from(COVER_LETTER_TYPES)
    const hasContent = coverLetterTypes.some((type) => {
      const draftValue = typeof coverLetterDrafts?.[type] === 'string' ? coverLetterDrafts[type].trim() : ''
      if (draftValue) {
        return true
      }
      const originalValue =
        typeof coverLetterOriginals?.[type] === 'string' ? coverLetterOriginals[type].trim() : ''
      return Boolean(originalValue)
    })

    return !hasContent
  }, [coverLetterDrafts, coverLetterOriginals, outputFiles])

  useEffect(() => {
    if (!userIdentifier) {
      return
    }
    const storedTemplate = canonicalizeTemplateId(
      getStoredTemplatePreference(userIdentifier)
    )
    if (!storedTemplate) {
      return
    }
    setSelectedTemplate((current) => {
      const canonicalCurrent = canonicalizeTemplateId(current)
      if (canonicalCurrent === storedTemplate) {
        return current
      }
      return storedTemplate
    })
    setTemplateContext((prev) => {
      if (!prev || typeof prev !== 'object') {
        return prev
      }
      const currentCanonical = canonicalizeTemplateId(
        prev.selectedTemplate || prev.template1
      )
      if (currentCanonical === storedTemplate) {
        return prev
      }
      const base = { ...prev }
      base.selectedTemplate = storedTemplate
      if (!base.template1) {
        base.template1 = storedTemplate
      }
      const shouldLinkCover = base.coverTemplateLinkedToResume !== false
      const nextContext = ensureCoverTemplateContext(base, storedTemplate, {
        linkCoverToResume: shouldLinkCover
      })
      return decorateTemplateContext(nextContext)
    })
  }, [userIdentifier])

  useEffect(() => {
    if (!userIdentifier) {
      return
    }
    const canonicalSelection = canonicalizeTemplateId(selectedTemplate)
    if (!canonicalSelection) {
      return
    }
    setStoredTemplatePreference(userIdentifier, canonicalSelection)
  }, [selectedTemplate, userIdentifier])

  useEffect(() => {
    if (!cvFile) {
      return
    }
    if (manualJobDescriptionValue && !manualJobDescriptionLooksLikeUrl) {
      return
    }
    setManualJobDescriptionRequired((prev) => {
      if (!prev) {
        manualJobDescriptionRef.current?.focus?.()
      }
      return true
    })
  }, [cvFile, manualJobDescriptionLooksLikeUrl, manualJobDescriptionValue])

  useEffect(() => {
    if (
      manualJobDescriptionRequired &&
      manualJobDescriptionValue &&
      !manualJobDescriptionLooksLikeUrl &&
      !manualJobDescriptionHasProhibitedHtml
    ) {
      setManualJobDescriptionRequired(false)
    }
  }, [
    manualJobDescriptionLooksLikeUrl,
    manualJobDescriptionRequired,
    manualJobDescriptionValue,
    manualJobDescriptionHasProhibitedHtml
  ])

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

  const selectedTemplateOption = useMemo(() => {
    if (!availableTemplateOptions.length) return null
    const canonical = canonicalizeTemplateId(selectedTemplate)
    return (
      availableTemplateOptions.find((option) => option.id === canonical) ||
      availableTemplateOptions.find((option) => option.id === selectedTemplate) ||
      null
    )
  }, [availableTemplateOptions, selectedTemplate])

  const isCoverTemplateLinkedToResume = useMemo(
    () => templateContext?.coverTemplateLinkedToResume !== false,
    [templateContext]
  )

  const selectedCoverTemplate = useMemo(() => {
    const fromContext = canonicalizeCoverTemplateId(templateContext?.coverTemplate1)
    if (fromContext) {
      return fromContext
    }
    return deriveCoverTemplateFromResume(selectedTemplate || DEFAULT_COVER_TEMPLATE)
  }, [selectedTemplate, templateContext])

  const availableCoverTemplateOptions = useMemo(() => {
    const registry = new Map(COVER_TEMPLATE_OPTIONS.map((option) => [option.id, option]))
    const extras = []
    const register = (value) => {
      const canonical = canonicalizeCoverTemplateId(value)
      if (!canonical || registry.has(canonical)) {
        return
      }
      const option = {
        id: canonical,
        name: formatCoverTemplateName(canonical),
        description:
          getCoverTemplateDescription(canonical) ||
          'Imported cover letter template from your previous session.'
      }
      registry.set(canonical, option)
      extras.push(option)
    }

    const templateCandidates = Array.isArray(templateContext?.coverTemplates)
      ? templateContext.coverTemplates
      : []
    templateCandidates.forEach(register)
    register(templateContext?.coverTemplate1)
    register(templateContext?.coverTemplate2)
    register(selectedCoverTemplate)
    register(deriveCoverTemplateFromResume(selectedTemplate || DEFAULT_COVER_TEMPLATE))

    return [...COVER_TEMPLATE_OPTIONS, ...extras]
  }, [templateContext, selectedCoverTemplate, selectedTemplate])

  const downloadTemplateMetadata = useMemo(() => {
    const canonicalPrimaryTemplate =
      canonicalizeTemplateId(templateContext?.template1) ||
      canonicalizeTemplateId(templateContext?.selectedTemplate) ||
      canonicalizeTemplateId(selectedTemplate) ||
      'modern'

    const templateCandidates = Array.isArray(templateContext?.templates)
      ? templateContext.templates.map((tpl) => canonicalizeTemplateId(tpl)).filter(Boolean)
      : []

    const canonicalSecondaryTemplateRaw = canonicalizeTemplateId(templateContext?.template2)
    const canonicalSecondaryTemplate =
      canonicalSecondaryTemplateRaw ||
      templateCandidates.find((tpl) => tpl && tpl !== canonicalPrimaryTemplate) ||
      canonicalPrimaryTemplate

    const derivedCoverFallback = deriveCoverTemplateFromResume(canonicalPrimaryTemplate)
    const canonicalCoverPrimaryTemplate = canonicalizeCoverTemplateId(
      templateContext?.coverTemplate1,
      derivedCoverFallback
    )

    const coverTemplateCandidates = normalizeCoverTemplateList(templateContext?.coverTemplates)
    let canonicalCoverSecondaryTemplate = canonicalizeCoverTemplateId(
      templateContext?.coverTemplate2
    )
    if (
      !canonicalCoverSecondaryTemplate ||
      canonicalCoverSecondaryTemplate === canonicalCoverPrimaryTemplate
    ) {
      canonicalCoverSecondaryTemplate =
        coverTemplateCandidates.find((tpl) => tpl !== canonicalCoverPrimaryTemplate) ||
        COVER_TEMPLATE_IDS.find((tpl) => tpl !== canonicalCoverPrimaryTemplate) ||
        canonicalCoverPrimaryTemplate ||
        derivedCoverFallback
    }

    const resolvedCoverPrimary =
      canonicalCoverPrimaryTemplate || derivedCoverFallback || DEFAULT_COVER_TEMPLATE
    const resolvedCoverSecondary =
      canonicalCoverSecondaryTemplate || resolvedCoverPrimary || DEFAULT_COVER_TEMPLATE

    const resumeMetadata =
      (templateContext && typeof templateContext === 'object'
        ? templateContext.templateMetadata?.resume
        : null) || {}
    const coverMetadata =
      (templateContext && typeof templateContext === 'object'
        ? templateContext.templateMetadata?.cover
        : null) || {}

    const pickResumeName = (entry, fallbackId) => {
      const fallbackName = fallbackId ? formatTemplateName(fallbackId) : ''
      return (
        (entry && typeof entry.templateName === 'string' && entry.templateName.trim()) ||
        fallbackName
      )
    }

    const pickResumeLabel = (entry, fallbackId) => {
      const fallbackName = fallbackId ? formatTemplateName(fallbackId) : ''
      const fallbackLabel = fallbackName ? `${fallbackName} Resume` : 'Resume Template'
      return (
        (entry && typeof entry.templateLabel === 'string' && entry.templateLabel.trim()) ||
        fallbackLabel
      )
    }

    const pickCoverName = (entry, fallbackId) => {
      const fallbackName = fallbackId ? formatCoverTemplateName(fallbackId) : 'Cover Letter'
      return (
        (entry && typeof entry.templateName === 'string' && entry.templateName.trim()) ||
        fallbackName
      )
    }

    const pickCoverLabel = (entry, fallbackId) => {
      const fallbackName = fallbackId ? formatCoverTemplateName(fallbackId) : 'Cover Letter'
      return (
        (entry && typeof entry.templateLabel === 'string' && entry.templateLabel.trim()) ||
        fallbackName
      )
    }

    return {
      original_upload: { id: 'original', name: 'Original Upload', label: 'Original Upload' },
      original_upload_pdf: {
        id: 'original_pdf',
        name: 'Original Upload (Plain PDF)',
        label: 'Original Upload (Plain PDF)'
      },
      version1: {
        id: canonicalPrimaryTemplate,
        name: pickResumeName(resumeMetadata.primary, canonicalPrimaryTemplate),
        label: pickResumeLabel(resumeMetadata.primary, canonicalPrimaryTemplate)
      },
      version2: {
        id: canonicalSecondaryTemplate,
        name: pickResumeName(resumeMetadata.secondary, canonicalSecondaryTemplate),
        label: pickResumeLabel(resumeMetadata.secondary, canonicalSecondaryTemplate)
      },
      cover_letter1: {
        id: resolvedCoverPrimary,
        name: pickCoverName(coverMetadata.primary, resolvedCoverPrimary),
        label: pickCoverLabel(coverMetadata.primary, resolvedCoverPrimary)
      },
      cover_letter2: {
        id: resolvedCoverSecondary,
        name: pickCoverName(coverMetadata.secondary, resolvedCoverSecondary),
        label: pickCoverLabel(coverMetadata.secondary, resolvedCoverSecondary)
      }
    }
  }, [selectedTemplate, templateContext])

  const downloadTemplateSummaryMessage = useMemo(() => {
    const metadata =
      templateContext && typeof templateContext === 'object'
        ? templateContext.templateMetadata || {}
        : {}
    const resumeMetadata =
      (metadata && typeof metadata === 'object' ? metadata.resume : null) || {}
    const selectedResumeMeta =
      (resumeMetadata && typeof resumeMetadata === 'object'
        ? resumeMetadata.selected || resumeMetadata.primary
        : null) || null
    const canonicalSelected =
      canonicalizeTemplateId(selectedResumeMeta?.templateId) ||
      canonicalizeTemplateId(
        templateContext && typeof templateContext === 'object'
          ? templateContext.selectedTemplate
          : ''
      ) ||
      canonicalizeTemplateId(
        templateContext && typeof templateContext === 'object'
          ? templateContext.template1
          : ''
      ) ||
      canonicalizeTemplateId(selectedTemplate) ||
      ''
    const baseName =
      (selectedResumeMeta &&
        typeof selectedResumeMeta.templateLabel === 'string' &&
        selectedResumeMeta.templateLabel.trim()) ||
      (selectedResumeMeta &&
        typeof selectedResumeMeta.templateName === 'string' &&
        selectedResumeMeta.templateName.trim()) ||
      (canonicalSelected ? `${formatTemplateName(canonicalSelected)} Resume` : '')
    if (!baseName && !canonicalSelected) {
      return ''
    }
    const badgeSource =
      (selectedResumeMeta &&
        typeof selectedResumeMeta.templateId === 'string' &&
        selectedResumeMeta.templateId.trim()) ||
      canonicalSelected ||
      ''
    if (badgeSource) {
      return `You chose: ${baseName} (${badgeSource})`
    }
    return `You chose: ${baseName}`
  }, [selectedTemplate, templateContext])

  const templateHistorySummary = useMemo(() => {
    const baseHistory = Array.isArray(templateContext?.templateHistory)
      ? templateContext.templateHistory
        .map((item) => canonicalizeTemplateId(item))
        .filter(Boolean)
      : []
    if (!baseHistory.length) {
      return ''
    }
    const history = [...baseHistory]
    const prioritize = (value) => {
      const canonical = canonicalizeTemplateId(value)
      if (!canonical) return
      const index = history.indexOf(canonical)
      if (index >= 0) {
        history.splice(index, 1)
      }
      history.unshift(canonical)
    }
    prioritize(templateContext?.selectedTemplate)
    prioritize(selectedTemplate)
    prioritize(templateContext?.template1)
    prioritize(templateContext?.template2)

    const labels = history
      .map((tpl) => formatTemplateName(tpl))
      .filter(Boolean)

    if (labels.length <= 1) {
      return ''
    }

    return formatReadableList(labels)
  }, [selectedTemplate, templateContext])

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
        const currentHistory = Array.isArray(prev?.templateHistory)
          ? prev.templateHistory
            .map((item) => canonicalizeTemplateId(item))
            .filter(Boolean)
          : []
        if (!currentHistory.includes(canonical)) {
          base.templateHistory = [canonical, ...currentHistory]
        } else {
          const filteredHistory = currentHistory.filter((item) => item !== canonical)
          base.templateHistory = [canonical, ...filteredHistory]
        }
        const shouldLinkCover = base.coverTemplateLinkedToResume !== false
        const nextContext = ensureCoverTemplateContext(base, canonical, {
          linkCoverToResume: shouldLinkCover
        })
        return decorateTemplateContext(nextContext)
      })
    },
    [setTemplateContext]
  )

  const handleCoverTemplateSelect = useCallback(
    (templateId) => {
      const canonical = canonicalizeCoverTemplateId(templateId, DEFAULT_COVER_TEMPLATE)
      setTemplateContext((prev) => {
        const base = prev ? { ...prev } : {}
        base.coverTemplate1 = canonical
        const existing = normalizeCoverTemplateList(base.coverTemplates)
        const nextTemplates = normalizeCoverTemplateList([canonical, ...existing])
        base.coverTemplates = nextTemplates
        const secondary = canonicalizeCoverTemplateId(base.coverTemplate2)
        if (!secondary || secondary === canonical) {
          const fallback =
            nextTemplates.find((tpl) => tpl !== canonical) ||
            COVER_TEMPLATE_IDS.find((tpl) => tpl !== canonical) ||
            DEFAULT_COVER_TEMPLATE
          base.coverTemplate2 = fallback
        } else {
          base.coverTemplate2 = secondary
        }
        const resumeTemplateForContext =
          base.selectedTemplate || base.template1 || selectedTemplate || 'modern'
        const derivedForResume = deriveCoverTemplateFromResume(resumeTemplateForContext)
        const wasLinked = base.coverTemplateLinkedToResume !== false
        const shouldStayLinked = wasLinked && canonical === derivedForResume
        base.coverTemplateLinkedToResume = shouldStayLinked ? true : false
        const nextContext = ensureCoverTemplateContext(base, resumeTemplateForContext, {
          linkCoverToResume: shouldStayLinked
        })
        return decorateTemplateContext(nextContext)
      })
    },
    [selectedTemplate, setTemplateContext]
  )

  const handleCoverLinkToggle = useCallback(
    (shouldLink) => {
      setTemplateContext((prev) => {
        const base = prev ? { ...prev } : {}
        base.coverTemplateLinkedToResume = shouldLink
        const resumeTemplateForContext =
          base.selectedTemplate || base.template1 || selectedTemplate || 'modern'
        if (shouldLink) {
          base.coverTemplate1 = deriveCoverTemplateFromResume(resumeTemplateForContext)
        }
        const nextContext = ensureCoverTemplateContext(
          base,
          resumeTemplateForContext,
          { linkCoverToResume: shouldLink }
        )
        return decorateTemplateContext(nextContext)
      })
    },
    [selectedTemplate, setTemplateContext]
  )

  const flowSteps = useMemo(() => {
    const generationComplete = downloadsReady
    const downloadComplete = generationComplete && downloadSuccessCount > 0
    const normalizedErrorMessage = typeof error === 'string' ? error.trim() : ''
    const normalizedErrorCode =
      typeof errorContext?.code === 'string'
        ? errorContext.code.trim().toUpperCase()
        : ''
    const normalizedErrorSource = normalizeServiceSource(errorContext?.source)
    const stageErrorMap =
      stageErrors && typeof stageErrors === 'object' ? stageErrors : createStageErrorState()
    let errorStep = ''
    if (normalizedErrorMessage) {
      if (normalizedErrorCode && SERVICE_ERROR_STEP_BY_CODE[normalizedErrorCode]) {
        errorStep = SERVICE_ERROR_STEP_BY_CODE[normalizedErrorCode]
      } else if (
        normalizedErrorSource &&
        SERVICE_ERROR_STEP_BY_SOURCE[normalizedErrorSource]
      ) {
        errorStep = SERVICE_ERROR_STEP_BY_SOURCE[normalizedErrorSource]
      }
    }

    const baseSteps = [
      {
        key: 'upload',
        label: 'Upload',
        description: 'Attach your CV and target JD so we can start analysing.'
      },
      {
        key: 'score',
        label: 'Score',
        description: 'Review the ATS breakdown and baseline selection chances.'
      },
      {
        key: 'enhance',
        label: 'Enhance',
        description: 'Apply targeted rewrites once you understand the current scores.'
      },
      {
        key: 'generate',
        label: 'Generate',
        description: 'Produce polished CVs and cover letters tailored to the JD.'
      },
      {
        key: 'download',
        label: 'Download',
        description: 'Grab the upgraded CVs and tailored cover letters.'
      }
    ]

    let currentAssigned = false

    return baseSteps.map((step) => {
      const availability =
        step.key === 'upload'
          ? true
          : step.key === 'score'
            ? uploadComplete
            : step.key === 'enhance'
              ? improvementsUnlocked
              : step.key === 'generate'
                ? improvementsUnlocked && canGenerateEnhancedDocs
                : step.key === 'download'
                  ? generationComplete
                  : false

      const isComplete =
        step.key === 'upload'
          ? uploadComplete
          : step.key === 'score'
            ? scoreComplete
            : step.key === 'enhance'
              ? canGenerateEnhancedDocs
              : step.key === 'generate'
                ? generationComplete
                : step.key === 'download'
                  ? downloadComplete
                  : false

      let status = 'upcoming'
      if (isComplete) {
        status = 'complete'
      } else if (!currentAssigned && availability) {
        status = 'current'
        currentAssigned = true
      }

      let note = ''
      let noteTone = ''
      switch (step.key) {
        case 'upload':
          if (!uploadComplete) {
            if (!hasCvFile) {
              note = 'Waiting for your resume upload.'
              noteTone = 'info'
            } else if (!hasManualJobDescriptionInput) {
              note = 'Must paste JD'
              noteTone = 'warning'
            } else {
              note = 'Ready to submit for scoring.'
              noteTone = 'info'
            }
          } else if (isProcessing && !hasAnalysisData) {
            note = 'Uploading & parsing your documents…'
            noteTone = 'info'
          } else if (queuedText) {
            note = queuedText
            noteTone = 'info'
          } else if (hasAnalysisData) {
            note = 'Upload complete.'
            noteTone = 'success'
          }
          break
        case 'score':
          if (isProcessing && !scoreComplete) {
            note = 'Scanning resume against the JD…'
            noteTone = 'info'
          } else if (resumeExperienceMissing) {
            const prefix = scoreComplete ? 'ATS dashboard ready. ' : ''
            note = `${prefix}Experience section missing, would you like to auto-generate?`
            noteTone = 'warning'
          } else if (scoreComplete) {
            note = 'ATS dashboard ready.'
            noteTone = 'success'
          } else if (hasAnalysisData) {
            note = 'Waiting for ATS metrics…'
            noteTone = 'info'
          }
          break
        case 'enhance':
          if (!improvementsUnlocked) {
            note = 'Waiting for ATS validation before unlocking enhancements.'
            noteTone = 'info'
          } else if (improvementBusy) {
            note = 'Generating AI rewrite…'
            noteTone = 'info'
          } else if (resumeExperienceMissing) {
            const suggestionText =
              improvementCount > 0
                ? ` ${improvementCount} suggestion${improvementCount === 1 ? '' : 's'} ready.`
                : ''
            note = `Experience section missing, would you like to auto-generate?${suggestionText}`
            noteTone = 'warning'
          } else if (improvementCount > 0) {
            note = `${improvementCount} suggestion${improvementCount === 1 ? '' : 's'} ready.`
            noteTone = 'info'
          } else if (improvementsUnlocked) {
            note = 'Enhancement options ready when you need them.'
            noteTone = 'info'
          }
          break
        case 'generate':
          if (generationComplete) {
            note = `${visibleDownloadCount} file${visibleDownloadCount === 1 ? '' : 's'} generated.`
            noteTone = 'success'
          } else if (isGeneratingDocs) {
            note = 'Generating enhanced documents…'
            noteTone = 'info'
          } else if (
            improvementsRequireAcceptance &&
            improvementsUnlocked &&
            (!hasAcceptedImprovement || !acceptedImprovementsValidated)
          ) {
            note = acceptedImprovementsValidated
              ? 'Accept improvements before generating downloads.'
              : 'Review JD alignment on accepted improvements before generating downloads.'
            noteTone = 'warning'
          } else if (coverLetterContentMissing) {
            note =
              'Cover letter drafts are blank — open a template to auto-generate personalised text before generating downloads.'
            noteTone = 'warning'
          } else if (improvementsUnlocked && canGenerateEnhancedDocs) {
            note = 'Generate tailored CVs and cover letters when you are ready.'
            noteTone = 'info'
          }
          break
        case 'download':
          if (downloadSuccessCount > 0) {
            note = `${downloadSuccessCount} file${downloadSuccessCount === 1 ? '' : 's'} downloaded.`
            noteTone = 'success'
          } else if (generationComplete) {
            if (coverLetterContentMissing) {
              note =
                'Cover letter drafts are blank — open a template to auto-generate personalised text before downloading.'
              noteTone = 'warning'
            } else {
              note = `${visibleDownloadCount} file${visibleDownloadCount === 1 ? '' : 's'} available.`
              noteTone = 'info'
            }
          } else if (improvementsUnlocked && canGenerateEnhancedDocs) {
            note = 'Generate the latest documents to unlock downloads.'
            noteTone = 'info'
          }
          break
        default:
          break
      }

      if (note && !noteTone) {
        noteTone = 'info'
      }

      const stageErrorValue = (() => {
        const raw = stageErrorMap?.[step.key]
        return typeof raw === 'string' ? raw.trim() : ''
      })()
      const hasStageError = Boolean(stageErrorValue)
      const isErrorForStage = Boolean(
        !hasStageError && errorStep && normalizedErrorMessage && errorStep === step.key
      )

      if (hasStageError) {
        note = stageErrorValue
        noteTone = 'warning'
      } else if (isErrorForStage) {
        note = normalizedErrorMessage
        noteTone = 'warning'
      }

      const isActiveStage = status === 'current'

      if (!isActiveStage && !hasStageError && !isErrorForStage) {
        note = ''
        noteTone = ''
      }

      return { ...step, status, note, noteTone }
    })
  }, [
    changeCount,
    canGenerateEnhancedDocs,
    coverLetterContentMissing,
    acceptedImprovementsValidated,
    downloadsReady,
    error,
    errorContext,
    stageErrors,
    hasAnalysisData,
    hasCvFile,
    hasManualJobDescriptionInput,
    hasAcceptedImprovement,
    improvementBusy,
    improvementCount,
    improvementsRequireAcceptance,
    improvementsUnlocked,
    isProcessing,
    isGeneratingDocs,
    queuedText,
    resumeExperienceMissing,
    scoreComplete,
    uploadComplete,
    visibleDownloadCount,
    downloadSuccessCount
  ])

  const currentPhase = useMemo(() => {
    const currentStep = flowSteps.find((step) => step.status === 'current')
    if (currentStep) {
      return currentStep.key
    }
    const completedSteps = flowSteps.filter((step) => step.status === 'complete')
    if (completedSteps.length > 0) {
      return completedSteps[completedSteps.length - 1].key
    }
    return 'upload'
  }, [flowSteps])

  const handleExportErrorLog = useCallback(() => {
    if (!error) {
      return
    }
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      setQueuedMessage('Error log export is not supported in this environment.')
      return
    }

    try {
      const normalizedSource = normalizeServiceSource(errorContext?.source)
      const downloadStateSnapshot = Object.entries(downloadStates || {}).reduce(
        (acc, [key, value = {}]) => {
          const stateStatus = typeof value?.status === 'string' ? value.status : ''
          const stateError = typeof value?.error === 'string' ? value.error : ''
          if (stateStatus || stateError) {
            acc[key] = {
              status: stateStatus,
              error: stateError
            }
          }
          return acc
        },
        {}
      )

      const flowSnapshot = Array.isArray(flowSteps)
        ? flowSteps.map((step) => ({
          key: step.key,
          status: step.status,
          note: step.note || '',
          noteTone: step.noteTone || ''
        }))
        : []

      const stageErrorSnapshot = Object.entries(stageErrors || {}).reduce(
        (acc, [key, value]) => {
          if (typeof value === 'string') {
            const trimmed = value.trim()
            if (trimmed) {
              acc[key] = trimmed
            }
          }
          return acc
        },
        {}
      )

      const navigatorInfo = typeof navigator === 'object' && navigator
        ? {
          userAgent: typeof navigator.userAgent === 'string' ? navigator.userAgent : '',
          language: typeof navigator.language === 'string' ? navigator.language : '',
          platform: typeof navigator.platform === 'string' ? navigator.platform : ''
        }
        : {
          userAgent: '',
          language: '',
          platform: ''
        }

      const payload = {
        timestamp: new Date().toISOString(),
        message: error,
        recovery: errorRecovery || '',
        errorCode: typeof errorContext?.code === 'string' ? errorContext.code : '',
        errorSource: normalizedSource || '',
        jobId: jobId || '',
        requestId:
          typeof errorContext?.requestId === 'string' ? errorContext.requestId : '',
        currentPhase,
        activeDashboardStage,
        isProcessing,
        hasCvFile,
        hasManualJobDescriptionInput,
        queuedMessage,
        logs: errorLogs.length ? errorLogs : undefined,
        downloadStates: Object.keys(downloadStateSnapshot).length
          ? downloadStateSnapshot
          : undefined,
        stageErrors: Object.keys(stageErrorSnapshot).length
          ? stageErrorSnapshot
          : undefined,
        flow: flowSnapshot,
        environment: navigatorInfo
      }

      const json = JSON.stringify(payload, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const link = document.createElement('a')
      link.href = url
      link.download = `resumeforge-error-${stamp}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setTimeout(() => {
        URL.revokeObjectURL(url)
      }, 1000)
    } catch (err) {
      console.error('Error log export failed', err)
      setQueuedMessage('Unable to export the error log. Please try again.')
    }
  }, [
    activeDashboardStage,
    currentPhase,
    downloadStates,
    error,
    errorContext,
    errorRecovery,
    errorLogs,
    flowSteps,
    hasCvFile,
    hasManualJobDescriptionInput,
    isProcessing,
    jobId,
    stageErrors,
    queuedMessage,
    setQueuedMessage
  ])

  const downloadGroups = useMemo(() => {
    if (!Array.isArray(outputFiles) || outputFiles.length === 0) {
      return { resume: [], cover: [], other: [] }
    }
    const resume = []
    const cover = []
    const other = []
    const resumeOrder = { original_upload: 0, original_upload_pdf: 1, version1: 2, version2: 3 }
    const coverOrder = { cover_letter1: 0, cover_letter2: 1 }
    outputFiles.forEach((file) => {
      if (!file || typeof file !== 'object') return
      const presentation = getDownloadPresentation(file)
      const resolvedTemplateMeta = (() => {
        if (file.templateMeta && typeof file.templateMeta === 'object') {
          const candidateName =
            typeof file.templateMeta.name === 'string'
              ? file.templateMeta.name.trim()
              : ''
          const candidateId =
            typeof file.templateMeta.id === 'string'
              ? file.templateMeta.id.trim()
              : ''
          if (candidateName || candidateId) {
            return {
              ...file.templateMeta,
              id: candidateId,
              name: candidateName ||
                (presentation.category === 'cover'
                  ? formatCoverTemplateName(candidateId)
                  : formatTemplateName(candidateId))
            }
          }
        }
        const rawTemplateId =
          (typeof file.templateId === 'string' && file.templateId.trim()) ||
          (typeof file.template === 'string' && file.template.trim()) ||
          ''
        const rawTemplateName =
          typeof file.templateName === 'string' ? file.templateName.trim() : ''
        if (rawTemplateName || rawTemplateId) {
          const derivedName =
            rawTemplateName ||
            (presentation.category === 'cover'
              ? formatCoverTemplateName(rawTemplateId)
              : formatTemplateName(rawTemplateId))
          return { id: rawTemplateId, name: derivedName }
        }
        return downloadTemplateMetadata[file.type] || null
      })()
      const entry = {
        ...file,
        presentation,
        templateMeta: resolvedTemplateMeta,
        generatedAt: file.generatedAt || downloadGeneratedAt || ''
      }
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
  }, [outputFiles, downloadTemplateMetadata, downloadGeneratedAt])

  const resumeDownloadsByTemplate = useMemo(() => {
    if (!downloadGroups.resume.length) {
      return {}
    }
    return downloadGroups.resume.reduce((acc, file) => {
      if (!file || typeof file !== 'object') {
        return acc
      }
      const templateCandidates = [
        file.templateMeta?.id,
        file.templateId,
        file.template,
        file.presentation?.templateId
      ]
      const templateId = templateCandidates
        .map((candidate) => canonicalizeTemplateId(candidate))
        .find(Boolean)
      if (!templateId) {
        return acc
      }
      const existing = acc[templateId] || []
      acc[templateId] = [...existing, file]
      return acc
    }, {})
  }, [downloadGroups.resume])

  const coverDownloadsByTemplate = useMemo(() => {
    if (!downloadGroups.cover.length) {
      return {}
    }
    return downloadGroups.cover.reduce((acc, file) => {
      if (!file || typeof file !== 'object') {
        return acc
      }
      const templateCandidates = [
        file.templateMeta?.id,
        file.coverTemplateId,
        file.templateId,
        file.template
      ]
      const templateId = templateCandidates
        .map((candidate) => canonicalizeCoverTemplateId(candidate))
        .find(Boolean)
      if (!templateId) {
        return acc
      }
      const existing = acc[templateId] || []
      acc[templateId] = [...existing, file]
      return acc
    }, {})
  }, [downloadGroups.cover])

  useEffect(() => {
    if (!Array.isArray(outputFiles) || outputFiles.length === 0) {
      setDownloadStates({})
      setIsGeneratingDocs(false)
      setIsCoverLetterDownloading(false)
      return
    }

    const now = Date.now()

    setDownloadStates((prev) => {
      const nextStates = {}

      outputFiles.forEach((file) => {
        if (!file || typeof file !== 'object') {
          return
        }
        const stateKey = getDownloadStateKey(file)
        if (!stateKey) {
          return
        }
        const downloadUrl = typeof file.url === 'string' ? file.url.trim() : ''
        const expiresAtValue =
          typeof file.expiresAt === 'string' ? file.expiresAt.trim() : ''
        const storageKey = typeof file.storageKey === 'string' ? file.storageKey.trim() : ''

        let errorMessage = ''

        if (!downloadUrl) {
          errorMessage = 'Download link unavailable. Please regenerate the document.'
        } else if (expiresAtValue) {
          const expiryDate = new Date(expiresAtValue)
          if (!Number.isNaN(expiryDate.getTime()) && expiryDate.getTime() <= now) {
            errorMessage = storageKey
              ? 'This link expired. Select Download to refresh it automatically.'
              : 'This link has expired. Regenerate the documents to refresh the download link.'
          }
        }

        const previousState = prev && typeof prev === 'object' ? prev[stateKey] : undefined
        if (previousState && previousState.status === 'completed' && !errorMessage) {
          nextStates[stateKey] = previousState
        } else {
          nextStates[stateKey] = { status: 'idle', error: errorMessage }
        }
      })

      return nextStates
    })

    setIsGeneratingDocs(false)
    setIsCoverLetterDownloading(false)
  }, [outputFiles])

  useEffect(() => {
    setCoverLetterReviewState({})
  }, [outputFiles])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }
    if (!Array.isArray(outputFiles) || outputFiles.length === 0) {
      return undefined
    }

    const parseTimestamp = (value) => {
      if (!value) return 0
      if (value instanceof Date) {
        const ms = value.getTime()
        return Number.isNaN(ms) ? 0 : ms
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value > 1e12 ? value : value * 1000
      }
      if (typeof value === 'string') {
        const trimmed = value.trim()
        if (!trimmed) {
          return 0
        }
        const numeric = Number(trimmed)
        if (Number.isFinite(numeric)) {
          return numeric > 1e12 ? numeric : numeric * 1000
        }
        const date = new Date(trimmed)
        const ms = date.getTime()
        return Number.isNaN(ms) ? 0 : ms
      }
      return 0
    }

    const pruneExpiredDownloads = () => {
      let removedAny = false
      let removedAll = false

      setOutputFiles((current) => {
        if (!Array.isArray(current) || current.length === 0) {
          return current
        }

        const now = Date.now()
        const filtered = current.filter((entry) => {
          if (!entry || typeof entry !== 'object') {
            return false
          }
          const expiresAtMs = parseTimestamp(entry.expiresAt)
          if (expiresAtMs) {
            return expiresAtMs > now
          }
          const generatedAtMs = parseTimestamp(entry.generatedAt)
          if (generatedAtMs) {
            return generatedAtMs + DOWNLOAD_SESSION_RETENTION_MS > now
          }
          return true
        })

        if (filtered.length === current.length) {
          return current
        }

        removedAny = true
        if (filtered.length === 0) {
          removedAll = true
        }

        return filtered
      })

      if (removedAny && removedAll) {
        setDownloadGeneratedAt('')
        setPreviewFile(null)
        setPendingDownloadFile(null)
        setQueuedMessage(DOWNLOAD_SESSION_EXPIRED_MESSAGE)
      }
    }

    pruneExpiredDownloads()
    const intervalId = window.setInterval(pruneExpiredDownloads, DOWNLOAD_SESSION_POLL_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [
    outputFiles,
    setDownloadGeneratedAt,
    setPendingDownloadFile,
    setPreviewFile,
    setQueuedMessage,
    setOutputFiles
  ])

  const handleCoverLetterTextChange = useCallback(
    (type, value) => {
      if (!isCoverLetterType(type)) return
      setCoverLetterDrafts((prev) => ({ ...prev, [type]: value }))
      setCoverLetterClipboardStatus('')
      setCoverLetterDownloadError('')
    },
    []
  )

  const markCoverLetterPreviewed = useCallback((type) => {
    if (!isCoverLetterType(type)) return
    setCoverLetterReviewState((prev) => {
      if (prev?.[type]) {
        return prev
      }
      return { ...prev, [type]: true }
    })
  }, [])

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
    async (type, file = {}) => {
      if (!isCoverLetterType(type)) return
      const resolvedText = resolveCoverLetterDraftText(
        coverLetterDrafts,
        coverLetterOriginals,
        type,
        file
      )
      const text = typeof resolvedText === 'string' ? resolvedText.trim() : ''
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
    [coverLetterDrafts, coverLetterOriginals]
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
    const file = coverLetterEditor.file || {}
    const resolvedDraftText = resolveCoverLetterDraftText(
      coverLetterDrafts,
      coverLetterOriginals,
      type,
      file
    )
    const text = typeof resolvedDraftText === 'string' ? resolvedDraftText.trim() : ''
    if (!text) {
      setCoverLetterDownloadError('Add your personalised message before downloading.')
      return
    }

    const presentation = coverLetterEditor.presentation || getDownloadPresentation(file)
    const { templateId: resolvedTemplateId, templateName: resolvedTemplateName, candidates: coverTemplateCandidates } =
      resolveCoverTemplateSelection({
        file,
        type,
        downloadTemplateMetadata,
        templateContext
      })
    const coverLetterFields =
      file.coverLetterFields && typeof file.coverLetterFields === 'object'
        ? file.coverLetterFields
        : null
    const sanitizeContactLines = (lines = []) =>
      Array.isArray(lines)
        ? lines.filter((line) =>
          typeof line === 'string' &&
          line.trim() &&
          !/linkedin/i.test(line) &&
          !/credly/i.test(line) &&
          !/\bjd\b/i.test(line)
        )
        : []

    const contactDetails =
      coverLetterFields && typeof coverLetterFields.contact === 'object'
        ? {
          contactLines: sanitizeContactLines(coverLetterFields.contact.lines),
          email:
            typeof coverLetterFields.contact.email === 'string'
              ? coverLetterFields.contact.email
              : '',
          phone:
            typeof coverLetterFields.contact.phone === 'string'
              ? coverLetterFields.contact.phone
              : '',
          cityState:
            typeof coverLetterFields.contact.location === 'string'
              ? coverLetterFields.contact.location
              : ''
        }
        : undefined

    const sanitizedCoverLetterFields = (() => {
      if (!coverLetterFields || typeof coverLetterFields !== 'object') {
        return undefined
      }
      const sanitizedContact = contactDetails
        ? {
          ...coverLetterFields.contact,
          lines: contactDetails.contactLines,
          linkedin: ''
        }
        : undefined
      return {
        ...coverLetterFields,
        contact: sanitizedContact
      }
    })()
    const applicantName =
      (typeof coverLetterFields?.closing?.signature === 'string' &&
        coverLetterFields.closing.signature.trim()) ||
      ''
    const jobTitle =
      (typeof coverLetterFields?.job?.title === 'string' && coverLetterFields.job.title.trim()) ||
      (typeof changeLogSummaryContext?.jobTitle === 'string'
        ? changeLogSummaryContext.jobTitle
        : '')

    const payload = {
      jobId,
      text,
      templateId: resolvedTemplateId,
      template: resolvedTemplateId,
      coverTemplate: resolvedTemplateId,
      coverTemplateId: resolvedTemplateId,
      coverTemplates: coverTemplateCandidates,
      templates: coverTemplateCandidates,
      variant: type,
      letterIndex: type === 'cover_letter2' ? 2 : 1,
      jobTitle,
      jobDescription: jobDescriptionText,
      jobSkills,
      applicantName,
      ...(contactDetails ? { contactDetails } : {}),
      ...(sanitizedCoverLetterFields ? { coverLetterFields: sanitizedCoverLetterFields } : {}),
      ...(userIdentifier ? { userId: userIdentifier } : {})
    }

    setIsCoverLetterDownloading(true)
    setCoverLetterDownloadError('')
    try {
      const response = await fetch(buildApiUrl(API_BASE_URL, '/api/render-cover-letter'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(payload)
      })
      if (!response.ok) {
        let errPayload = null
        try {
          errPayload = await response.json()
        } catch (parseErr) {
          errPayload = null
        }
        const errorMessages = extractServerMessages(errPayload)
        const summaryMessage =
          errorMessages.length > 0
            ? errorMessages[errorMessages.length - 1]
            : ''
        const { message, code, source, logs, requestId } = resolveApiError({
          data: errPayload,
          fallback: 'Could not generate PDF, please try again.',
          status: response.status
        })
        const error = new Error(message)
        if (code) {
          error.code = code
        }
        if (source) {
          error.serviceError = source
        }
        if (requestId) {
          error.requestId = requestId
        }
        if (logs && logs.length) {
          error.logs = logs
        }
        if (summaryMessage) {
          error.summary = summaryMessage
        }
        if (errorMessages.length > 0) {
          error.messages = errorMessages
        }
        throw error
      }

      const data = await response.json()
      const headerTemplateId = response.headers.get('x-template-id')
      const headerTemplateName = response.headers.get('x-template-name')
      const effectiveTemplateId = canonicalizeCoverTemplateId(
        data?.templateId || headerTemplateId || resolvedTemplateId,
        resolvedTemplateId
      )
      const effectiveTemplateName =
        (typeof data?.templateName === 'string' && data.templateName.trim()) ||
        (headerTemplateName && headerTemplateName.trim()) ||
        resolvedTemplateName ||
        formatCoverTemplateName(effectiveTemplateId)

      const rawDownloadUrlCandidates = [
        data?.downloadUrl,
        data?.signedUrl,
        data?.fileUrl,
        data?.url,
        data?.typeUrl
      ]
      const downloadUrl = rawDownloadUrlCandidates.find((value) =>
        typeof value === 'string' && value.trim()
      )
      if (!downloadUrl) {
        throw new Error('Download link was not provided by the server.')
      }

      const fileForName = {
        type,
        fileName: coverLetterEditor.label || type || 'cover-letter',
        url: downloadUrl,
        templateId: effectiveTemplateId,
        templateName: effectiveTemplateName,
        coverTemplateId: effectiveTemplateId,
        coverTemplateName: effectiveTemplateName
      }
      const downloadFileName = deriveDownloadFileName(fileForName, presentation, null, {
        templateName: effectiveTemplateName,
        templateId: effectiveTemplateId,
        generatedAt:
          (typeof data?.generatedAt === 'string' && Date.parse(data.generatedAt)) ||
          Date.now(),
        contentTypeOverride: 'application/pdf',
        forcePdfExtension: true
      })
      const link = document.createElement('a')
      link.href = downloadUrl
      link.rel = 'noopener'
      link.target = '_blank'
      if (downloadFileName) {
        link.download = downloadFileName
      }
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      resetUiAfterDownload()
    } catch (err) {
      console.error('Cover letter PDF generation failed', err)
      const summary =
        typeof err?.summary === 'string' && err.summary.trim()
          ? err.summary.trim()
          : ''
      const message =
        summary ||
        (typeof err?.message === 'string' && err.message.trim()) ||
        'Could not generate PDF, please try again'
      setCoverLetterDownloadError(message)
    } finally {
      setIsCoverLetterDownloading(false)
    }
  }, [
    API_BASE_URL,
    changeLogSummaryContext,
    coverLetterDrafts,
    coverLetterOriginals,
    coverLetterEditor,
    downloadTemplateMetadata,
    jobDescriptionText,
    jobId,
    jobSkills,
    resetUiAfterDownload,
    templateContext,
    userIdentifier
  ])

  const openCoverLetterEditorModal = useCallback(
    (file) => {
      if (!file || !isCoverLetterType(file.type)) return
      const presentation = file.presentation || getDownloadPresentation(file)
      markCoverLetterPreviewed(file.type)
      setCoverLetterEditor({
        type: file.type,
        label: presentation.label,
        presentation,
        file
      })
      setCoverLetterDownloadError('')
      setCoverLetterClipboardStatus('')
    },
    [markCoverLetterPreviewed, setCoverLetterEditor, setCoverLetterDownloadError, setCoverLetterClipboardStatus]
  )

  const closeCoverLetterEditor = useCallback(() => {
    setCoverLetterEditor(null)
    setCoverLetterDownloadError('')
    setCoverLetterClipboardStatus('')
  }, [])

  const openDownloadPreview = useCallback(
    (file, { requireDownloadConfirmation = false } = {}) => {
      if (!file) return
      const presentation = file.presentation || getDownloadPresentation(file)
      if (presentation.category === 'cover' && isCoverLetterType(file.type)) {
        openCoverLetterEditorModal({ ...file, presentation })
        return
      }
      if (requireDownloadConfirmation) {
        setPendingDownloadFile({ ...file, presentation })
      } else {
        setPendingDownloadFile(null)
      }
      setPreviewFile({ ...file, presentation })
    },
    [openCoverLetterEditorModal]
  )

  const closeDownloadPreview = useCallback(() => {
    setPreviewFile(null)
    setPendingDownloadFile(null)
  }, [])

  const renderTemplateSelection = (context = 'improvements') => {
    const showDownloadActions = context === 'downloads'
    return (
      <TemplatePicker
        context={context}
        resumeOptions={availableTemplateOptions}
        resumeHistorySummary={templateHistorySummary}
        selectedResumeTemplateId={selectedTemplate}
        selectedResumeTemplateName={formatTemplateName(selectedTemplate)}
        selectedResumeTemplateDescription={selectedTemplateOption?.description || ''}
        onResumeTemplateSelect={handleTemplateSelect}
        coverOptions={availableCoverTemplateOptions}
        selectedCoverTemplateId={selectedCoverTemplate}
        selectedCoverTemplateName={formatCoverTemplateName(selectedCoverTemplate)}
        selectedCoverTemplateDescription={getCoverTemplateDescription(selectedCoverTemplate)}
        onCoverTemplateSelect={handleCoverTemplateSelect}
        isCoverLinkedToResume={isCoverTemplateLinkedToResume}
        onCoverLinkToggle={handleCoverLinkToggle}
        disabled={isProcessing}
        isApplying={isProcessing}
        showDownloadActions={showDownloadActions}
        resumeDownloadsByTemplate={showDownloadActions ? resumeDownloadsByTemplate : undefined}
        coverDownloadsByTemplate={showDownloadActions ? coverDownloadsByTemplate : undefined}
        onDownloadPreview={showDownloadActions ? openDownloadPreview : undefined}
      />
    )
  }

  const refreshDownloadLink = useCallback(
    async (file, { silent = false } = {}) => {
      const fallbackMessage =
        'Unable to refresh the download link. Please try again.'
      if (!file || typeof file !== 'object') {
        if (!silent) {
          setError('Download link is unavailable. Please regenerate the document.', {
            stage: 'download'
          })
        }
        const err = new Error('DOWNLOAD_ENTRY_INVALID')
        err.message = 'Download link is unavailable. Please regenerate the document.'
        throw err
      }

      const storageKey =
        typeof file.storageKey === 'string' ? file.storageKey.trim() : ''
      if (!storageKey) {
        if (!silent) {
          setError('Download link is unavailable. Please regenerate the document.', {
            stage: 'download'
          })
        }
        const err = new Error('DOWNLOAD_KEY_MISSING')
        err.message = 'Download link is unavailable. Please regenerate the document.'
        throw err
      }

      if (!silent) {
        setError('', { stage: 'download' })
      }

      if (!jobId) {
        if (!silent) {
          setError('Upload your resume and job description before generating downloads.', {
            stage: 'download'
          })
        }
        const err = new Error('JOB_ID_REQUIRED')
        err.message = 'Upload your resume and job description before generating downloads.'
        throw err
      }

      const payload = { jobId, storageKey }
      if (typeof file.type === 'string' && file.type.trim()) {
        payload.type = file.type.trim()
      }
      if (userIdentifier) {
        payload.userId = userIdentifier
      }
      let response
      try {
        response = await fetch(
          buildApiUrl(API_BASE_URL, '/api/refresh-download-link'),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }
        )
      } catch (err) {
        if (!silent) {
          setError(fallbackMessage, { stage: 'download' })
        }
        const error = err instanceof Error ? err : new Error(fallbackMessage)
        if (!error.message) {
          error.message = fallbackMessage
        }
        throw error
      }

      const data = await response.json().catch(() => ({}))
      const {
        message: errorMessage,
        code: errorCode,
        source: errorSource,
        logs: errorLogsValue,
        requestId: errorRequestId
      } = resolveApiError({
        data,
        fallback: fallbackMessage,
        status: response.status
      })

      if (!response.ok) {
        if (!silent) {
          setError(errorMessage, {
            serviceError: errorSource,
            errorCode,
            logs: errorLogsValue,
            requestId: errorRequestId,
            stage: 'download'
          })
        }
        const err = new Error(errorMessage)
        err.code = errorCode || 'DOWNLOAD_REFRESH_FAILED'
        if (errorSource) {
          err.serviceError = errorSource
        }
        if (errorRequestId) {
          err.requestId = errorRequestId
        }
        if (Array.isArray(errorLogsValue) && errorLogsValue.length) {
          err.logs = errorLogsValue
        }
        throw err
      }

      const refreshedUrl = typeof data.url === 'string' ? data.url.trim() : ''
      if (!refreshedUrl) {
        const message =
          'Download link is unavailable after refresh. Please regenerate the document.'
        if (!silent) {
          setError(message, { stage: 'download' })
        }
        const err = new Error(message)
        err.code = 'DOWNLOAD_URL_MISSING'
        throw err
      }

      const refreshedExpiresAt =
        typeof data.expiresAt === 'string' ? data.expiresAt.trim() : ''
      const refreshedAtIso = new Date().toISOString()
      const typeFragment =
        (typeof file.type === 'string' && file.type.trim()) || 'download'
      const updatedFields = {
        url: refreshedUrl,
        fileUrl: refreshedUrl,
        typeUrl: `${refreshedUrl}#${encodeURIComponent(typeFragment)}`,
        expiresAt: refreshedExpiresAt,
        refreshedAt: refreshedAtIso,
        storageKey
      }

      let refreshedEntry = null

      setOutputFiles((prev) => {
        if (!Array.isArray(prev) || prev.length === 0) {
          return prev
        }
        let changed = false
        const next = prev.map((entry) => {
          if (!entry || typeof entry !== 'object') return entry
          const entryKey =
            typeof entry.storageKey === 'string' ? entry.storageKey.trim() : ''
          const matchesKey = entryKey && entryKey === storageKey
          const matchesType = !entryKey && entry.type === file.type
          if (!matchesKey && !matchesType) {
            return entry
          }
          changed = true
          const merged = { ...entry, ...updatedFields }
          refreshedEntry = merged
          return merged
        })
        return changed ? next : prev
      })

      setPreviewFile((prev) => {
        if (!prev || typeof prev !== 'object') return prev
        const entryKey =
          typeof prev.storageKey === 'string' ? prev.storageKey.trim() : ''
        const matchesKey = entryKey && entryKey === storageKey
        const matchesType = !entryKey && prev.type === file.type
        if (!matchesKey && !matchesType) {
          return prev
        }
        return { ...prev, ...updatedFields }
      })

      setPendingDownloadFile((prev) => {
        if (!prev || typeof prev !== 'object') return prev
        const entryKey =
          typeof prev.storageKey === 'string' ? prev.storageKey.trim() : ''
        const matchesKey = entryKey && entryKey === storageKey
        const matchesType = !entryKey && prev.type === file.type
        if (!matchesKey && !matchesType) {
          return prev
        }
        return { ...prev, ...updatedFields }
      })

      if (!refreshedEntry) {
        refreshedEntry = { ...file, ...updatedFields }
      }

      return refreshedEntry
    },
    [API_BASE_URL, jobId, userIdentifier, setError, setOutputFiles, setPreviewFile, setPendingDownloadFile]
  )

  const handleDownloadFile = useCallback(
    async (file) => {
      if (!file || typeof file !== 'object') {
        setError('Unable to download this document. Please try again.', {
          stage: 'download'
        })
        return
      }
      let activeFile = file
      setError('', { stage: 'download' })
      const presentation =
        activeFile.presentation || getDownloadPresentation(activeFile)
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        setError('Download is not supported in this environment.', { stage: 'download' })
        return
      }
      const stateKeyBase = getDownloadStateKey(activeFile)
      let downloadUrl =
        typeof activeFile.url === 'string' ? activeFile.url.trim() : ''
      let expiresAtIso =
        typeof activeFile.expiresAt === 'string' ? activeFile.expiresAt.trim() : ''
      const storageKey =
        typeof activeFile.storageKey === 'string' ? activeFile.storageKey.trim() : ''
      const canRefresh = Boolean(storageKey)
      const computeIsExpired = (value) => {
        if (!value) return false
        const expiryDate = new Date(value)
        if (Number.isNaN(expiryDate.getTime())) {
          return false
        }
        return expiryDate.getTime() <= Date.now()
      }
      let isExpired = computeIsExpired(expiresAtIso)

      if ((!downloadUrl || isExpired) && canRefresh) {
        try {
          const refreshed = await refreshDownloadLink(activeFile, { silent: true })
          if (refreshed && typeof refreshed === 'object') {
            activeFile = { ...activeFile, ...refreshed }
            downloadUrl =
              typeof activeFile.url === 'string' ? activeFile.url.trim() : ''
            expiresAtIso =
              typeof activeFile.expiresAt === 'string'
                ? activeFile.expiresAt.trim()
                : ''
            isExpired = computeIsExpired(expiresAtIso)
          }
        } catch (refreshErr) {
          const refreshMessage =
            refreshErr?.message ||
            'Unable to refresh the download link. Please try again.'
          setError(refreshMessage, { stage: 'download' })
          if (stateKeyBase) {
            setDownloadStates((prev) => ({
              ...prev,
              [stateKeyBase]: {
                status: 'idle',
                error: 'Download link expired. Try refreshing again.'
              }
            }))
          }
          setPendingDownloadFile(null)
          return
        }
      }

      if (!downloadUrl) {
        setError('Download link is unavailable. Please regenerate the document.', {
          stage: 'download'
        })
        if (stateKeyBase) {
          setDownloadStates((prev) => ({
            ...prev,
            [stateKeyBase]: { status: 'idle', error: 'Download link unavailable.' }
          }))
        }
        return
      }
      const stateKey = stateKeyBase || downloadUrl
      const previewStateKey = previewFile
        ? getDownloadStateKey(previewFile) || (typeof previewFile.url === 'string' ? previewFile.url : '')
        : ''
      if (previewStateKey !== stateKey) {
        openDownloadPreview(activeFile, { requireDownloadConfirmation: true })
        return
      }
      setDownloadStates((prev) => ({
        ...prev,
        [stateKey]: { status: 'loading', error: '' }
      }))
      try {
        const normalizedDownloadUrl = downloadUrl
        const shouldStreamInBrowser = (() => {
          if (normalizedDownloadUrl.startsWith('blob:') || normalizedDownloadUrl.startsWith('data:')) {
            return true
          }
          return isSameOriginUrl(normalizedDownloadUrl)
        })()

        if (!shouldStreamInBrowser) {
          const opened = openUrlInNewTab(normalizedDownloadUrl)
          if (!opened) {
            throw new Error('Direct download open failed')
          }
          setDownloadStates((prev) => ({
            ...prev,
            [stateKey]: { status: 'completed', error: '' }
          }))
          setPendingDownloadFile(null)
          resetUiAfterDownload()
          return
        }

        const response = await fetch(normalizedDownloadUrl)
        if (!response.ok) {
          const downloadError = new Error(`Download failed with status ${response.status}`)
          downloadError.status = response.status
          if (response.status === 404) {
            downloadError.code = 'DOWNLOAD_NOT_FOUND'
          }
          throw downloadError
        }
        const responseContentType = response.headers?.get?.('content-type') || ''
        const normalizedResponseType = responseContentType.split(';')[0]?.trim().toLowerCase() || ''
        const rawBlob = await response.blob()
        const typeHint = typeof activeFile.type === 'string' ? activeFile.type.trim().toLowerCase() : ''
        const storageExtension = extractFileExtension(storageKey)
        const urlExtension = extractFileExtension(activeFile.url)
        const fileNameExtension = extractFileExtension(activeFile.fileName)
        const expectsPdfByType = Boolean(typeHint && typeHint !== 'original_upload')
        const expectsPdfByExtension =
          storageExtension === '.pdf' || urlExtension === '.pdf' || fileNameExtension === '.pdf'
        const expectsPdfByHeader = normalizedResponseType.includes('pdf')
        const shouldNormalizePdf = expectsPdfByType || expectsPdfByExtension || expectsPdfByHeader
        let downloadBlob = rawBlob
        let normalizedContentType = normalizedResponseType || responseContentType

        const hasDocxExtension =
          storageExtension === '.docx' || urlExtension === '.docx' || fileNameExtension === '.docx'
        const hasDocExtension =
          storageExtension === '.doc' || urlExtension === '.doc' || fileNameExtension === '.doc'

        if (shouldNormalizePdf) {
          const normalizedPdf = await normalizePdfBlob(rawBlob, { contentType: responseContentType })
          downloadBlob = normalizedPdf.blob
          normalizedContentType = normalizedPdf.contentType || normalizedContentType || 'application/pdf'
        } else if (
          (!normalizedContentType ||
            normalizedContentType === 'application/octet-stream' ||
            normalizedContentType === 'binary/octet-stream') &&
          (hasDocxExtension || hasDocExtension)
        ) {
          normalizedContentType = hasDocxExtension
            ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            : 'application/msword'
        }
        const templateMeta =
          activeFile.templateMeta || downloadTemplateMetadata[activeFile.type] || {}
        const fileTimestamp =
          activeFile.generatedAt || downloadGeneratedAt || Date.now()
        const fileName = deriveDownloadFileName(activeFile, presentation, response, {
          templateName: templateMeta.name,
          templateId: templateMeta.id,
          generatedAt: fileTimestamp,
          contentTypeOverride: normalizedContentType,
          forcePdfExtension: shouldNormalizePdf,
          versionId: activeFile.versionId,
          versionHash: activeFile.versionHash
        })
        const blobUrl = URL.createObjectURL(downloadBlob)
        const link = document.createElement('a')
        link.href = blobUrl
        link.download = fileName
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(blobUrl)
        setDownloadStates((prev) => ({
          ...prev,
          [stateKey]: { status: 'completed', error: '' }
        }))
        setPendingDownloadFile(null)
        resetUiAfterDownload()
      } catch (err) {
        console.error('Download failed', err)
        const isNotFoundError = err?.code === 'DOWNLOAD_NOT_FOUND' || err?.status === 404
        const downloadErrorMessage = (() => {
          if (isNotFoundError) {
            return 'The PDF could not be found. Please regenerate the document to create a fresh link.'
          }
          if (err?.code === 'NON_PDF_CONTENT') {
            return 'The download link returned text instead of a PDF. Please regenerate the document.'
          }
          if (err?.code === 'INVALID_PDF_SIGNATURE') {
            return 'The downloaded file was corrupted. Please try regenerating the document.'
          }
          if (err?.code === 'EMPTY_PDF_CONTENT') {
            return 'The downloaded file was empty. Please regenerate the document.'
          }
          return 'Unable to download this document. Please try again.'
        })()
        setError(downloadErrorMessage, { stage: 'download' })
        setDownloadStates((prev) => ({
          ...prev,
          [stateKey]: {
            status: isNotFoundError ? 'error' : 'idle',
            error: isNotFoundError
              ? 'Download link unavailable. Please regenerate the document.'
              : 'Download failed. Try again or regenerate the document.'
          }
        }))
        if (!isNotFoundError) {
          try {
            window.open(downloadUrl, '_blank', 'noopener,noreferrer')
          } catch (openErr) {
            console.warn('Fallback open failed', openErr)
          }
        }
        setPendingDownloadFile(null)
      }
    },
    [
      downloadGeneratedAt,
      downloadTemplateMetadata,
      setError,
      setPendingDownloadFile,
      previewFile,
      openDownloadPreview,
      resetUiAfterDownload,
      refreshDownloadLink
    ]
  )

  const renderDownloadCard = useCallback((file) => {
    if (!file) return null
    const presentation = file.presentation || getDownloadPresentation(file)
    const templateMeta = file.templateMeta
    const templateLabel = templateMeta?.name || ''
    const rawVariantType =
      typeof presentation.variantType === 'string'
        ? presentation.variantType.trim().toLowerCase()
        : ''
    const derivedVariantType = (() => {
      if (rawVariantType && DOWNLOAD_VARIANT_BADGE_STYLES[rawVariantType]) {
        return rawVariantType
      }
      const badgeText =
        typeof presentation.badgeText === 'string' ? presentation.badgeText.toLowerCase() : ''
      if (badgeText.includes('original')) return 'original'
      if (badgeText.includes('enhanced')) return 'enhanced'
      return ''
    })()
    const variantBadge = derivedVariantType
      ? DOWNLOAD_VARIANT_BADGE_STYLES[derivedVariantType]
      : null
    const normalizedGeneratedAt = file.generatedAt || downloadGeneratedAt || ''
    const generatedAtLabel = formatDownloadTimestampLabel(normalizedGeneratedAt)
    const generatedAtIso = normalizeIsoTimestamp(normalizedGeneratedAt)
    const cardClass = `p-5 rounded-2xl shadow-sm flex flex-col gap-4 border ${presentation.cardBorder || 'border-purple-200'
      } ${presentation.cardAccent || 'bg-white/85'}`
    const badgeClass = `px-3 py-1 rounded-full border text-xs font-semibold uppercase tracking-wide ${presentation.badgeStyle || 'bg-purple-100 text-purple-700 border-purple-200'
      }`
    const buttonClass = `inline-flex items-center justify-center px-4 py-2 rounded-xl font-semibold text-white shadow focus:outline-none focus:ring-2 focus:ring-offset-2 ${presentation.buttonStyle || 'bg-purple-600 hover:bg-purple-700 focus:ring-purple-500'
      }`
    const secondaryButtonClass =
      'inline-flex items-center justify-center px-4 py-2 rounded-xl font-semibold border border-purple-200 text-purple-700 transition hover:text-purple-900 hover:border-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-200 focus:ring-offset-2'
    const expiryDate = file.expiresAt ? new Date(file.expiresAt) : null
    const isExpiryValid = expiryDate && !Number.isNaN(expiryDate.getTime())
    const expiryLabel = isExpiryValid
      ? expiryDate.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short'
      })
      : null
    const downloadUrl = typeof file.url === 'string' ? file.url : ''
    const storageKey =
      typeof file.storageKey === 'string' ? file.storageKey.trim() : ''
    const sessionLabel = extractSessionLabelFromStorageKey(storageKey)
    const canRefresh = Boolean(storageKey)
    const isExpired = Boolean(isExpiryValid && expiryDate.getTime() <= Date.now())
    const isCoverLetter = presentation.category === 'cover' && isCoverLetterType(file.type)
    const coverDraftText = isCoverLetter ? coverLetterDrafts[file.type] ?? '' : ''
    const coverOriginalText = isCoverLetter
      ? coverLetterOriginals[file.type] ?? getCoverLetterTextFromFile(file)
      : ''
    const coverEdited = isCoverLetter && coverDraftText && coverDraftText !== coverOriginalText
    const hasPreviewedCoverLetter = isCoverLetter ? Boolean(coverLetterReviewState[file.type]) : false
    const downloadStateKey = getDownloadStateKey(file)
    const resolvedStateKey = downloadStateKey || (typeof file.url === 'string' ? file.url : '')
    const downloadState = resolvedStateKey ? downloadStates[resolvedStateKey] : undefined
    const isDownloading = downloadState?.status === 'loading'
    const downloadHasError = downloadState?.status === 'error'
    const downloadError = downloadState?.error || ''
    const derivedDownloadError = isExpired
      ? canRefresh
        ? 'This link expired. Select Download to refresh it automatically.'
        : 'This link has expired. Regenerate the documents to refresh it.'
      : !downloadUrl
        ? 'Download link unavailable. Please regenerate the document.'
        : downloadError
    const isDownloadUnavailable =
      isDownloading || !downloadUrl || (isExpired && !canRefresh) || downloadHasError
    const isCoverLetterDownloadDisabled = isCoverLetter
      ? !downloadUrl || (isExpired && !canRefresh) || downloadHasError
      : isDownloadUnavailable
    const templateNameValue =
      (typeof templateMeta?.name === 'string' && templateMeta.name.trim()) ||
      (typeof file.templateName === 'string' && file.templateName.trim()) ||
      (typeof file.coverTemplateName === 'string' && file.coverTemplateName.trim()) ||
      ''
    const templateIdValue =
      (typeof templateMeta?.id === 'string' && templateMeta.id.trim()) ||
      (typeof file.templateId === 'string' && file.templateId.trim()) ||
      (typeof file.coverTemplateId === 'string' && file.coverTemplateId.trim()) ||
      (typeof file.template === 'string' && file.template.trim()) ||
      ''
    const directDownloadDisabled = !downloadUrl || (isExpired && !canRefresh) || downloadHasError
    const directDownloadFileName = !directDownloadDisabled
      ? deriveDownloadFileName(file, presentation, null, {
        templateName: templateNameValue,
        templateId: templateIdValue,
        generatedAt: file.generatedAt,
        contentTypeOverride: 'application/pdf',
        forcePdfExtension: true,
        versionId: file.versionId,
        versionHash: file.versionHash,
      })
      : ''
    const downloadLinkLabel = presentation.linkLabel || 'Download File'
    const downloadLinkClass = `text-sm font-semibold transition ${directDownloadDisabled
        ? 'text-rose-500 cursor-not-allowed'
        : 'text-purple-700 hover:text-purple-900 underline decoration-purple-300 decoration-2 underline-offset-4'
      }`
    const downloadLinkAriaLabel = [
      downloadLinkLabel,
      sessionLabel ? `Session ${sessionLabel}` : '',
      generatedAtLabel ? `Generated ${generatedAtLabel}` : '',
      expiryLabel ? `Expires ${expiryLabel}` : ''
    ]
      .filter(Boolean)
      .join('. ')
    const downloadButtonClass = `${buttonClass} ${isCoverLetter
        ? isCoverLetterDownloadDisabled
          ? 'opacity-60 cursor-not-allowed'
          : ''
        : isDownloading
          ? 'opacity-80 cursor-wait'
          : isDownloadUnavailable
            ? 'opacity-60 cursor-not-allowed'
            : ''
      }`
    const downloadButtonLabel = (() => {
      if (downloadHasError) {
        return 'Link unavailable'
      }
      if (!downloadUrl) {
        return 'Link unavailable'
      }
      if (isCoverLetter) {
        if (isExpired) return canRefresh ? 'Refresh link' : 'Link expired'
        if (isDownloading) return 'Downloading…'
        return 'Preview before download'
      }
      if (isExpired) return canRefresh ? 'Refresh link' : 'Link expired'
      if (isDownloading) return 'Downloading…'
      return 'Preview & Download'
    })()
    const metaItems = []
    if (templateLabel) {
      metaItems.push({
        key: 'template',
        content: <span>Template: {templateLabel}</span>
      })
    }
    if (sessionLabel) {
      metaItems.push({
        key: 'session',
        content: (
          <span>
            Session:{' '}
            <span className="font-mono text-[11px] tracking-tight text-purple-600/90">
              {sessionLabel}
            </span>
          </span>
        )
      })
    }
    if (generatedAtLabel) {
      metaItems.push({
        key: 'generated',
        content: (
          <time dateTime={generatedAtIso || undefined}>Generated {generatedAtLabel}</time>
        )
      })
    }

    return (
      <div key={file.type} className={cardClass}>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-lg font-semibold text-purple-900">{presentation.label}</p>
              {variantBadge && (
                <span className={variantBadge.className}>{variantBadge.text}</span>
              )}
            </div>
            <p className="text-sm text-purple-700/90 leading-relaxed">{presentation.description}</p>
            {metaItems.length > 0 && (
              <p className="text-xs font-medium text-purple-500 flex flex-wrap items-center gap-x-2 gap-y-1">
                {metaItems.map((item, index) => (
                  <span key={item.key} className="flex items-center gap-1">
                    {index > 0 && <span aria-hidden="true">•</span>}
                    {item.content}
                  </span>
                ))}
              </p>
            )}
          </div>
          {presentation.badgeText && <span className={badgeClass}>{presentation.badgeText}</span>}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <button
              type="button"
              onClick={() =>
                isCoverLetter ? openCoverLetterEditorModal(file) : openDownloadPreview(file)
              }
              className={secondaryButtonClass}
            >
              {isCoverLetter ? 'Preview & Edit' : 'Preview'}
            </button>
            <button
              type="button"
              onClick={() => {
                const canDownload = isCoverLetter
                  ? Boolean(downloadUrl) && (!isExpired || canRefresh) && !downloadHasError
                  : !isDownloadUnavailable
                if (!canDownload) {
                  return
                }
                if (isCoverLetter) {
                  openCoverLetterEditorModal(file)
                  return
                }
                openDownloadPreview(file, { requireDownloadConfirmation: true })
              }}
              className={downloadButtonClass}
              disabled={isCoverLetterDownloadDisabled}
            >
              {downloadButtonLabel}
            </button>
          </div>
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <a
              href={directDownloadDisabled ? undefined : downloadUrl}
              onClick={async (event) => {
                if (directDownloadDisabled) {
                  event.preventDefault()
                  event.stopPropagation()
                  if (isExpired && canRefresh) {
                    try {
                      await refreshDownloadLink(file)
                    } catch (refreshErr) {
                      console.warn('Download link refresh failed', refreshErr)
                    }
                  }
                  return
                }

                // Allow the browser to handle the download, then reset the UI state.
                setTimeout(() => {
                  resetUiAfterDownload()
                }, 0)
              }}
              className={downloadLinkClass}
              aria-disabled={directDownloadDisabled ? 'true' : undefined}
              aria-label={downloadLinkAriaLabel || undefined}
              target={directDownloadDisabled ? undefined : '_blank'}
              rel={directDownloadDisabled ? undefined : 'noopener noreferrer'}
              download={directDownloadDisabled ? undefined : directDownloadFileName || undefined}
              title={
                [
                  presentation.label,
                  sessionLabel ? `Session: ${sessionLabel}` : '',
                  generatedAtLabel ? `Generated ${generatedAtLabel}` : '',
                  expiryLabel ? `Expires ${expiryLabel}` : '',
                  storageKey ? `Storage key: ${storageKey}` : ''
                ]
                  .filter(Boolean)
                  .join(' • ') || undefined
              }
            >
              {downloadLinkLabel}
            </a>
            {(sessionLabel || generatedAtLabel) && (
              <div className="flex flex-col items-start gap-0 sm:items-end">
                {sessionLabel && (
                  <p className="text-[11px] font-mono uppercase tracking-tight text-purple-600/90">
                    Session {sessionLabel}
                  </p>
                )}
                {generatedAtLabel && (
                  <time
                    dateTime={generatedAtIso || undefined}
                    className="text-[11px] font-medium text-purple-500"
                  >
                    Generated {generatedAtLabel}
                  </time>
                )}
              </div>
            )}
            {expiryLabel && !isExpired && (
              <p className="text-xs text-purple-600">Available until {expiryLabel}</p>
            )}
            {expiryLabel && isExpired && (
              <p className="text-xs font-semibold text-rose-600">
                {canRefresh
                  ? `Expired on ${expiryLabel}. Select Download to refresh the link automatically.`
                  : `Expired on ${expiryLabel}. Generate the documents again to refresh the download link.`}
              </p>
            )}
          </div>
        </div>
        {derivedDownloadError && (
          <p className="text-xs font-semibold text-rose-600">{derivedDownloadError}</p>
        )}
        {isCoverLetter && (
          <p
            className={`text-xs ${coverEdited
                ? 'text-indigo-600 font-semibold'
                : hasPreviewedCoverLetter
                  ? 'text-purple-500'
                  : 'text-amber-600 font-semibold'
              }`}
          >
            {coverEdited
              ? 'Edits pending — download the refreshed PDF once you are happy with the text.'
              : hasPreviewedCoverLetter
                ? 'Download the tailored PDF from the editor or revisit it to tweak the copy.'
                : 'Open the editor to preview, personalise, and download your cover letter.'}
          </p>
        )}
      </div>
    )
  }, [
    openDownloadPreview,
    openCoverLetterEditorModal,
    coverLetterDrafts,
    coverLetterOriginals,
    coverLetterReviewState,
    downloadStates,
    refreshDownloadLink,
    resetUiAfterDownload
  ])

  const rawBaseUrl = useMemo(() => getApiBaseCandidate(), [])
  const API_BASE_URL = useMemo(() => resolveApiBase(rawBaseUrl), [rawBaseUrl])
  const closePreview = useCallback(() => {
    setPreviewActionBusy(false)
    setPreviewActiveAction('')
    setPreviewSuggestion(null)
  }, [])

  useEffect(() => {
    if (!previewSuggestion || typeof window === 'undefined') {
      return undefined
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closePreview()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [previewSuggestion, closePreview])

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
          rescoreSummary: normalizeRescoreSummary(entry?.rescoreSummary),
          scoreDelta:
            typeof entry?.scoreDelta === 'number' && Number.isFinite(entry.scoreDelta)
              ? entry.scoreDelta
              : null,
          rescorePending: Boolean(entry?.rescorePending),
          rescoreError: typeof entry?.rescoreError === 'string' ? entry.rescoreError : '',
          validation: normalizeImprovementValidation(entry?.validation)
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
        setError('', { stage: 'upload' })
        const payloadUrls = Array.isArray(payload.urls) ? payload.urls : []
        updateOutputFiles(payloadUrls, { generatedAt: payload.generatedAt })
        const { drafts, originals } = deriveCoverLetterStateFromFiles(payloadUrls)
        setCoverLetterDrafts(drafts)
        setCoverLetterOriginals(originals)
        setMatch(payload.match || null)
        const payloadJobId = typeof payload.jobId === 'string' ? payload.jobId : ''
        if (payloadJobId) {
          setJobId(payloadJobId)
        }
        analysisContextRef.current = {
          hasAnalysis: true,
          cvSignature: cvSignatureRef.current,
          jobSignature: jobSignatureRef.current,
          jobId: payloadJobId || analysisContextRef.current.jobId || ''
        }
      } else if (data.type === 'OFFLINE_UPLOAD_FAILED') {
        setQueuedMessage('')
        setIsProcessing(false)
        const payloadError = data?.payload?.error
        const failureMessage =
          (typeof data?.message === 'string' && data.message.trim()) ||
          (typeof payloadError?.message === 'string' && payloadError.message.trim()) ||
          'Failed to process queued upload. Please try again.'
        setError(failureMessage, { stage: 'upload' })
      }
    }

    navigator.serviceWorker.addEventListener('message', handleMessage)

    navigator.serviceWorker.ready
      .then((registration) => {
        registration.active?.postMessage({ type: 'RETRY_UPLOADS' })
      })
      .catch(() => { })

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage)
    }
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && !file.name.toLowerCase().match(/\.(pdf|docx?)$/)) {
      setError('Only PDF, DOC, or DOCX files are supported.', { stage: 'upload' })
      return
    }
    if (file) {
      lastAutoScoreSignatureRef.current = ''
      setError('', { stage: 'upload' })
      if (cvInputRef.current) {
        cvInputRef.current.value = ''
      }
      setCvFile(file)
    }
  }, [])

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file && !file.name.toLowerCase().match(/\.(pdf|docx?)$/)) {
      setError('Only PDF, DOC, or DOCX files are supported.', { stage: 'upload' })
      return
    }
    if (file) {
      lastAutoScoreSignatureRef.current = ''
      setError('', { stage: 'upload' })
      if (cvInputRef.current) {
        cvInputRef.current.value = ''
      }
      setCvFile(file)
    }
  }

  const handleUploadAreaClick = useCallback(() => {
    if (cvInputRef.current && typeof cvInputRef.current.click === 'function') {
      cvInputRef.current.click()
    }
  }, [])

  useEffect(() => {
    const context = analysisContextRef.current || {}
    if (!context.hasAnalysis) {
      return
    }
    const storedCvSignature = context.cvSignature || ''
    const storedJobSignature = context.jobSignature || ''
    const cvChanged =
      (storedCvSignature && currentCvSignature && storedCvSignature !== currentCvSignature) ||
      (!currentCvSignature && storedCvSignature) ||
      (currentCvSignature && !storedCvSignature)
    const jobChanged =
      (storedJobSignature && currentJobSignature && storedJobSignature !== currentJobSignature) ||
      (!currentJobSignature && storedJobSignature) ||
      (currentJobSignature && !storedJobSignature)

    if (cvChanged || jobChanged) {
      analysisContextRef.current = { hasAnalysis: false, cvSignature: '', jobSignature: '', jobId: '' }
      resetAnalysisState()
    }
  }, [currentCvSignature, currentJobSignature, resetAnalysisState])

  const handleScoreSubmit = useCallback(async () => {
    const hasQueuedRescore =
      Array.isArray(pendingImprovementRescoreRef.current) &&
      pendingImprovementRescoreRef.current.length > 0

    if (hasQueuedRescore) {
      setIsProcessing(true)
      setError('', { stage: 'score' })
      try {
        await runQueuedImprovementRescore()
      } finally {
        setIsProcessing(false)
      }
      return
    }

    const manualText = manualJobDescriptionValue
    const fileSignature = cvFile ? `${cvFile.name}|${cvFile.lastModified}` : ''
    const jobSignature = manualText ? `manual:${manualText}` : ''

    if (!cvFile) {
      setError('Please upload a CV before submitting.', { stage: 'upload' })
      return
    }
    if (!manualText) {
      setManualJobDescriptionRequired(true)
      setError('Please paste the full job description before continuing.', {
        stage: 'upload'
      })
      manualJobDescriptionRef.current?.focus?.()
      return
    }
    if (manualJobDescriptionHasProhibitedHtml) {
      setError('Remove HTML tags like <script> before continuing.', {
        stage: 'upload'
      })
      manualJobDescriptionRef.current?.focus?.()
      return
    }
    if (manualJobDescriptionLooksLikeUrl) {
      setManualJobDescriptionRequired(true)
      setError('Paste the full job description text instead of a link.', {
        stage: 'upload'
      })
      manualJobDescriptionRef.current?.focus?.()
      return
    }

    if (fileSignature) {
      lastAutoScoreSignatureRef.current = fileSignature
    }

    setIsProcessing(true)
    setError('', { stage: 'upload' })
    setMatch(null)
    setQueuedMessage('')
    resetAnalysisState()

    try {
      const formData = new FormData()
      formData.append('resume', cvFile)
      if (manualText) {
        formData.append('manualJobDescription', manualText)
      }
      if (manualCertificatesInput.trim()) {
        formData.append('manualCertificates', manualCertificatesInput.trim())
      }
      const {
        canonicalTemplate: canonicalUploadTemplate,
        canonicalPrimaryTemplate: primaryUploadTemplate,
        canonicalSecondaryTemplate: secondaryUploadTemplate,
        canonicalCoverTemplate: canonicalUploadCoverTemplate,
        canonicalCoverPrimaryTemplate: primaryCoverTemplate,
        canonicalCoverSecondaryTemplate: secondaryCoverTemplate,
        canonicalTemplateList,
        canonicalCoverTemplateList
      } = buildTemplateRequestContext(templateContext, selectedTemplate)

      formData.append('template', canonicalUploadTemplate)
      formData.append('templateId', canonicalUploadTemplate)
      formData.append('template1', primaryUploadTemplate)
      formData.append('template2', secondaryUploadTemplate)
      formData.append('coverTemplate', canonicalUploadCoverTemplate)
      formData.append('coverTemplate1', primaryCoverTemplate)
      formData.append('coverTemplate2', secondaryCoverTemplate)
      if (canonicalTemplateList.length) {
        formData.append('templates', JSON.stringify(canonicalTemplateList))
      }
      if (canonicalCoverTemplateList.length) {
        formData.append('coverTemplates', JSON.stringify(canonicalCoverTemplateList))
      }
      if (userIdentifier) {
        formData.append('userId', userIdentifier)
      }

      const requestUrl = buildApiUrl(API_BASE_URL, '/api/process-cv')

      const response = await fetch(requestUrl, {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        let data = {}
        try {
          data = await response.json()
        } catch {
          data = {}
        }
        const fallbackMessage =
          response.status >= 500 ? CV_GENERATION_ERROR_MESSAGE : 'Request failed'
        const {
          message: resolvedMessage,
          code: errorCode,
          isFriendly,
          source: errorSource,
          logs: errorLogsValue,
          requestId: errorRequestId
        } = resolveApiError({
          data,
          fallback: fallbackMessage,
          status: response.status
        })
        const detailField = typeof data?.error?.details?.field === 'string' ? data.error.details.field : ''
        const manualRequired =
          data?.error?.details?.manualInputRequired === true ||
          errorCode === 'JOB_DESCRIPTION_REQUIRED' ||
          detailField === 'manualJobDescription'
        const prohibitedHtmlError = errorCode === 'JOB_DESCRIPTION_PROHIBITED_TAGS'
        let message = resolvedMessage
        if (manualRequired) {
          setManualJobDescriptionRequired(true)
          manualJobDescriptionRef.current?.focus?.()
          message = 'Paste the full job description to continue.'
        }
        if (prohibitedHtmlError) {
          manualJobDescriptionRef.current?.focus?.()
          message = 'Remove HTML tags like <script> before continuing.'
        }
        if (!isFriendly && errorCode && errorCode !== 'PROCESSING_FAILED') {
          message = `${message} (${errorCode})`
        }
        console.error('Resume processing request failed', {
          status: response.status,
          statusText: response.statusText,
          message
        })
        const error = new Error(message)
        if (errorCode) {
          error.code = errorCode
        }
        if (errorSource) {
          error.serviceError = errorSource
        }
        if (errorRequestId) {
          error.requestId = errorRequestId
        }
        if (Array.isArray(errorLogsValue) && errorLogsValue.length) {
          error.logs = errorLogsValue
        }
        throw error
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

      const outputFilesValue = normalizeOutputFiles(data.urls, {
        defaultExpiresAt: data?.urlExpiresAt,
        defaultExpiresInSeconds: data?.urlExpiresInSeconds,
        allowEmptyUrls: true
      })
      updateOutputFiles(outputFilesValue, { generatedAt: data?.generatedAt })
      setArtifactsUploaded(Boolean(data?.artifactsUploaded || outputFilesValue.length > 0))
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
        typeof data.selectionProbabilityAfter === 'number'
          ? data.selectionProbabilityAfter
          : typeof data.selectionProbability === 'number'
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

      const normalizePercent = (value) =>
        typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null

      const keywordScoreBefore = normalizePercent(data.originalScore)
      const keywordScoreAfter = normalizePercent(
        typeof data.enhancedScore === 'number' ? data.enhancedScore : data.originalScore
      )
      const atsScoreBeforeResponse = normalizePercent(data.atsScoreBefore)
      const atsScoreAfterResponse = normalizePercent(data.atsScoreAfter)

      const atsScoreBeforeExplanation =
        typeof data.atsScoreBeforeExplanation === 'string'
          ? data.atsScoreBeforeExplanation
          : typeof data.originalScoreExplanation === 'string'
            ? data.originalScoreExplanation
            : ''
      const atsScoreAfterExplanation =
        typeof data.atsScoreAfterExplanation === 'string'
          ? data.atsScoreAfterExplanation
          : typeof data.enhancedScoreExplanation === 'string'
            ? data.enhancedScoreExplanation
            : ''

      const matchPayload = {
        table: Array.isArray(data.table) ? data.table : [],
        addedSkills: Array.isArray(data.addedSkills) ? data.addedSkills : [],
        missingSkills: Array.isArray(data.missingSkills) ? data.missingSkills : [],
        atsScoreBefore: atsScoreBeforeResponse,
        atsScoreAfter: atsScoreAfterResponse,
        originalScore: keywordScoreBefore,
        enhancedScore: keywordScoreAfter,
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
        selectionProbabilityAfterRationale: probabilityRationale,
        selectionProbabilityFactors: Array.isArray(data.selectionProbabilityFactors)
          ? cloneData(data.selectionProbabilityFactors)
          : Array.isArray(data.selectionInsights?.factors)
            ? cloneData(data.selectionInsights.factors)
            : [],
        atsScoreBeforeExplanation,
        atsScoreAfterExplanation,
        originalScoreExplanation:
          typeof data.originalScoreExplanation === 'string'
            ? data.originalScoreExplanation
            : atsScoreBeforeExplanation,
        enhancedScoreExplanation:
          typeof data.enhancedScoreExplanation === 'string'
            ? data.enhancedScoreExplanation
            : atsScoreAfterExplanation
      }
      setMatch(matchPayload)
      const toMetricArray = (input) => {
        if (Array.isArray(input)) return input
        if (input && typeof input === 'object') return Object.values(input)
        return []
      }
      const baselineCandidates = toMetricArray(
        data.atsSubScoresBefore || data.baselineScoreBreakdown
      )
      const breakdownCandidates = toMetricArray(
        data.atsSubScores || data.atsSubScoresAfter || data.scoreBreakdown
      )
      const normalizedBaseline = orderAtsMetrics(
        baselineCandidates.length ? baselineCandidates : breakdownCandidates
      ).map((metric) => ({
        ...metric,
        tip: metric?.tip ?? metric?.tips?.[0] ?? ''
      }))
      const breakdownSource = breakdownCandidates.length
        ? breakdownCandidates
        : baselineCandidates.length
          ? baselineCandidates
          : []
      const normalizedBreakdown = orderAtsMetrics(breakdownSource).map((metric) => ({
        ...metric,
        tip: metric?.tip ?? metric?.tips?.[0] ?? ''
      }))
      setBaselineScoreBreakdown(normalizedBaseline)
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
        baselineScoreBreakdown: cloneData(normalizedBaseline),
        outputFiles: cloneData(outputFilesValue),
        templateContext: cloneData(templateContextValue),
        changeLog: cloneData(changeLogValue),
        coverLetterDrafts: cloneData(analysisCoverLetterDrafts),
        coverLetterOriginals: cloneData(analysisCoverLetterOriginals)
      })
      setResumeHistory([])
      analysisContextRef.current = {
        hasAnalysis: true,
        cvSignature: fileSignature,
        jobSignature,
        jobId: jobIdValue
      }
    } catch (err) {
      console.error('Unable to enhance CV', err)
      const errorMessage =
        (typeof err?.message === 'string' && err.message.trim()) ||
        CV_GENERATION_ERROR_MESSAGE
      const { source: serviceErrorSource, code: errorCode } = deriveServiceContextFromError(err)
      const { logs: errorLogsValue, requestId: errorRequestId } = extractErrorMetadata(err)
      setError(errorMessage, {
        serviceError: serviceErrorSource,
        errorCode,
        logs: errorLogsValue,
        requestId: errorRequestId,
        stage: 'upload'
      })
      lastAutoScoreSignatureRef.current = ''
    } finally {
      setIsProcessing(false)
    }
  }, [
    runQueuedImprovementRescore,
    API_BASE_URL,
    cvFile,
    manualCertificatesInput,
    manualJobDescriptionHasProhibitedHtml,
    manualJobDescriptionLooksLikeUrl,
    manualJobDescriptionValue,
    resetAnalysisState,
    updateOutputFiles,
    selectedTemplate,
    templateContext,
    userIdentifier
  ])

  useEffect(() => {
    if (!cvFile || isProcessing) {
      return
    }
    if (
      !manualJobDescriptionValue ||
      manualJobDescriptionLooksLikeUrl ||
      manualJobDescriptionHasProhibitedHtml
    ) {
      return
    }
    const signature = cvFile ? `${cvFile.name}|${cvFile.lastModified}` : ''
    if (!signature) {
      return
    }
    if (lastAutoScoreSignatureRef.current === signature && (isProcessing || scoreComplete)) {
      return
    }
    handleScoreSubmit()
  }, [
    cvFile,
    handleScoreSubmit,
    isProcessing,
    manualJobDescriptionHasProhibitedHtml,
    manualJobDescriptionLooksLikeUrl,
    manualJobDescriptionValue,
    scoreComplete
  ])

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
    const baselineBreakdownValue = Array.isArray(snapshot.baselineScoreBreakdown)
      ? cloneData(snapshot.baselineScoreBreakdown)
      : scoreBreakdownValue
    setBaselineScoreBreakdown(baselineBreakdownValue)

    const outputFilesValue = normalizeOutputFiles(snapshot.outputFiles, {
      defaultExpiresAt: snapshot?.urlExpiresAt,
      defaultExpiresInSeconds: snapshot?.urlExpiresInSeconds,
      allowEmptyUrls: true
    })
    updateOutputFiles(outputFilesValue, { generatedAt: snapshot?.generatedAt })
    setArtifactsUploaded(Boolean(snapshot?.artifactsUploaded || outputFilesValue.length > 0))

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
    setError('', { stage: 'enhance' })
    setPreviewSuggestion(null)
  }, [initialAnalysisSnapshot, updateOutputFiles])

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

  const recommendedCertificateNames = useMemo(() => {
    const suggestions = Array.isArray(certificateInsights?.suggestions)
      ? certificateInsights.suggestions
      : []
    const formatted = suggestions
      .map((item) => formatCertificateDisplay(item))
      .filter(Boolean)
    return toUniqueList(formatted)
  }, [certificateInsights])

  const missingCertificateNames = useMemo(() => {
    const missing = Array.isArray(deltaSummary?.certificates?.missing)
      ? deltaSummary.certificates.missing
      : []
    const normalizedMissing = missing
      .map((item) => formatCertificateDisplay(item))
      .filter((item) => item && item.toLowerCase() !== 'manual entry required')
    if (normalizedMissing.length > 0) {
      return toUniqueList(normalizedMissing)
    }
    return recommendedCertificateNames
  }, [deltaSummary, recommendedCertificateNames])

  const knownCertificateNames = useMemo(() => {
    const known = Array.isArray(certificateInsights?.known)
      ? certificateInsights.known
      : []
    const manual = Array.isArray(manualCertificatesData) ? manualCertificatesData : []
    const formatted = [...known, ...manual]
      .map((item) => formatCertificateDisplay(item))
      .filter(Boolean)
    return toUniqueList(formatted)
  }, [certificateInsights, manualCertificatesData])

  const additionalRecommendedCertificates = useMemo(() => {
    if (!recommendedCertificateNames.length) {
      return []
    }
    const missingSet = new Set(
      missingCertificateNames.map((item) => item.toLowerCase())
    )
    return recommendedCertificateNames.filter(
      (item) => !missingSet.has(item.toLowerCase())
    )
  }, [recommendedCertificateNames, missingCertificateNames])

  const analysisHighlights = useMemo(() => {
    const items = []
    const seenKeys = new Set()
    const pushHighlight = (item) => {
      if (!item || !item.key || seenKeys.has(item.key)) {
        return
      }
      items.push(item)
      seenKeys.add(item.key)
    }

    const getMissingFromSummary = (key) => {
      const bucket = deltaSummary?.[key]
      if (!bucket) return []
      return toUniqueList(bucket.missing || [])
    }

    const missingSkills = getMissingFromSummary('skills')
    if (missingSkills.length > 0) {
      pushHighlight({
        key: 'missing-skills',
        tone: 'warning',
        title: 'Missing JD skills',
        message: `Add ${summariseItems(missingSkills, {
          limit: 6,
          decorate: buildActionDecorator((skill) => `Practice ${skill}`)
        })} to mirror the JD keywords.`
      })
    }

    const designationMissing = getMissingFromSummary('designation')
    if (designationMissing.length > 0) {
      const designationAdded = toUniqueList(deltaSummary?.designation?.added || [])
      const fromText = formatReadableList(designationMissing)
      const toText = summariseItems(designationAdded, { limit: 3 }) || match?.modifiedTitle || ''
      const message = toText
        ? `Update your headline from ${fromText} to ${toText} so it mirrors the JD title.`
        : `Update your headline to replace ${fromText} with the JD designation.`
      pushHighlight({
        key: 'designation-mismatch',
        tone: 'info',
        title: 'Designation mismatch',
        message
      })
    }

    const experienceMissing = getMissingFromSummary('experience')
    if (experienceMissing.length > 0) {
      pushHighlight({
        key: 'missing-experience',
        tone: 'warning',
        title: 'Experience gaps',
        message: `Cover stories about ${summariseItems(experienceMissing, {
          limit: 4,
          decorate: buildActionDecorator((item) => `Rehearse story about ${item}`)
        })} to prove the required experience.`
      })
    }

    const tasksMissing = getMissingFromSummary('tasks')
    if (tasksMissing.length > 0) {
      pushHighlight({
        key: 'missing-tasks',
        tone: 'warning',
        title: 'Task coverage gaps',
        message: `Add responsibilities such as ${summariseItems(tasksMissing, {
          limit: 4,
          decorate: buildActionDecorator((item) => `Prepare example covering ${item}`)
        })} to mirror JD expectations.`
      })
    }

    const highlightsMissing = getMissingFromSummary('highlights')
    if (highlightsMissing.length > 0) {
      pushHighlight({
        key: 'missing-highlights',
        tone: 'info',
        title: 'Missing highlights',
        message: `Refresh your summary to phase out ${summariseItems(highlightsMissing, {
          limit: 4,
          decorate: buildActionDecorator((item) => `Trim ${item}`)
        })} and spotlight JD-aligned wins.`
      })
    }

    if (missingCertificateNames.length > 0) {
      pushHighlight({
        key: 'missing-certificates',
        tone: 'warning',
        title: 'Certification gaps',
        message: `List certifications such as ${summariseItems(missingCertificateNames, {
          limit: 4,
          decorate: buildActionDecorator((cert) => `Add credential ${cert}`)
        })} to satisfy JD requirements.`
      })
    }

    const addedSkills = Array.isArray(match?.addedSkills) ? match.addedSkills : []
    if (addedSkills.length > 0) {
      pushHighlight({
        key: 'added-skills',
        tone: 'success',
        title: 'Highlights added',
        message: `Enhanced drafts now surface ${summariseItems(addedSkills, {
          limit: 5,
          decorate: buildActionDecorator((skill) => `Practice ${skill}`)
        })}. Review them before the interview.`
      })
    }

    if (certificateInsights?.manualEntryRequired) {
      pushHighlight({
        key: 'cert-manual',
        tone: 'warning',
        title: 'Missing certifications',
        message:
          'Credly requires authentication. Paste critical certifications manually so we can include them.'
      })
    }

    if (recommendedCertificateNames.length > 0) {
      pushHighlight({
        key: 'cert-suggestions',
        tone: 'info',
        title: 'Recommended certifications',
        message: `Consider adding ${summariseItems(recommendedCertificateNames, {
          limit: 4,
          decorate: buildActionDecorator((cert) => `Add credential ${cert}`)
        })} to strengthen the match.`
      })
    }

    return items
  }, [
    deltaSummary,
    match,
    certificateInsights,
    missingCertificateNames,
    recommendedCertificateNames
  ])

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

  const learningResources = useMemo(() => {
    if (!Array.isArray(selectionInsights?.learningResources)) {
      return []
    }
    return selectionInsights.learningResources
      .map((entry) => {
        const skill = typeof entry?.skill === 'string' ? entry.skill.trim() : ''
        if (!skill) {
          return null
        }
        const resources = Array.isArray(entry?.resources)
          ? entry.resources
            .map((item) => {
              if (!item || typeof item !== 'object') {
                return null
              }
              const url = typeof item.url === 'string' ? item.url.trim() : ''
              if (!url) {
                return null
              }
              const title = typeof item.title === 'string' && item.title.trim() ? item.title.trim() : url
              const description = typeof item.description === 'string' ? item.description.trim() : ''
              return { title, url, description }
            })
            .filter(Boolean)
          : []
        if (resources.length === 0) {
          return null
        }
        return { skill, resources }
      })
      .filter(Boolean)
  }, [selectionInsights])

  const hasLearningResources = learningResources.length > 0

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

  const { summarySegments: comparisonSummarySegments, signature: comparisonSummarySignature } = useMemo(() => {
    const segments = resumeComparisonData?.summarySegments || []
    return {
      summarySegments: segments,
      signature: buildSummarySegmentSignature(segments)
    }
  }, [resumeComparisonData])

  useEffect(() => {
    setMatch((prev) => {
      if (!prev) {
        return prev
      }

      const currentSignature = buildSummarySegmentSignature(prev.improvementSummary)
      if (currentSignature === comparisonSummarySignature) {
        return prev
      }

      if (!comparisonSummarySignature && (!comparisonSummarySegments || comparisonSummarySegments.length === 0)) {
        if (!currentSignature) {
          return prev
        }
        return { ...prev, improvementSummary: [] }
      }

      return {
        ...prev,
        improvementSummary: cloneData(comparisonSummarySegments)
      }
    })
  }, [comparisonSummarySignature, comparisonSummarySegments])

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
    async ({ updatedResume, baselineScore, previousMissingSkills, rescoreSummary = null }) => {
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

      if (userIdentifier) {
        payload.userId = userIdentifier
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
      const summary = rescoreSummary && typeof rescoreSummary === 'object' ? rescoreSummary : null
      const overallSummary =
        summary && typeof summary.overall === 'object' ? summary.overall : null
      const selectionSummary =
        summary && typeof summary.selectionProbability === 'object'
          ? summary.selectionProbability
          : null
      const selectionInsightsSummary =
        summary && typeof summary.selectionInsights === 'object'
          ? summary.selectionInsights
          : null

      const extractSummaryMetrics = (section) => {
        if (!section || typeof section !== 'object') {
          return []
        }
        if (Array.isArray(section.atsSubScores)) {
          return orderAtsMetrics(section.atsSubScores)
        }
        if (Array.isArray(section.scoreBreakdown)) {
          return orderAtsMetrics(section.scoreBreakdown)
        }
        if (section.scoreBreakdown && typeof section.scoreBreakdown === 'object') {
          return orderAtsMetrics(Object.values(section.scoreBreakdown))
        }
        return []
      }

      const beforeSummaryMetrics = overallSummary ? extractSummaryMetrics(overallSummary.before) : []
      const afterSummaryMetrics = overallSummary ? extractSummaryMetrics(overallSummary.after) : []
      const deltaSummaryMetrics = overallSummary ? extractSummaryMetrics(overallSummary.delta) : []

      const metricsByCategory = (list) => {
        if (!Array.isArray(list) || list.length === 0) {
          return new Map()
        }
        return new Map(
          list
            .map((metric) => {
              const category =
                typeof metric?.category === 'string' && metric.category.trim()
                  ? metric.category.trim()
                  : ''
              return category ? [category, metric] : null
            })
            .filter(Boolean)
        )
      }

      const beforeMetricMap = metricsByCategory(beforeSummaryMetrics)
      const afterMetricMap = metricsByCategory(afterSummaryMetrics)
      const deltaMetricMap = metricsByCategory(deltaSummaryMetrics)

      const metrics = orderAtsMetrics(
        Array.isArray(data.atsSubScores)
          ? data.atsSubScores
          : Array.isArray(data.scoreBreakdown)
            ? data.scoreBreakdown
            : Object.values(data.scoreBreakdown || {})
      ).map((metric) => {
        const enriched = {
          ...metric,
          tip: metric?.tip ?? metric?.tips?.[0] ?? ''
        }
        const category =
          typeof metric?.category === 'string' && metric.category.trim()
            ? metric.category.trim()
            : ''

        if (category) {
          const beforeMetric = beforeMetricMap.get(category)
          const afterMetric = afterMetricMap.get(category)
          const deltaMetric = deltaMetricMap.get(category)

          if (
            typeof beforeMetric?.score === 'number' &&
            Number.isFinite(beforeMetric.score)
          ) {
            enriched.beforeScore = beforeMetric.score
          }
          if (
            typeof afterMetric?.score === 'number' &&
            Number.isFinite(afterMetric.score)
          ) {
            enriched.afterScore = afterMetric.score
          }
          if (
            typeof deltaMetric?.score === 'number' &&
            Number.isFinite(deltaMetric.score)
          ) {
            enriched.deltaScore = deltaMetric.score
            if (deltaMetric.score !== 0) {
              enriched.deltaText = formatScoreDelta(deltaMetric.score)
            }
          }
        }

        return enriched
      })
      setScoreBreakdown(metrics)

      const nextResumeSkills = Array.isArray(data.resumeSkills) ? data.resumeSkills : []
      setResumeSkills(nextResumeSkills)

      const normalizeSkillList = (value) =>
        (Array.isArray(value) ? value : [])
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter(Boolean)

      const previousMissingList = normalizeSkillList(previousMissingSkills)
      const responseCovered = normalizeSkillList(data.coveredSkills)

      const beforeSelectionValue =
        typeof selectionSummary?.before === 'number' && Number.isFinite(selectionSummary.before)
          ? selectionSummary.before
          : null
      const afterSelectionValue =
        typeof selectionSummary?.after === 'number' && Number.isFinite(selectionSummary.after)
          ? selectionSummary.after
          : null
      const beforeLevel =
        typeof selectionSummary?.beforeLevel === 'string'
          ? selectionSummary.beforeLevel
          : null
      const afterLevel =
        typeof selectionSummary?.afterLevel === 'string'
          ? selectionSummary.afterLevel
          : null
      const beforeMeaning = beforeLevel || deriveSelectionMeaning(beforeSelectionValue)
      const afterMeaning = afterLevel || deriveSelectionMeaning(afterSelectionValue)
      const beforeMessage =
        selectionInsightsSummary?.before?.message || selectionInsightsSummary?.before?.rationale || null
      const afterMessage =
        selectionInsightsSummary?.after?.message ||
        selectionInsightsSummary?.after?.rationale ||
        selectionInsightsSummary?.message ||
        null
      const beforeRationale = buildSelectionRationale(
        beforeSelectionValue,
        beforeMeaning,
        beforeMessage
      )
      const afterRationale = buildSelectionRationale(
        afterSelectionValue,
        afterMeaning,
        afterMessage
      )
      const selectionDelta =
        typeof selectionSummary?.delta === 'number' && Number.isFinite(selectionSummary.delta)
          ? selectionSummary.delta
          : null

      const selectionFactorList = Array.isArray(selectionInsightsSummary?.factors)
        ? selectionInsightsSummary.factors
        : Array.isArray(selectionSummary?.factors)
          ? selectionSummary.factors
          : null

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

        const updatedMatch = {
          ...base,
          table: nextTable,
          missingSkills: nextMissing,
          addedSkills: mergedAdded,
          enhancedScore: enhancedScoreValue
        }

        if (overallSummary) {
          const overallBeforeScore =
            typeof overallSummary.before?.score === 'number' && Number.isFinite(overallSummary.before.score)
              ? overallSummary.before.score
              : null
          const overallAfterScore =
            typeof overallSummary.after?.score === 'number' && Number.isFinite(overallSummary.after.score)
              ? overallSummary.after.score
              : null
          if (overallBeforeScore !== null) {
            updatedMatch.originalScore = overallBeforeScore
            updatedMatch.atsScoreBefore = overallBeforeScore
          }
          if (overallAfterScore !== null) {
            updatedMatch.enhancedScore = overallAfterScore
            updatedMatch.atsScoreAfter = overallAfterScore
          }
          const overallMissing = Array.isArray(overallSummary.after?.missingSkills)
            ? overallSummary.after.missingSkills
            : null
          if (overallMissing) {
            updatedMatch.missingSkills = overallMissing
          }
        }

        if (selectionSummary || selectionInsightsSummary) {
          if (beforeSelectionValue !== null) {
            updatedMatch.selectionProbabilityBefore = beforeSelectionValue
          }
          if (afterSelectionValue !== null) {
            updatedMatch.selectionProbability = afterSelectionValue
            updatedMatch.selectionProbabilityAfter = afterSelectionValue
          }
          if (beforeMeaning) {
            updatedMatch.selectionProbabilityBeforeMeaning = beforeMeaning
          }
          if (afterMeaning) {
            updatedMatch.selectionProbabilityMeaning = afterMeaning
            updatedMatch.selectionProbabilityAfterMeaning = afterMeaning
          }
          if (beforeRationale !== null) {
            updatedMatch.selectionProbabilityBeforeRationale = beforeRationale
          }
          if (afterRationale !== null) {
            updatedMatch.selectionProbabilityRationale = afterRationale
            updatedMatch.selectionProbabilityAfterRationale = afterRationale
          }
          if (selectionDelta !== null) {
            updatedMatch.selectionProbabilityDelta = selectionDelta
          }
          if (selectionFactorList) {
            updatedMatch.selectionProbabilityFactors = cloneData(selectionFactorList)
          }
        }

        return updatedMatch
      })

      if (selectionInsightsSummary) {
        setSelectionInsights(cloneData(selectionInsightsSummary))
      } else if (selectionSummary) {
        setSelectionInsights((prev) => {
          const next = {
            ...(prev || {}),
            before: { ...(prev?.before || {}) },
            after: { ...(prev?.after || {}) }
          }

          if (beforeSelectionValue !== null) {
            next.before.probability = beforeSelectionValue
          }
          if (afterSelectionValue !== null) {
            next.after.probability = afterSelectionValue
            next.probability = afterSelectionValue
          }
          if (beforeMeaning) {
            next.before.level = beforeMeaning
          }
          if (afterMeaning) {
            next.after.level = afterMeaning
            next.level = afterMeaning
          }
          if (beforeRationale !== null) {
            next.before.message = beforeRationale
            next.before.rationale = beforeRationale
          }
          if (afterRationale !== null) {
            next.after.message = afterRationale
            next.after.rationale = afterRationale
            next.message = afterRationale
          }
          if (selectionDelta !== null) {
            next.delta = selectionDelta
          }
          if (selectionFactorList) {
            next.factors = cloneData(selectionFactorList)
          }

          return next
        })
      }

      const baselineValid = typeof baselineScore === 'number' && Number.isFinite(baselineScore)
      const enhancedValid =
        typeof data.enhancedScore === 'number' && Number.isFinite(data.enhancedScore)
      const computedDelta = baselineValid && enhancedValid ? data.enhancedScore - baselineScore : null
      const overallDelta =
        typeof overallSummary?.delta?.score === 'number' && Number.isFinite(overallSummary.delta.score)
          ? overallSummary.delta.score
          : null
      const finalDelta = overallDelta !== null ? overallDelta : computedDelta
      const enhancedScoreValue =
        typeof overallSummary?.after?.score === 'number' && Number.isFinite(overallSummary.after.score)
          ? overallSummary.after.score
          : enhancedValid
            ? data.enhancedScore
            : null

      return { delta: finalDelta, enhancedScore: enhancedScoreValue }
    },
    [API_BASE_URL, jobDescriptionText, jobSkills, userIdentifier]
  )

  const runQueuedImprovementRescore = useCallback(async () => {
    const queue = pendingImprovementRescoreRef.current
    if (!Array.isArray(queue) || queue.length === 0) {
      return false
    }

    if (scoreUpdateLockRef.current) {
      setError(SCORE_UPDATE_IN_PROGRESS_MESSAGE, { stage: 'score' })
      return false
    }

    scoreUpdateLockRef.current = true

    try {
      while (queue.length > 0) {
        const entry = queue[0]
        if (!entry || !entry.updatedResume) {
          queue.shift()
          continue
        }

        const {
          id,
          updatedResume,
          baselineScore,
          previousMissingSkills,
          rescoreSummary,
          changeLogEntry,
          persistedEntryPayload
        } = entry

        setImprovementResults((prev) =>
          prev.map((item) =>
            item.id === id
              ? { ...item, rescorePending: true, rescoreError: '' }
              : item
          )
        )

        try {
          const result = await rescoreAfterImprovement({
            updatedResume,
            baselineScore,
            previousMissingSkills,
            rescoreSummary
          })
          const deltaValue = result && Number.isFinite(result.delta) ? result.delta : null

          if (changeLogEntry && Number.isFinite(deltaValue)) {
            setChangeLog((prev) =>
              prev.map((entryItem) =>
                entryItem.id === changeLogEntry.id
                  ? { ...entryItem, scoreDelta: deltaValue }
                  : entryItem
              )
            )
            if (changeLogEntry.id) {
              try {
                const payloadWithDelta = persistedEntryPayload
                  ? { ...persistedEntryPayload, scoreDelta: deltaValue }
                  : { ...changeLogEntry, scoreDelta: deltaValue }
                await persistChangeLogEntry(payloadWithDelta)
              } catch (persistErr) {
                console.error('Updating change log entry failed', persistErr)
                const { source: serviceErrorSource, code: errorCode } =
                  deriveServiceContextFromError(persistErr)
                const { logs: persistLogs, requestId: persistRequestId } = extractErrorMetadata(persistErr)
                setError(
                  persistErr.message || 'Unable to update the change log entry.',
                  {
                    serviceError: serviceErrorSource,
                    errorCode,
                    logs: persistLogs,
                    requestId: persistRequestId,
                    stage: 'score'
                  }
                )
              }
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

          queue.shift()
        } catch (err) {
          console.error('Improvement rescore failed', err)
          const { source: serviceErrorSource, code: errorCode } =
            deriveServiceContextFromError(err)
          const { logs: improvementLogs, requestId: improvementRequestId } = extractErrorMetadata(err)
          setError(err.message || 'Unable to update scores after applying improvement.', {
            serviceError: serviceErrorSource,
            errorCode,
            logs: improvementLogs,
            requestId: improvementRequestId,
            stage: 'score'
          })
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
          return false
        }
      }

      return true
    } finally {
      scoreUpdateLockRef.current = false
    }
  }, [
    deriveServiceContextFromError,
    persistChangeLogEntry,
    rescoreAfterImprovement,
    setArtifactsUploaded,
    setChangeLog,
    setError,
    setImprovementResults
  ])

  const persistChangeLogEntry = useCallback(
    async (entry) => {
      if (!entry || !jobId) {
        return null
      }

      const payload = {
        jobId,
        entry
      }

      if (userIdentifier) {
        payload.userId = userIdentifier
      }

      const response = await fetch(buildApiUrl(API_BASE_URL, '/api/change-log'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errPayload = await response.json().catch(() => ({}))
        const { message, code, source, logs, requestId } = resolveApiError({
          data: errPayload,
          fallback: 'Unable to store the change log entry.',
          status: response.status
        })
        const error = new Error(message)
        if (code) {
          error.code = code
        }
        if (source) {
          error.serviceError = source
        }
        if (requestId) {
          error.requestId = requestId
        }
        if (Array.isArray(logs) && logs.length) {
          error.logs = logs
        }
        throw error
      }

      const data = await response.json()
      const entries = Array.isArray(data.changeLog) ? data.changeLog : []
      setChangeLog(entries)
      return entries
    },
    [API_BASE_URL, jobId, userIdentifier]
  )

  const applyImprovementSuggestion = useCallback(
    async (suggestion) => {
      if (!suggestion || !suggestion.id) {
        return false
      }

      const validationStatus = resolveImprovementValidationStatus(suggestion.validation)
      if (validationStatus === 'failed') {
        const reason =
          (suggestion?.validation?.jobAlignment?.reason &&
            suggestion.validation.jobAlignment.reason.trim()) ||
          'This improvement does not align with the job description. Review the suggestion before accepting.'
        setError(reason, { stage: 'enhance' })
        return false
      }

      if (scoreUpdateLockRef.current) {
        setError(SCORE_UPDATE_IN_PROGRESS_MESSAGE, { stage: 'score' })
        return false
      }

      scoreUpdateLockRef.current = true
      setArtifactsUploaded(false)
      try {
        const id = suggestion.id
        const updatedResumeDraft = suggestion.updatedResume || resumeText
        const baselineScore = getBaselineScoreFromMatch(match)
        const previousMissingSkills = Array.isArray(match?.missingSkills) ? match.missingSkills : []
        const changeLogEntry = buildChangeLogEntry(suggestion)
        const queueEntry = {
          id,
          updatedResume: updatedResumeDraft,
          baselineScore,
          previousMissingSkills,
          rescoreSummary: suggestion.rescoreSummary,
          changeLogEntry: null,
          persistedEntryPayload: null
        }
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

        const normalizedOriginalTitle =
          typeof suggestion.originalTitle === 'string' ? suggestion.originalTitle.trim() : ''
        const normalizedModifiedTitle =
          typeof suggestion.modifiedTitle === 'string' ? suggestion.modifiedTitle.trim() : ''

        if (normalizedOriginalTitle || normalizedModifiedTitle) {
          setMatch((prev) => {
            const base = prev ? { ...prev } : {}
            const currentOriginal = typeof prev?.originalTitle === 'string' ? prev.originalTitle : ''
            const currentModified = typeof prev?.modifiedTitle === 'string' ? prev.modifiedTitle : ''

            const shouldUpdateOriginal =
              normalizedOriginalTitle && normalizedOriginalTitle !== currentOriginal
            const shouldUpdateModified =
              normalizedModifiedTitle && normalizedModifiedTitle !== currentModified

            if (!shouldUpdateOriginal && !shouldUpdateModified) {
              return prev
            }

            if (shouldUpdateOriginal) {
              base.originalTitle = normalizedOriginalTitle
            }
            if (shouldUpdateModified) {
              base.modifiedTitle = normalizedModifiedTitle
            }

            return base
          })
        }

        if (updatedResumeDraft) {
          setResumeText(updatedResumeDraft)
        }

        let persistedEntryPayload = null
        if (changeLogEntry) {
          queueEntry.changeLogEntry = cloneData(changeLogEntry)
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
          queueEntry.persistedEntryPayload = cloneData(entryPayload)
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
            const { source: serviceErrorSource, code: errorCode } =
              deriveServiceContextFromError(err)
            const { logs: persistLogs, requestId: persistRequestId } = extractErrorMetadata(err)
            setError(err.message || 'Unable to store the change log entry.', {
              serviceError: serviceErrorSource,
              errorCode,
              logs: persistLogs,
              requestId: persistRequestId,
              stage: 'enhance'
            })
            setChangeLog(previousChangeLog || [])
          }
        }

        pendingImprovementRescoreRef.current = [
          ...pendingImprovementRescoreRef.current.filter((entry) => entry?.id !== id),
          {
            ...queueEntry,
            changeLogEntry: queueEntry.changeLogEntry
              ? cloneData(queueEntry.changeLogEntry)
              : null,
            persistedEntryPayload: queueEntry.persistedEntryPayload
              ? cloneData(queueEntry.persistedEntryPayload)
              : null
          }
        ]

        return true
      } finally {
        scoreUpdateLockRef.current = false
      }
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
      setMatch,
      setResumeText
    ]
  )

  const handleDownloadPreviousVersion = useCallback(
    (changeId) => {
      if (!changeId) {
        setError('Unable to download the previous version for this update.', {
          stage: 'enhance'
        })
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
        setError('Previous version is unavailable for this update.', {
          stage: 'enhance'
        })
        return
      }
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        setError('Download is not supported in this environment.', {
          stage: 'enhance'
        })
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
        resetUiAfterDownload()
      } catch (err) {
        console.error('Unable to download previous resume version', err)
        setError('Unable to download the previous version. Please try again.', {
          stage: 'enhance'
        })
      }
    },
    [changeLog, resetUiAfterDownload, resumeHistoryMap, setError]
  )

  const handleRevertChange = useCallback(
    async (changeId) => {
      if (!changeId) {
        setError('Unable to revert this update.', { stage: 'enhance' })
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
        setError('Previous version is unavailable for this update.', {
          stage: 'enhance'
        })
        return
      }

      const previousResumeText =
        typeof historyEntry.resumeBefore === 'string'
          ? historyEntry.resumeBefore
          : typeof historyEntry.resumeBeforeText === 'string'
            ? historyEntry.resumeBeforeText
            : ''
      if (!previousResumeText) {
        setError('Previous version is unavailable for this update.', {
          stage: 'enhance'
        })
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
      pendingImprovementRescoreRef.current = pendingImprovementRescoreRef.current.filter(
        (entry) => entry?.id !== historyEntry.suggestionId
      )

      if (existingEntry) {
        try {
          await persistChangeLogEntry(revertedEntry)
        } catch (err) {
          console.error('Unable to persist change log revert', err)
          setError(
            err?.message
              ? err.message
              : 'Unable to mark the change as reverted. Please try again.',
            { stage: 'enhance' }
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
      if (!entryId || !jobId) {
        return null
      }

      const payload = {
        jobId,
        remove: true,
        entryId
      }

      if (userIdentifier) {
        payload.userId = userIdentifier
      }

      const response = await fetch(buildApiUrl(API_BASE_URL, '/api/change-log'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errPayload = await response.json().catch(() => ({}))
        const { message, code, source, logs, requestId } = resolveApiError({
          data: errPayload,
          fallback: 'Unable to remove the change log entry.',
          status: response.status
        })
        const error = new Error(message)
        if (code) {
          error.code = code
        }
        if (source) {
          error.serviceError = source
        }
        if (requestId) {
          error.requestId = requestId
        }
        if (Array.isArray(logs) && logs.length) {
          error.logs = logs
        }
        throw error
      }

      const data = await response.json()
      const entries = Array.isArray(data.changeLog) ? data.changeLog : []
      setChangeLog(entries)
      return entries
    },
    [API_BASE_URL, jobId, userIdentifier]
  )

  const handleGenerateEnhancedDocs = useCallback(async () => {
    if (!jobId) {
      setError('Upload your resume and job description before generating downloads.', {
        stage: 'generate'
      })
      return
    }
    if (!improvementsUnlocked) {
      setError('Complete the initial scoring and improvement review before generating downloads.', {
        stage: 'generate'
      })
      return
    }
    if (
      improvementsRequireAcceptance &&
      (!hasAcceptedImprovement || !acceptedImprovementsValidated)
    ) {
      const message = !hasAcceptedImprovement
        ? 'Accept at least one improvement before generating the enhanced documents.'
        : 'Confirm the JD-aligned improvements before generating the enhanced documents.'
      setError(message, {
        stage: 'generate'
      })
      return
    }
    if (isGeneratingDocs) {
      return
    }

    setIsGeneratingDocs(true)
    setError('', { stage: 'generate' })
    setArtifactsUploaded(false)
    try {
      const {
        canonicalTemplate,
        canonicalPrimaryTemplate,
        canonicalSecondaryTemplate,
        canonicalCoverTemplate,
        canonicalCoverPrimaryTemplate,
        canonicalCoverSecondaryTemplate,
        canonicalTemplateList,
        canonicalCoverTemplateList,
        context: requestTemplateContext
      } = buildTemplateRequestContext(templateContext, selectedTemplate)

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
        manualCertificates: manualCertificatesData,
        templateContext: requestTemplateContext,
        templateId: canonicalTemplate,
        template: canonicalTemplate,
        template1: canonicalPrimaryTemplate,
        template2: canonicalSecondaryTemplate,
        templates: canonicalTemplateList,
        coverTemplate: canonicalCoverTemplate,
        coverTemplate1: canonicalCoverPrimaryTemplate,
        coverTemplate2: canonicalCoverSecondaryTemplate,
        coverTemplates: canonicalCoverTemplateList,
        ...(userIdentifier ? { userId: userIdentifier } : {}),
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
        const errorMessages = extractServerMessages(errPayload)
        if (errorMessages.length > 0) {
          setQueuedMessage(errorMessages[errorMessages.length - 1])
        } else {
          setQueuedMessage('')
        }
        const { message, code, isFriendly, source, logs, requestId } = resolveApiError({
          data: errPayload,
          fallback: CV_GENERATION_ERROR_MESSAGE,
          status: response.status
        })
        const finalMessage =
          !isFriendly && code && code !== 'PROCESSING_FAILED'
            ? `${message} (${code})`
            : message
        const error = new Error(finalMessage)
        if (code) {
          error.code = code
        }
        if (source) {
          error.serviceError = source
        }
        if (requestId) {
          error.requestId = requestId
        }
        if (Array.isArray(logs) && logs.length) {
          error.logs = logs
        }
        throw error
      }

      const data = await response.json()
      const serverMessages = extractServerMessages(data)
      if (serverMessages.length > 0) {
        setQueuedMessage(serverMessages[serverMessages.length - 1])
      } else {
        setQueuedMessage('')
      }
      const urlsValue = normalizeOutputFiles(data.urls, {
        defaultExpiresAt: data?.urlExpiresAt,
        defaultExpiresInSeconds: data?.urlExpiresInSeconds,
        allowEmptyUrls: true
      })
      updateOutputFiles(urlsValue, { generatedAt: data?.generatedAt })
      setArtifactsUploaded(Boolean(data?.artifactsUploaded || urlsValue.length > 0))
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

      const selectionInsightsValue = data.selectionInsights || {}
      const selectionInsightsBefore = selectionInsightsValue.before || {}
      const selectionInsightsAfter =
        selectionInsightsValue.after || selectionInsightsValue

      const probabilityBeforeValue =
        typeof data.selectionProbabilityBefore === 'number'
          ? data.selectionProbabilityBefore
          : typeof selectionInsightsBefore?.probability === 'number'
            ? selectionInsightsBefore.probability
            : null
      const probabilityAfterValue =
        typeof data.selectionProbabilityAfter === 'number'
          ? data.selectionProbabilityAfter
          : typeof data.selectionProbability === 'number'
            ? data.selectionProbability
            : typeof selectionInsightsAfter?.probability === 'number'
              ? selectionInsightsAfter.probability
              : null
      const probabilityBeforeMeaning =
        selectionInsightsBefore?.level ||
        deriveSelectionMeaning(probabilityBeforeValue)
      const probabilityAfterMeaning =
        selectionInsightsAfter?.level ||
        selectionInsightsValue?.level ||
        deriveSelectionMeaning(probabilityAfterValue)
      const probabilityBeforeMessage =
        selectionInsightsBefore?.message || selectionInsightsBefore?.rationale || null
      const probabilityAfterMessage =
        selectionInsightsAfter?.message ||
        selectionInsightsAfter?.rationale ||
        selectionInsightsValue?.message ||
        selectionInsightsValue?.rationale ||
        null
      const probabilityBeforeRationale = buildSelectionRationale(
        probabilityBeforeValue,
        probabilityBeforeMeaning,
        probabilityBeforeMessage
      )
      const probabilityAfterRationale = buildSelectionRationale(
        probabilityAfterValue,
        probabilityAfterMeaning,
        probabilityAfterMessage
      )
      const probabilityDeltaValue =
        typeof data.selectionProbabilityDelta === 'number'
          ? data.selectionProbabilityDelta
          : typeof probabilityBeforeValue === 'number' &&
            typeof probabilityAfterValue === 'number'
            ? probabilityAfterValue - probabilityBeforeValue
            : null
      const probabilityFactors = Array.isArray(data.selectionProbabilityFactors)
        ? data.selectionProbabilityFactors
        : Array.isArray(selectionInsightsValue?.factors)
          ? selectionInsightsValue.factors
          : null

      const probabilityValue = probabilityAfterValue
      const probabilityMeaning = probabilityAfterMeaning
      const probabilityRationale = probabilityAfterRationale

      const originalScoreValue = normalizePercent(data.originalScore)
      const enhancedScoreValue =
        normalizePercent(data.enhancedScore) ?? originalScoreValue

      setMatch((prev) => {
        const base = prev ? { ...prev } : {}

        base.table = Array.isArray(data.table) ? data.table : base.table || []
        base.addedSkills = Array.isArray(data.addedSkills)
          ? data.addedSkills
          : base.addedSkills || []
        base.missingSkills = Array.isArray(data.missingSkills)
          ? data.missingSkills
          : base.missingSkills || []

        if (originalScoreValue !== null) {
          base.originalScore = originalScoreValue
          base.atsScoreBefore = originalScoreValue
        }
        if (enhancedScoreValue !== null) {
          base.enhancedScore = enhancedScoreValue
          base.atsScoreAfter = enhancedScoreValue
        }

        if (typeof data.atsScoreBefore === 'number') {
          base.atsScoreBefore = data.atsScoreBefore
        }
        if (typeof data.atsScoreAfter === 'number') {
          base.atsScoreAfter = data.atsScoreAfter
          base.enhancedScore = data.atsScoreAfter
        }

        base.originalTitle =
          typeof data.originalTitle === 'string' ? data.originalTitle : base.originalTitle || ''
        base.modifiedTitle =
          typeof data.modifiedTitle === 'string' ? data.modifiedTitle : base.modifiedTitle || ''

        if (probabilityBeforeValue !== null) {
          base.selectionProbabilityBefore = probabilityBeforeValue
        }
        if (probabilityAfterValue !== null) {
          base.selectionProbability = probabilityAfterValue
          base.selectionProbabilityAfter = probabilityAfterValue
        }
        if (probabilityBeforeMeaning) {
          base.selectionProbabilityBeforeMeaning = probabilityBeforeMeaning
        }
        if (probabilityAfterMeaning) {
          base.selectionProbabilityMeaning = probabilityAfterMeaning
          base.selectionProbabilityAfterMeaning = probabilityAfterMeaning
        }
        if (probabilityBeforeRationale) {
          base.selectionProbabilityBeforeRationale = probabilityBeforeRationale
        }
        if (probabilityAfterRationale) {
          base.selectionProbabilityRationale = probabilityAfterRationale
          base.selectionProbabilityAfterRationale = probabilityAfterRationale
        }
        if (probabilityDeltaValue !== null) {
          base.selectionProbabilityDelta = probabilityDeltaValue
        }
        if (probabilityFactors) {
          base.selectionProbabilityFactors = cloneData(probabilityFactors)
        }

        return base
      })

      const toMetricArray = (value) => {
        if (Array.isArray(value)) return value
        if (value && typeof value === 'object') return Object.values(value)
        return []
      }
      const breakdownCandidates = toMetricArray(
        data.atsSubScores || data.atsSubScoresAfter || data.scoreBreakdown
      )
      const baselineCandidates = toMetricArray(
        data.atsSubScoresBefore || data.baselineScoreBreakdown
      )
      if (baselineCandidates.length && baselineScoreBreakdown.length === 0) {
        const normalizedBaseline = orderAtsMetrics(baselineCandidates).map((metric) => ({
          ...metric,
          tip: metric?.tip ?? metric?.tips?.[0] ?? ''
        }))
        setBaselineScoreBreakdown(normalizedBaseline)
      }
      const breakdownSource = breakdownCandidates.length
        ? breakdownCandidates
        : baselineCandidates.length
          ? baselineCandidates
          : []
      const normalizedBreakdown = orderAtsMetrics(breakdownSource).map((metric) => ({
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
      setSelectionInsights(selectionInsightsValue || selectionInsights)
    } catch (err) {
      console.error('Enhanced document generation failed', err)
      const message =
        (typeof err?.message === 'string' && err.message.trim()) ||
        CV_GENERATION_ERROR_MESSAGE
      const { source: serviceErrorSource, code: errorCode } = deriveServiceContextFromError(err)
      const { logs: errorLogsValue, requestId: errorRequestId } = extractErrorMetadata(err)
      setError(message, {
        allowRetry: true,
        recovery: 'generation',
        serviceError: serviceErrorSource,
        errorCode,
        logs: errorLogsValue,
        requestId: errorRequestId,
        stage: 'generate'
      })
    } finally {
      setIsGeneratingDocs(false)
    }
  }, [
    API_BASE_URL,
    acceptedImprovementsValidated,
    hasAcceptedImprovement,
    improvementsRequireAcceptance,
    improvementsUnlocked,
    initialAnalysisSnapshot,
    isGeneratingDocs,
    jobDescriptionText,
    jobId,
    jobSkills,
    manualCertificatesData,
    userIdentifier,
    resumeSkills,
    resumeText,
    selectionInsights,
    certificateInsights,
    templateContext,
    updateOutputFiles,
    selectedTemplate,
    setArtifactsUploaded
  ])

  const handleAcceptImprovement = useCallback(
    async (id) => {
      const suggestion = improvementResults.find((item) => item.id === id)
      if (!suggestion) {
        return false
      }

      const applied = await applyImprovementSuggestion(suggestion)
      if (applied) {
        await runQueuedImprovementRescore()
      }
      if (applied && suggestion.type === 'enhance-all') {
        const summaryTextCandidate = formatEnhanceAllSummary(suggestion?.improvementSummary)
        const explanationText = typeof suggestion?.explanation === 'string' ? suggestion.explanation : ''
        const summaryText = (summaryTextCandidate || explanationText || '').trim()
        setEnhanceAllSummaryText(summaryText)
      }

      return applied
    },
    [applyImprovementSuggestion, improvementResults, runQueuedImprovementRescore]
  )

  const handleAcceptAllImprovements = useCallback(async () => {
    const pendingSuggestions = improvementResults.filter((item) => item.accepted === null)
    if (pendingSuggestions.length === 0) {
      return
    }

    setIsBulkAccepting(true)
    setError('', { stage: 'enhance' })

    try {
      for (const suggestion of pendingSuggestions) {
        const applied = await applyImprovementSuggestion(suggestion)
        if (!applied) {
          break
        }
        await runQueuedImprovementRescore()
        if (suggestion.type === 'enhance-all') {
          const summaryTextCandidate = formatEnhanceAllSummary(suggestion?.improvementSummary)
          const explanationText = typeof suggestion?.explanation === 'string' ? suggestion.explanation : ''
          const summaryText = (summaryTextCandidate || explanationText || '').trim()
          setEnhanceAllSummaryText(summaryText)
        }
      }
    } finally {
      setIsBulkAccepting(false)
    }
  }, [
    applyImprovementSuggestion,
    improvementResults,
    runQueuedImprovementRescore,
    setError
  ])

  const handleToggleImprovementSelection = useCallback((key) => {
    if (typeof key !== 'string' || !key.trim()) {
      return
    }
    const normalizedKey = key.trim()
    setSelectedImprovementKeys((prev) => {
      const existing = new Set(prev.filter((item) => typeof item === 'string' && item.trim()))
      const isEnhanceAll = normalizedKey === 'enhance-all'
      if (existing.has(normalizedKey)) {
        existing.delete(normalizedKey)
        return Array.from(existing)
      }
      if (isEnhanceAll) {
        return ['enhance-all']
      }
      existing.delete('enhance-all')
      existing.add(normalizedKey)
      return Array.from(existing)
    })
  }, [])

  const handleSelectAllImprovements = useCallback(() => {
    const selectable = improvementActions
      .map((action) => action.key)
      .filter((key) => key && key !== 'enhance-all')
    setSelectedImprovementKeys(selectable)
  }, [])

  const handleClearImprovementSelection = useCallback(() => {
    setSelectedImprovementKeys([])
  }, [])

  const executeImprovementRequest = useCallback(
    async (requestTypes = []) => {
      const normalizedTypes = Array.isArray(requestTypes)
        ? requestTypes.map((value) => (typeof value === 'string' ? value.trim() : '')).filter(Boolean)
        : []
      if (normalizedTypes.length === 0) {
        return
      }
      const allowedKeys = new Set(improvementActions.map((action) => action.key))
      let types = Array.from(new Set(normalizedTypes.filter((key) => allowedKeys.has(key))))
      if (!types.length) {
        return
      }
      if (!types.includes('enhance-all')) {
        setEnhanceAllSummaryText('')
      }
      if (types.includes('enhance-all') && types.length > 1) {
        types = ['enhance-all']
      }
      const shouldUseImproveAll =
        types.includes('enhance-all') ||
        (IMPROVE_ALL_BATCH_KEYS.length > 0 &&
          IMPROVE_ALL_BATCH_KEYS.every((key) => types.includes(key)))
      const requestTypesNormalized = shouldUseImproveAll ? IMPROVE_ALL_BATCH_KEYS : types
      const requestPath = shouldUseImproveAll ? '/api/improve-all' : '/api/improve-batch'
      if (improvementLockRef.current) {
        setError('Please wait for the current improvement to finish before requesting another one.', {
          stage: 'enhance'
        })
        return
      }
      if (!jobId) {
        setError('Upload your resume and complete scoring before requesting improvements.', {
          stage: 'enhance'
        })
        return
      }
      if (!improvementAvailable) {
        setError(
          improvementUnlockMessage || 'Complete the initial analysis before requesting improvements.',
          { stage: 'enhance' }
        )
        return
      }
      improvementLockRef.current = true
      const isBatchRequest = requestTypesNormalized.length > 1
      const activeImprovementKey = shouldUseImproveAll
        ? types.includes('enhance-all')
          ? 'enhance-all'
          : 'batch'
        : isBatchRequest
          ? 'batch'
          : types[0]
      setActiveImprovement(activeImprovementKey)
      setActiveImprovementBatchKeys(isBatchRequest ? requestTypesNormalized : [])
      setError('', { stage: 'enhance' })
      try {
        const requestUrl = buildApiUrl(API_BASE_URL, requestPath)
        const selectionTargetTitle =
          typeof selectionInsights?.designation?.targetTitle === 'string'
            ? selectionInsights.designation.targetTitle.trim()
            : ''
        const matchModifiedTitle =
          typeof match?.modifiedTitle === 'string' ? match.modifiedTitle.trim() : ''
        const matchOriginalTitle =
          typeof match?.originalTitle === 'string' ? match.originalTitle.trim() : ''
        const targetJobTitle =
          selectionTargetTitle || parsedJobTitle || matchModifiedTitle || matchOriginalTitle
        const currentResumeTitle = matchModifiedTitle || matchOriginalTitle

        const {
          canonicalTemplate,
          canonicalPrimaryTemplate,
          canonicalSecondaryTemplate,
          canonicalCoverTemplate,
          canonicalCoverPrimaryTemplate,
          canonicalCoverSecondaryTemplate,
          canonicalTemplateList,
          canonicalCoverTemplateList,
          context: requestTemplateContext
        } = buildTemplateRequestContext(templateContext, selectedTemplate)

        const payload = {
          jobId,
          resumeText,
          jobDescription: jobDescriptionText,
          jobTitle: targetJobTitle,
          currentTitle: currentResumeTitle,
          originalTitle: matchOriginalTitle,
          jobSkills,
          resumeSkills,
          missingSkills: match?.missingSkills || [],
          knownCertificates,
          manualCertificates: manualCertificatesData,
          templateContext: cloneData(requestTemplateContext),
          templateId: canonicalTemplate,
          template: canonicalTemplate,
          template1: canonicalPrimaryTemplate,
          template2: canonicalSecondaryTemplate,
          templates: canonicalTemplateList,
          coverTemplate: canonicalCoverTemplate,
          coverTemplate1: canonicalCoverPrimaryTemplate,
          coverTemplate2: canonicalCoverSecondaryTemplate,
          coverTemplates: canonicalCoverTemplateList,
          types: requestTypesNormalized,
          toggles: requestTypesNormalized,
          primaryType: requestTypesNormalized[0]
        }
        if (manualCertificatesInput.trim()) {
          payload.manualCertificates = manualCertificatesInput.trim()
        }
        if (userIdentifier) {
          payload.userId = userIdentifier
        }

        const response = await fetch(requestUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })

        if (!response.ok) {
          const errPayload = await response.json().catch(() => ({}))
          const { message, code, source, logs, requestId } = resolveApiError({
            data: errPayload,
            fallback:
              response.status >= 500
                ? CV_GENERATION_ERROR_MESSAGE
                : 'Unable to generate improvement.',
            status: response.status
          })
          const error = new Error(message)
          if (code) {
            error.code = code
          }
          if (source) {
            error.serviceError = source
          }
          if (requestId) {
            error.requestId = requestId
          }
          if (Array.isArray(logs) && logs.length) {
            error.logs = logs
          }
          throw error
        }

        const data = await response.json()
        const urlsValue = normalizeOutputFiles(data.urls || data.assetUrls, {
          defaultExpiresAt: data?.urlExpiresAt,
          defaultExpiresInSeconds: data?.urlExpiresInSeconds,
          allowEmptyUrls: true
        })
        if (urlsValue.length) {
          updateOutputFiles(urlsValue, { generatedAt: data?.generatedAt })
          const {
            drafts: improvementCoverDrafts,
            originals: improvementCoverOriginals
          } = deriveCoverLetterStateFromFiles(urlsValue)
          setCoverLetterDrafts(improvementCoverDrafts)
          setCoverLetterOriginals(improvementCoverOriginals)
          setDownloadStates({})
        }
        setArtifactsUploaded(Boolean(data?.artifactsUploaded))
        const templateContextValue = normalizeTemplateContext(
          data && typeof data.templateContext === 'object' ? data.templateContext : null
        )
        if (templateContextValue) {
          setTemplateContext(templateContextValue)
        }
        const results = Array.isArray(data.results) ? data.results : [data]
        let latestEnhanceAllSummary = ''
        const suggestionsToAdd = results.map((item, index) => {
          const entryType =
            typeof item?.type === 'string' && item.type.trim()
              ? item.type.trim()
              : types[Math.min(index, types.length - 1)]
          const improvementSummary = Array.isArray(item?.improvementSummary)
            ? item.improvementSummary
            : []
          const enhanceAllSummaryCandidate =
            entryType === 'enhance-all' && improvementSummary.length
              ? formatEnhanceAllSummary(improvementSummary)
              : ''
          let explanation =
            (typeof item?.explanation === 'string' && item.explanation.trim()) ||
            'Change generated successfully.'
          if (entryType === 'enhance-all' && improvementSummary.length && enhanceAllSummaryCandidate) {
            const meaningfulBase =
              explanation && !/^applied deterministic improvements/i.test(explanation)
            explanation = meaningfulBase
              ? `${explanation} ${enhanceAllSummaryCandidate}`
              : enhanceAllSummaryCandidate
            latestEnhanceAllSummary = enhanceAllSummaryCandidate
          }
          const originalTitle =
            typeof item?.originalTitle === 'string' ? item.originalTitle.trim() : ''
          const modifiedTitle =
            typeof item?.modifiedTitle === 'string' ? item.modifiedTitle.trim() : ''
          return {
            id: `${entryType}-${Date.now()}-${index}`,
            type: entryType,
            title:
              item?.title ||
              improvementActions.find((action) => action.key === entryType)?.label ||
              'Improvement',
            beforeExcerpt: item?.beforeExcerpt || '',
            afterExcerpt: item?.afterExcerpt || '',
            explanation,
            updatedResume: item?.updatedResume || resumeText,
            confidence: typeof item?.confidence === 'number' ? item.confidence : 0.6,
            accepted: null,
            originalTitle,
            modifiedTitle,
            improvementSummary,
            rescoreSummary: normalizeRescoreSummary(item?.rescore || item?.rescoreSummary),
            scoreDelta: null,
            rescorePending: false,
            rescoreError: '',
            validation: normalizeImprovementValidation(item?.validation)
          }
        })
        if (latestEnhanceAllSummary) {
          setEnhanceAllSummaryText(latestEnhanceAllSummary)
        }
        if (suggestionsToAdd.length) {
          setImprovementResults((prev) => [...suggestionsToAdd, ...prev])
        }
        setSelectedImprovementKeys((prev) =>
          prev.filter((key) => !types.includes(key))
        )
      } catch (err) {
        console.error('Improvement request failed', err)
        const errorMessage =
          (typeof err?.message === 'string' && err.message.trim()) ||
          CV_GENERATION_ERROR_MESSAGE
        const { source: serviceErrorSource, code: errorCode } = deriveServiceContextFromError(err)
        const { logs: improvementLogs, requestId: improvementRequestId } = extractErrorMetadata(err)
        setError(errorMessage, {
          serviceError: serviceErrorSource,
          errorCode,
          logs: improvementLogs,
          requestId: improvementRequestId,
          stage: 'enhance'
        })
        if (types.includes('enhance-all')) {
          setEnhanceAllSummaryText('')
        }
      } finally {
        setActiveImprovement('')
        setActiveImprovementBatchKeys([])
        improvementLockRef.current = false
      }
    },
    [
      API_BASE_URL,
      buildTemplateRequestContext,
      cloneData,
      deriveCoverLetterStateFromFiles,
      deriveServiceContextFromError,
      improvementActions,
      improvementAvailable,
      improvementLockRef,
      improvementUnlockMessage,
      jobDescriptionText,
      jobId,
      jobSkills,
      knownCertificates,
      manualCertificatesData,
      manualCertificatesInput,
      match,
      normalizeOutputFiles,
      normalizeRescoreSummary,
      normalizeTemplateContext,
      parsedJobTitle,
      resumeText,
      resumeSkills,
      selectionInsights,
      selectedTemplate,
      formatEnhanceAllSummary,
      setActiveImprovement,
      setActiveImprovementBatchKeys,
      setArtifactsUploaded,
      setCoverLetterDrafts,
      setCoverLetterOriginals,
      setDownloadStates,
      setEnhanceAllSummaryText,
      setError,
      setImprovementResults,
      setSelectedImprovementKeys,
      setTemplateContext,
      templateContext,
      updateOutputFiles,
      userIdentifier
    ]
  )

  const handleImprovementClick = async (type) => {
    if (typeof type !== 'string' || !type.trim()) {
      return
    }
    await executeImprovementRequest([type.trim()])
  }

  const handleRunSelectedImprovements = useCallback(async () => {
    if (!selectedImprovementKeys.length) {
      return
    }
    await executeImprovementRequest(selectedImprovementKeys)
  }, [executeImprovementRequest, selectedImprovementKeys])

  const handleRejectImprovement = async (id) => {
    const targetSuggestion = improvementResults.find((item) => item.id === id)
    if (!targetSuggestion) {
      return false
    }

    const wasAccepted = targetSuggestion.accepted === true

    if (wasAccepted && scoreUpdateLockRef.current) {
      setError(SCORE_UPDATE_IN_PROGRESS_MESSAGE, { stage: 'score' })
      return false
    }

    const previousEnhanceAllSummaryText = enhanceAllSummaryText
    const previousImprovementResults = cloneData(improvementResults)
    const previousChangeLogState = cloneData(changeLog)
    const previousResumeTextValue = resumeText
    const previousMatchValue = match ? cloneData(match) : null
    const previousScoreBreakdownValue = Array.isArray(scoreBreakdown)
      ? cloneData(scoreBreakdown)
      : []
    const previousResumeSkillsValue = Array.isArray(resumeSkills)
      ? cloneData(resumeSkills)
      : []
    const previousResumeHistoryValue = Array.isArray(resumeHistory)
      ? cloneData(resumeHistory)
      : []

    let historyEntry = null
    let revertResumeText = ''
    let revertMatch = null
    let revertScoreBreakdown = []
    let revertResumeSkills = []

    if (wasAccepted) {
      historyEntry = resumeHistoryMap.get(id) || null
      if (!historyEntry) {
        const changeEntry = changeLog.find((entry) => entry?.id === id)
        if (changeEntry && typeof changeEntry.resumeBeforeText === 'string') {
          historyEntry = {
            id: changeEntry.id,
            suggestionId: changeEntry.id,
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

      const previousResumeText = historyEntry
        ? typeof historyEntry.resumeBefore === 'string' && historyEntry.resumeBefore
          ? historyEntry.resumeBefore
          : typeof historyEntry.resumeBeforeText === 'string'
            ? historyEntry.resumeBeforeText
            : ''
        : ''

      if (!historyEntry || !previousResumeText) {
        setError('Previous version is unavailable for this update.', {
          stage: 'enhance'
        })
        return false
      }

      revertResumeText = previousResumeText
      revertMatch = historyEntry.matchBefore
        ? cloneData(historyEntry.matchBefore)
        : null
      revertScoreBreakdown = Array.isArray(historyEntry.scoreBreakdownBefore)
        ? cloneData(historyEntry.scoreBreakdownBefore)
        : []
      revertResumeSkills = Array.isArray(historyEntry.resumeSkillsBefore)
        ? historyEntry.resumeSkillsBefore
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter(Boolean)
        : []
    }

    if (targetSuggestion?.type === 'enhance-all') {
      setEnhanceAllSummaryText('')
    }

    const shouldRescore =
      wasAccepted && typeof revertResumeText === 'string' && revertResumeText.trim().length > 0

    const releaseLock = wasAccepted

    if (releaseLock) {
      scoreUpdateLockRef.current = true
    }

    let success = false

    try {
      setImprovementResults((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
              ...item,
              accepted: false,
              rescorePending: shouldRescore,
              rescoreError: '',
              scoreDelta: null
            }
            : item
        )
      )

      setChangeLog((prev) => prev.filter((entry) => entry.id !== id))

      setResumeHistory((prev) => prev.filter((entry) => entry.id !== id))

      if (wasAccepted) {
        setResumeText(revertResumeText)
        setMatch(revertMatch ? cloneData(revertMatch) : null)
        setScoreBreakdown(revertScoreBreakdown)
        setResumeSkills(revertResumeSkills)
      }

      if (shouldRescore) {
        const revertBaselineScore = getBaselineScoreFromMatch(revertMatch)
        const revertMissingSkills = Array.isArray(revertMatch?.missingSkills)
          ? revertMatch.missingSkills
          : []
        pendingImprovementRescoreRef.current = [
          ...pendingImprovementRescoreRef.current.filter((entry) => entry?.id !== id),
          {
            id,
            updatedResume: revertResumeText,
            baselineScore: revertBaselineScore,
            previousMissingSkills: revertMissingSkills,
            rescoreSummary: null,
            changeLogEntry: null,
            persistedEntryPayload: null
          }
        ]
      } else {
        pendingImprovementRescoreRef.current = pendingImprovementRescoreRef.current.filter(
          (entry) => entry?.id !== id
        )
      }

      try {
        await removeChangeLogEntry(id)
        success = true
      } catch (err) {
        console.error('Removing change log entry failed', err)
        const { source: serviceErrorSource, code: errorCode } =
          deriveServiceContextFromError(err)
        const { logs: removalLogs, requestId: removalRequestId } = extractErrorMetadata(err)
        setError(err.message || 'Unable to remove the change log entry.', {
          serviceError: serviceErrorSource,
          errorCode,
          logs: removalLogs,
          requestId: removalRequestId,
          stage: 'enhance'
        })
        setChangeLog(previousChangeLogState || [])
        setImprovementResults(previousImprovementResults || [])
        setResumeHistory(previousResumeHistoryValue || [])
        if (targetSuggestion?.type === 'enhance-all') {
          setEnhanceAllSummaryText(previousEnhanceAllSummaryText)
        }
        if (wasAccepted) {
          setResumeText(previousResumeTextValue)
          setMatch(previousMatchValue ? cloneData(previousMatchValue) : null)
          setScoreBreakdown(previousScoreBreakdownValue)
          setResumeSkills(previousResumeSkillsValue)
        }
        return false
      }
    } finally {
      if (releaseLock) {
        scoreUpdateLockRef.current = false
      }
    }

    return success
  }

  const handlePreviewImprovement = useCallback(
    (suggestion) => {
      if (!suggestion) return
      const previewEntry = buildChangeLogEntry(suggestion)
      setPreviewActionBusy(false)
      setPreviewActiveAction('')
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

  const previewedSuggestion = useMemo(() => {
    if (!previewSuggestion) return null
    return improvementResults.find((item) => item.id === previewSuggestion.id) || null
  }, [previewSuggestion, improvementResults])

  const previewAcceptDisabled =
    previewActionBusy ||
    !previewedSuggestion ||
    previewedSuggestion.accepted === true ||
    previewedSuggestion.rescorePending === true

  const previewRejectDisabled = previewActionBusy || !previewedSuggestion

  const previewAcceptLabel = previewedSuggestion?.accepted
    ? 'Applied'
    : previewActiveAction === 'accept'
      ? 'Applying…'
      : 'Accept Change'

  const previewRejectLabel = previewActiveAction === 'reject' ? 'Rejecting…' : 'Reject'

  const handlePreviewDecision = useCallback(
    async (action) => {
      if (!previewSuggestion) {
        return
      }
      if (!previewedSuggestion) {
        setError('This improvement is no longer available.', { stage: 'enhance' })
        return
      }
      setPreviewActiveAction(action)
      setPreviewActionBusy(true)
      try {
        let result = false
        if (action === 'accept') {
          result = await handleAcceptImprovement(previewedSuggestion.id)
        } else if (action === 'reject') {
          result = await handleRejectImprovement(previewedSuggestion.id)
        }
        if (result !== false) {
          closePreview()
        }
      } catch (err) {
        console.error('Unable to update improvement from preview', err)
        const fallbackMessage =
          action === 'reject'
            ? 'Unable to reject this improvement from the preview.'
            : 'Unable to accept this improvement from the preview.'
        const { source: serviceErrorSource, code: errorCode } =
          deriveServiceContextFromError(err)
        const { logs: previewLogs, requestId: previewRequestId } = extractErrorMetadata(err)
        setError(err?.message || fallbackMessage, {
          serviceError: serviceErrorSource,
          errorCode,
          logs: previewLogs,
          requestId: previewRequestId,
          stage: 'enhance'
        })
      } finally {
        setPreviewActionBusy(false)
        setPreviewActiveAction('')
      }
    },
    [
      previewSuggestion,
      previewedSuggestion,
      handleAcceptImprovement,
      handleRejectImprovement,
      closePreview,
      setError
    ]
  )

  const handlePreviewAccept = useCallback(() => handlePreviewDecision('accept'), [handlePreviewDecision])

  const handlePreviewReject = useCallback(() => handlePreviewDecision('reject'), [handlePreviewDecision])

  const jobDescriptionReady = hasManualJobDescriptionInput
  const rescoreRequiresAcceptedChanges = improvementsRequireAcceptance && !hasAcceptedImprovement
  const rescoreDisabled =
    !cvFile ||
    isProcessing ||
    !jobDescriptionReady ||
    rescoreRequiresAcceptedChanges ||
    isBulkAccepting
  const rescoreButtonLabel = isProcessing
    ? 'Scoring…'
    : hasPendingImprovementRescore
      ? 'Rescore accepted updates'
      : scoreDashboardReady
        ? 'Rescore CV'
        : 'Run ATS scoring'
  const rescoreHelperMessage = (() => {
    if (rescoreRequiresAcceptedChanges) {
      return 'Accept improvements before re-running ATS scoring.'
    }
    if (hasPendingImprovementRescore) {
      return 'Rescore to apply accepted improvements to your ATS dashboard.'
    }
    return ''
  })()
  const metricsCount = Array.isArray(scoreBreakdown) ? scoreBreakdown.length : 0
  const scoreStageCount = metricsCount > 0 ? metricsCount : matchHasSelectionProbability ? 1 : 0
  const suggestionsCount = improvementResults.length
  const changeLogCount = changeLog.length
  const dashboardStageOptions = [
    { key: 'score', label: 'Scores', count: scoreStageCount, ready: scoreDashboardHasContent },
    { key: 'suggestions', label: 'Suggestions', count: suggestionsCount, ready: suggestionsCount > 0 },
    { key: 'changelog', label: 'Change Log', count: changeLogCount, ready: changeLogCount > 0 }
  ]

  const isEnhancementReviewPhase =
    currentPhase === 'enhance' ||
    currentPhase === 'generate' ||
    currentPhase === 'download'

  const allowedDashboardStageKeys = useMemo(() => {
    if (currentPhase === 'score') {
      return ['score']
    }
    if (isEnhancementReviewPhase) {
      return ['suggestions', 'changelog']
    }
    return []
  }, [currentPhase, isEnhancementReviewPhase])

  const filteredDashboardStageOptions = useMemo(
    () => dashboardStageOptions.filter((stage) => allowedDashboardStageKeys.includes(stage.key)),
    [allowedDashboardStageKeys, dashboardStageOptions]
  )

  useEffect(() => {
    if (filteredDashboardStageOptions.length === 0) {
      return
    }
    setActiveDashboardStage((currentStage) => {
      if (allowedDashboardStageKeys.includes(currentStage)) {
        if (
          currentStage === 'suggestions' &&
          improvementResults.length === 0 &&
          allowedDashboardStageKeys.includes('changelog') &&
          changeLog.length > 0
        ) {
          return 'changelog'
        }
        if (
          currentStage === 'changelog' &&
          changeLog.length === 0 &&
          allowedDashboardStageKeys.includes('suggestions') &&
          improvementResults.length > 0
        ) {
          return 'suggestions'
        }
        return currentStage
      }
      return filteredDashboardStageOptions[0]?.key || currentStage
    })
  }, [
    allowedDashboardStageKeys,
    changeLog.length,
    filteredDashboardStageOptions,
    improvementResults.length
  ])

  const coverLetterEditorType = coverLetterEditor?.type || ''
  const coverLetterEditorFile = (coverLetterEditor && coverLetterEditor.file) || {}
  const coverLetterEditorTemplate = useMemo(() => {
    if (!coverLetterEditor || !isCoverLetterType(coverLetterEditor.type)) {
      return null
    }
    const selection = resolveCoverTemplateSelection({
      file: coverLetterEditor.file || {},
      type: coverLetterEditor.type,
      downloadTemplateMetadata,
      templateContext
    })
    return selection
  }, [coverLetterEditor, downloadTemplateMetadata, templateContext])
  const coverLetterEditorDraftText = coverLetterEditor
    ? resolveCoverLetterDraftText(
      coverLetterDrafts,
      coverLetterOriginals,
      coverLetterEditorType,
      coverLetterEditorFile
    )
    : ''
  const coverLetterEditorOriginalText = coverLetterEditor
    ? coverLetterOriginals[coverLetterEditorType] ??
    getCoverLetterTextFromFile(coverLetterEditorFile)
    : ''
  const coverLetterEditorHasChanges = Boolean(
    coverLetterEditor && coverLetterEditorDraftText !== coverLetterEditorOriginalText
  )
  const coverLetterEditorWordCount = coverLetterEditorDraftText.trim()
    ? coverLetterEditorDraftText
      .trim()
      .split(/\s+/)
      .filter(Boolean).length
    : 0

  const handleCoverEditorChange = useCallback(
    (value) => {
      if (!coverLetterEditor || !coverLetterEditorType) {
        return
      }
      handleCoverLetterTextChange(coverLetterEditorType, value)
    },
    [coverLetterEditor, coverLetterEditorType, handleCoverLetterTextChange]
  )

  const handleCoverEditorReset = useCallback(() => {
    if (!coverLetterEditor || !coverLetterEditorType) {
      return
    }
    resetCoverLetterDraft(coverLetterEditorType)
  }, [coverLetterEditor, coverLetterEditorType, resetCoverLetterDraft])

  const handleCoverEditorCopy = useCallback(() => {
    if (!coverLetterEditor || !coverLetterEditorType) {
      return
    }
    handleCopyCoverLetter(coverLetterEditorType, coverLetterEditorFile)
  }, [
    coverLetterEditor,
    coverLetterEditorType,
    coverLetterEditorFile,
    handleCopyCoverLetter
  ])

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

        {cloudfrontFallbackActive && (
          <section
            className="rounded-3xl border border-amber-200 bg-amber-50/80 p-5 shadow-lg flex flex-col gap-2"
            role="alert"
            aria-live="assertive"
          >
            <h2 className="text-base md:text-lg font-semibold text-amber-900">
              CloudFront fallback active
            </h2>
            <p className="text-sm text-amber-800">
              We're serving ResumeForge directly from the API Gateway while the CDN recovers.
            </p>
            {cloudfrontMetadata.canonicalHost ? (
              <p className="text-xs text-amber-700">
                Primary CloudFront domain:{' '}
                <code className="font-mono break-all text-amber-900">
                  {cloudfrontMetadata.canonicalHost}
                </code>
              </p>
            ) : null}
            {cloudfrontMetadata.apiGatewayUrl ? (
              <p className="text-xs text-amber-700">
                Share the backup endpoint if teammates can't reach the CDN:{' '}
                <a
                  href={cloudfrontMetadata.apiGatewayUrl}
                  className="font-semibold text-amber-900 underline-offset-2 hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {cloudfrontMetadata.apiGatewayUrl}
                </a>
              </p>
            ) : null}
            {cloudfrontMetadata.updatedAt ? (
              <p className="text-[0.65rem] uppercase tracking-[0.25em] text-amber-600">
                Metadata updated at {cloudfrontMetadata.updatedAt}
              </p>
            ) : null}
            <input
              type="hidden"
              name="resumeforge-backup-api-base"
              data-backup-api-base
              value={cloudfrontMetadata.apiGatewayUrl || environmentOrigin || ''}
              readOnly
              aria-hidden="true"
            />
          </section>
        )}

        <section className="rounded-3xl border border-slate-200/80 bg-white/70 p-6 shadow-lg">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="space-y-3 md:max-w-sm">
              <p className="caps-label text-xs font-semibold text-slate-500">
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
              <figcaption className="caps-label-tight text-xs font-medium text-slate-500">
                Scan &amp; explore
              </figcaption>
            </figure>
          </div>
        </section>

        <ProcessFlow steps={flowSteps} />

        {queuedMessage && <p className="text-blue-700 text-center">{queuedMessage}</p>}
        {isProcessing && (
          <div className="flex justify-center">
            <div className="mt-4 h-10 w-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {error && (
          <div className="flex w-full flex-col items-center gap-4 text-center">
            <p className="text-red-600 text-sm font-semibold">{error}</p>
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-slate-600">
              {typeof errorContext?.code === 'string' && errorContext.code.trim() && (
                <span className="rounded-full bg-red-50 px-3 py-1 font-semibold uppercase tracking-wide text-red-600">
                  {errorContext.code}
                </span>
              )}
              {normalizeServiceSource(errorContext?.source) && (
                <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold uppercase tracking-wide text-slate-600">
                  {normalizeServiceSource(errorContext.source)}
                </span>
              )}
              {typeof errorContext?.requestId === 'string' && errorContext.requestId.trim() && (
                <span className="rounded-full bg-slate-100 px-3 py-1 font-mono text-[11px] text-slate-600">
                  Request: {errorContext.requestId}
                </span>
              )}
            </div>
            {errorLogs.length > 0 && (
              <div className="w-full max-w-xl space-y-2 rounded-2xl border border-slate-200 bg-white/80 p-4 text-left shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Log references
                </p>
                <ul className="space-y-2">
                  {errorLogs.map((log) => (
                    <li key={log.id} className="rounded-xl bg-slate-50 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">
                        <span className="uppercase tracking-wide text-slate-500">{log.channel}</span>
                        {typeof log.status === 'string' && log.status && (
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                            {log.status}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 space-y-1 break-all text-xs text-slate-600">
                        {log.location && (
                          <div>
                            <span className="font-medium text-slate-500">Location:</span> {log.location}
                          </div>
                        )}
                        {!log.location && log.bucket && log.key && (
                          <div>
                            <span className="font-medium text-slate-500">Bucket:</span> {log.bucket}
                            <span className="font-medium text-slate-500"> · Key:</span> {log.key}
                          </div>
                        )}
                        {log.requestId && (
                          <div>
                            <span className="font-medium text-slate-500">Request:</span>{' '}
                            <code className="font-mono">{log.requestId}</code>
                          </div>
                        )}
                        {log.message && (
                          <div>
                            <span className="font-medium text-slate-500">Note:</span> {log.message}
                          </div>
                        )}
                        {log.url && (
                          <div>
                            <span className="font-medium text-slate-500">URL:</span>{' '}
                            <a
                              href={log.url}
                              className="text-blue-600 underline"
                              target="_blank"
                              rel="noreferrer"
                            >
                              {log.url}
                            </a>
                          </div>
                        )}
                        {log.hint && (
                          <div>
                            <span className="font-medium text-slate-500">Hint:</span> {log.hint}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-center gap-2">
              {errorRecovery === 'generation' && (
                <button
                  type="button"
                  onClick={handleGenerateEnhancedDocs}
                  disabled={isGeneratingDocs}
                  className="inline-flex items-center justify-center rounded-full border border-purple-600 px-4 py-2 text-sm font-semibold text-purple-600 transition hover:bg-purple-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 disabled:cursor-not-allowed disabled:border-purple-300 disabled:text-purple-300"
                >
                  Retry generation
                </button>
              )}
              <button
                type="button"
                onClick={handleExportErrorLog}
                className="inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
              >
                Export log
              </button>
            </div>
          </div>
        )}

        {currentPhase === 'upload' && (
          <section className="bg-white/80 backdrop-blur rounded-3xl border border-purple-200/60 shadow-xl p-6 md:p-8 space-y-6">
            <header className="space-y-2">
              <p className="caps-label text-xs font-semibold text-purple-500">Step 1 · Upload</p>
              <h2 className="text-2xl font-bold text-purple-900">Upload your resume &amp; target JD</h2>
              <p className="text-sm text-purple-700/80">
                Drag in your CV, add the job description, and we&apos;ll automatically score all ATS metrics as soon as both are in place.
              </p>
            </header>
            <div
              className="w-full p-6 border-2 border-dashed border-purple-300 rounded-2xl text-center bg-gradient-to-r from-white to-purple-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={handleUploadAreaClick}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleUploadAreaClick()
                }
              }}
              role="button"
              tabIndex={0}
              aria-label="Upload resume by dragging and dropping or browsing for a file"
            >
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={handleFileChange}
                className="hidden"
                id="cv-input"
                ref={cvInputRef}
              />
              <div className="flex flex-col items-center gap-3">
                {cvFile ? (
                  <div className="space-y-3">
                    <p className="text-purple-900 font-semibold break-all">{cvFile.name}</p>
                    <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-semibold">
                      {formattedCvFileSize && (
                        <span className="rounded-full border border-purple-200/80 bg-white/80 px-3 py-1 text-purple-600">
                          File size · {formattedCvFileSize}
                        </span>
                      )}
                      {uploadStatusDetail.label && (
                        <span
                          className={`rounded-full border px-3 py-1 ${uploadStatusDetail.badgeClass}`}
                        >
                          Status · {uploadStatusDetail.label}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-lg font-semibold text-purple-800">Drag &amp; drop your CV</p>
                    <p className="text-sm text-purple-600">or click to browse (PDF, DOC, or DOCX · max 5 MB)</p>
                  </div>
                )}
                <div className="inline-flex flex-wrap items-center justify-center gap-2 text-xs font-semibold text-purple-600">
                  <span className="rounded-full border border-purple-200/80 bg-white/80 px-3 py-1">Drag &amp; drop</span>
                  <span className="rounded-full border border-purple-200/80 bg-white/80 px-3 py-1">Browse files</span>
                </div>
                {!cvFile && uploadStatusDetail.label && (
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${uploadStatusDetail.badgeClass}`}
                  >
                    {uploadStatusDetail.label}
                  </span>
                )}
              </div>
              <p className="mt-4 text-xs font-medium text-purple-600">{uploadStatusMessage}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2 space-y-2">
                <label className="text-sm font-semibold text-purple-700" htmlFor="manual-job-description">
                  Paste Full Job Description{' '}
                  <span className={manualJobDescriptionHasError ? 'text-rose-600' : 'text-purple-500'}>*</span>
                </label>
                <textarea
                  id="manual-job-description"
                  value={manualJobDescription}
                  onChange={(e) => setManualJobDescription(e.target.value)}
                  placeholder="Paste the entire job post here."
                  className={`w-full h-32 p-3 rounded-xl border focus:outline-none focus:ring-2 ${manualJobDescriptionHasError
                    ? 'border-rose-300 focus:ring-rose-400'
                    : 'border-purple-200 focus:ring-purple-400'
                    }`}
                  required
                  ref={manualJobDescriptionRef}
                />
                <p
                  className={`text-xs ${manualJobDescriptionHasError
                      ? 'text-rose-600 font-semibold'
                      : 'text-purple-500'
                    }`}
                >
                  {manualJobDescriptionHelperText}
                </p>
                {hasManualJobDescriptionInput && (
                  <JobDescriptionPreview text={manualJobDescription} />
                )}
              </div>
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

          </section>
        )}

        {filteredDashboardStageOptions.length > 0 && (
          <section className="space-y-5" aria-label="Improvement dashboard">
            <div className="flex flex-wrap gap-2 sm:gap-3">
              {filteredDashboardStageOptions.map((stage) => {
                const isActive = activeDashboardStage === stage.key
                const badgeLabel =
                  stage.key === 'score'
                    ? stage.ready
                      ? 'Ready'
                      : 'Pending'
                    : stage.count > 99
                      ? '99+'
                      : String(stage.count ?? 0)
                const badgeTone = isActive
                  ? 'bg-white/20 text-white'
                  : stage.ready
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-slate-100 text-slate-500'
                return (
                  <button
                    key={stage.key}
                    type="button"
                    onClick={() => setActiveDashboardStage(stage.key)}
                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 ${isActive
                        ? 'border-purple-600 bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-500/30'
                        : 'border-slate-200 bg-white/80 text-slate-600 hover:border-purple-300 hover:text-purple-700'
                      }`}
                    aria-pressed={isActive ? 'true' : 'false'}
                  >
                    <span>{stage.label}</span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${badgeTone}`}>
                      {badgeLabel}
                    </span>
                  </button>
                )
              })}
            </div>

            {currentPhase === 'score' && activeDashboardStage === 'score' && (
              <DashboardStage
                stageLabel="Score Stage"
                title="Score Overview"
                description="Monitor baseline ATS alignment and rerun scoring after each accepted update."
                accent="indigo"
                actions={
                  <div className="flex flex-col items-end gap-1">
                    <button
                      type="button"
                      onClick={handleScoreSubmit}
                      disabled={rescoreDisabled}
                      className={`inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-semibold text-white transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${rescoreDisabled
                          ? 'bg-indigo-300 cursor-not-allowed'
                          : 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700'
                        }`}
                      aria-busy={isProcessing ? 'true' : 'false'}
                    >
                      {rescoreButtonLabel}
                    </button>
                    {rescoreHelperMessage && (
                      <p className="text-xs font-semibold text-indigo-700/80 text-right">
                        {rescoreHelperMessage}
                      </p>
                    )}
                  </div>
                }
              >
                {scoreDashboardHasContent ? (
                  <>
                    <ATSScoreDashboard
                      metrics={scoreBreakdown}
                      baselineMetrics={baselineScoreBreakdown}
                      match={match}
                      metricActionMap={currentPhase === 'enhance' ? metricImprovementActionMap : null}
                      onImproveMetric={currentPhase === 'enhance' ? handleImprovementClick : undefined}
                      improvementState={
                        currentPhase === 'enhance' ? metricImprovementState : {}
                      }
                    />
                    {scoreDashboardReady && showDeltaSummary && (
                      <DeltaSummaryPanel summary={deltaSummary} />
                    )}
                  </>
                ) : (
                  <div className="rounded-3xl border border-dashed border-indigo-200/80 bg-white/70 p-6 text-sm text-indigo-700">
                    {isProcessing
                      ? 'Scoring in progress. Sit tight while we calculate your ATS metrics and current chances.'
                      : 'Upload your resume and job description to generate your ATS scores automatically.'}
                  </div>
                )}
              </DashboardStage>
            )}

            {isEnhancementReviewPhase && activeDashboardStage === 'suggestions' && (
              <DashboardStage
                stageLabel="Suggestions Stage"
                title="Review AI Suggestions"
                description="Work through targeted improvements and accept the updates you like."
              >
                {improvementResults.length > 0 ? (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex-1 rounded-2xl border border-purple-200/60 bg-purple-50/60 p-4 text-sm text-purple-800">
                        We added JD-aligned skills and highlights so you can prep for interview questions. Use the cards below to
                        accept, reject, or preview each update.
                      </div>
                      {hasPendingImprovementDecisions && (
                        <button
                          type="button"
                          onClick={handleAcceptAllImprovements}
                          disabled={improvementButtonsDisabled}
                          className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold text-white transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 ${improvementButtonsDisabled
                              ? 'bg-purple-300 cursor-not-allowed'
                              : 'bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700'
                            }`}
                          aria-busy={isBulkAccepting ? 'true' : 'false'}
                        >
                          {isBulkAccepting ? 'Accepting…' : 'Accept all pending'}
                        </button>
                      )}
                    </div>
                    {enhanceAllSummaryText && (
                      <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/70 p-4 text-sm text-emerald-900">
                        <p className="text-sm font-semibold text-emerald-700">Enhance All summary</p>
                        <p className="mt-1 leading-relaxed">
                          Combined updates — {enhanceAllSummaryText}
                        </p>
                      </div>
                    )}
                    <div className="space-y-4">
                      {improvementResults.map((item) => (
                        <ImprovementCard
                          key={item.id}
                          suggestion={item}
                          onReject={() => handleRejectImprovement(item.id)}
                          onPreview={() => handlePreviewImprovement(item)}
                        />
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="rounded-2xl border border-dashed border-purple-300 bg-white/70 p-4 text-sm text-purple-700">
                    {improvementsUnlocked
                      ? 'Review the Step 2 ATS dashboard, then choose an improvement above to preview tailored rewrites before you generate downloads.'
                      : 'Complete Step 2 (Score) to populate your ATS dashboard. Once the metrics are ready, you can unlock focused improvement options tailored to the analysis.'}
                  </div>
                )}
              </DashboardStage>
            )}

            {isEnhancementReviewPhase && activeDashboardStage === 'changelog' && (
              <DashboardStage
                stageLabel="Change Log Stage"
                title="Track accepted changes"
                description="Review every applied enhancement and download previous versions when needed."
                accent="slate"
                actions={
                  <span
                    className={`text-xs font-semibold rounded-full border px-3 py-1 ${changeLogCount > 0
                        ? 'border-slate-200 bg-white/70 text-slate-600'
                        : 'border-slate-200 bg-white/50 text-slate-400'
                      }`}
                  >
                    {changeLogCount} update{changeLogCount === 1 ? '' : 's'}
                  </span>
                }
              >
                <div className="space-y-4">
                  {(Array.isArray(changeLogSummaryData?.highlights) && changeLogSummaryData.highlights.length > 0) ||
                    (Array.isArray(changeLogSummaryData?.categories) && changeLogSummaryData.categories.length > 0) ||
                    (changeLogSummaryContext &&
                      Object.values(changeLogSummaryContext).some(
                        (value) => typeof value === 'string' && value.trim()
                      )) ? (
                    <ChangeLogSummaryPanel
                      summary={changeLogSummaryData}
                      context={changeLogSummaryContext}
                    />
                  ) : null}

                  {changeLog.length > 0 ? (
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
                            className="rounded-2xl border border-slate-200/70 bg-white/85 shadow-sm p-4 space-y-2"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="text-base font-semibold text-slate-900">{entry.title}</p>
                                <p className="text-sm text-slate-700/90 leading-relaxed">{entry.detail}</p>
                              </div>
                              <span
                                className={`text-xs font-semibold uppercase tracking-wide px-3 py-1 rounded-full ${changeLabelStyles[entry.label] || changeLabelStyles.fixed
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
                                  className="px-3 py-1.5 rounded-full border border-slate-200 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-900 transition"
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
                                  categoryChangelog={entry.categoryChangelog}
                                />
                              )}
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-4 text-sm text-slate-600">
                      Accept improvements to build your change history and compare every revision.
                    </div>
                  )}
                </div>
              </DashboardStage>
            )}
          </section>
        )}

        {currentPhase === 'score' && selectionInsights && (
          <section className="space-y-4 rounded-3xl bg-white/85 border border-emerald-200/70 shadow-xl p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="caps-label text-xs font-semibold text-emerald-600">
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
                <span className="caps-label-tight self-start rounded-full bg-emerald-100 px-4 py-1 text-xs font-semibold text-emerald-700">
                  {selectionInsights.level} Outlook
                </span>
              )}
            </div>
            <p className="text-sm text-emerald-800/90">
              {selectionInsights.summary ||
                'Your chances of selection have increased. Prepare for the interview and learn these skills!'}
            </p>
            {hasLearningResources && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                <div>
                  <h3 className="text-sm font-semibold text-emerald-800">Learning sprint</h3>
                  <p className="mt-1 text-xs text-emerald-700">
                    Follow these quick resources to close the remaining skill gaps before interviews.
                  </p>
                </div>
                <ul className="mt-3 space-y-3">
                  {learningResources.map((entry) => (
                    <li
                      key={entry.skill}
                      className="rounded-xl border border-emerald-200 bg-white/90 p-3 shadow-sm"
                    >
                      <p className="text-sm font-semibold text-emerald-800">{entry.skill}</p>
                      <ul className="mt-2 space-y-2">
                        {entry.resources.map((resource, index) => (
                          <li key={`${entry.skill}-${index}`} className="text-sm text-emerald-700">
                            <a
                              href={resource.url}
                              target="_blank"
                              rel="noreferrer"
                              className="font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
                            >
                              {resource.title}
                            </a>
                            {resource.description && (
                              <p className="text-xs text-emerald-600">{resource.description}</p>
                            )}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {jobFitScores.length > 0 && (
              <div className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="caps-label text-xs font-semibold text-emerald-600">
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

        {currentPhase === 'score' && analysisHighlights.length > 0 && (
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
                  className={`rounded-2xl border px-4 py-3 shadow-sm ${highlightToneStyles[item.tone] || highlightToneStyles.info
                    }`}
                >
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 text-sm leading-relaxed">{item.message}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {currentPhase === 'score' && match && (
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
                {formatMatchMessage(
                  typeof match.originalScore === 'number' && Number.isFinite(match.originalScore)
                    ? match.originalScore
                    : 0,
                  typeof match.enhancedScore === 'number' && Number.isFinite(match.enhancedScore)
                    ? match.enhancedScore
                    : typeof match.originalScore === 'number' && Number.isFinite(match.originalScore)
                      ? match.originalScore
                      : 0
                )}
              </p>
              <div className="text-sm text-purple-700 space-y-1">
                <p>
                  Added keywords: {match.addedSkills.length > 0 ? match.addedSkills.join(', ') : 'None'}
                </p>
                {match.missingSkills.length > 0 && (
                  <p>Still missing: {match.missingSkills.join(', ')}</p>
                )}
              </div>
              <div className="rounded-2xl border border-dashed border-purple-200/80 bg-white/70 px-4 py-3 text-sm text-purple-700/90">
                <p className="font-semibold text-purple-800">Enhancements unlock in the next step.</p>
                <p className="mt-1">
                  {improveSkillsAction.helper
                    ? improveSkillsAction.helper
                    : 'Move to Enhance to add AI-recommended skills once you finish reviewing these scores.'}
                </p>
                {!improvementsUnlocked && improvementUnlockMessage && (
                  <p className="mt-2 text-xs font-semibold text-purple-600">{improvementUnlockMessage}</p>
                )}
              </div>
            </div>
          </section>
        )}

        {currentPhase === 'enhance' && certificateInsights && (
          <section className="space-y-3 rounded-3xl bg-white/80 border border-blue-200/70 shadow-xl p-6">
            <h2 className="text-xl font-semibold text-blue-900">Certificate Insights</h2>
            <p className="text-sm text-blue-800/90">
              We detected {knownCertificateNames.length} certificates across your resume, LinkedIn, and
              manual inputs.
            </p>
            {knownCertificateNames.length > 0 && (
              <div className="text-sm text-blue-800/90 space-y-1">
                <p className="font-semibold">Currently listed on your resume:</p>
                <ul className="list-disc pl-5 space-y-1">
                  {knownCertificateNames.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {certificateInsights.manualEntryRequired && (
              <p className="text-sm text-rose-600 font-semibold">
                Credly requires authentication. Please paste key certifications manually above so we can
                include them.
              </p>
            )}
            {missingCertificateNames.length > 0 && (
              <div className="text-sm text-amber-800/90 space-y-1">
                <p className="font-semibold">Missing for this JD:</p>
                <ul className="list-disc pl-5 space-y-1">
                  {missingCertificateNames.map((item) => (
                    <li key={`missing-${item}`}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {additionalRecommendedCertificates.length > 0 ? (
              <div className="text-sm text-blue-800/90 space-y-1">
                <p className="font-semibold">Recommended additions to boost this match:</p>
                <ul className="list-disc pl-5 space-y-1">
                  {additionalRecommendedCertificates.map((item) => (
                    <li key={`recommended-${item}`}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : recommendedCertificateNames.length > 0 ? (
              <p className="text-sm text-blue-700/80">
                Recommended additions align with the missing certifications listed above.
              </p>
            ) : (
              <p className="text-sm text-blue-700/80">No additional certifications recommended.</p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
              {improveCertificationsAction.helper && (
                <p className="text-sm text-blue-800/80 flex-1 min-w-[200px]">
                  {improveCertificationsAction.helper}
                </p>
              )}
              <button
                type="button"
                onClick={() => handleImprovementClick('improve-certifications')}
                disabled={improvementButtonsDisabled}
                className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold text-white transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${improvementButtonsDisabled
                    ? 'bg-blue-300 cursor-not-allowed'
                    : 'bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700'
                  }`}
                aria-busy={activeImprovement === 'improve-certifications' ? 'true' : 'false'}
              >
                {activeImprovement === 'improve-certifications'
                  ? 'Improving…'
                  : improveCertificationsAction.label}
              </button>
            </div>
            {!improvementsUnlocked && (
              <p className="text-xs font-semibold text-blue-700">{improvementUnlockMessage}</p>
            )}
          </section>
        )}

        {currentPhase === 'enhance' && improvementActions.length > 0 && (
          <section className="space-y-4 rounded-3xl bg-white/85 border border-purple-200/70 shadow-xl p-6">
            <header className="space-y-2">
              <p className="caps-label text-xs font-semibold text-purple-500">Step 3 · Improve</p>
              <h2 className="text-2xl font-bold text-purple-900">Targeted Improvements</h2>
              <p className="text-sm text-purple-700/80">
                Choose which section to enhance after reviewing your ATS dashboard. Each rewrite keeps your experience truthful while aligning to the JD.
              </p>
            </header>
            {scoreDashboardReady ? (
              <div className="space-y-6">
                {renderTemplateSelection('improvements')}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {improvementActions.map((action) => {
                    const isSelected = selectedImprovementSet.has(action.key)
                    const isActive =
                      activeImprovement === action.key ||
                      (activeImprovement === 'batch' && activeImprovementBatchKeys.includes(action.key))
                    const buttonDisabled = isProcessing || improvementBusy || !improvementsUnlocked
                    return (
                      <button
                        key={action.key}
                        type="button"
                        onClick={() => handleImprovementClick(action.key)}
                        disabled={buttonDisabled}
                        className={`rounded-2xl border border-purple-200 bg-white/80 p-4 text-left shadow-sm hover:shadow-lg transition ${isActive
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
                        <div className="flex items-start gap-4">
                          <div
                            className="pt-1"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              className="h-5 w-5 rounded border-purple-300 text-purple-600 focus:ring-purple-500"
                              checked={isSelected}
                              onChange={() => handleToggleImprovementSelection(action.key)}
                              disabled={buttonDisabled}
                              aria-label={`Select ${action.label}`}
                            />
                          </div>
                          <div className="flex items-center gap-4 flex-1">
                            {action.icon && (
                              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-purple-50/90 p-2 ring-1 ring-purple-100">
                                <img src={action.icon} alt="" className="h-8 w-8" aria-hidden="true" />
                              </span>
                            )}
                            <div className="flex-1">
                              <p className="text-lg font-semibold text-purple-800">{action.label}</p>
                              <p className="text-sm text-purple-600">{action.helper}</p>
                              {isSelected && (
                                <p className="mt-2 inline-flex items-center rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700">
                                  Selected
                                </p>
                              )}
                            </div>
                            {isActive && (
                              <span className="h-6 w-6 shrink-0 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                            )}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <button
                      type="button"
                      onClick={handleSelectAllImprovements}
                      disabled={improvementButtonsDisabled}
                      className="inline-flex items-center rounded-full border border-purple-200 px-4 py-1.5 font-semibold text-purple-700 transition hover:border-purple-300 hover:text-purple-900 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={handleClearImprovementSelection}
                      disabled={!hasSelectedImprovements}
                      className="inline-flex items-center rounded-full border border-purple-200 px-4 py-1.5 font-semibold text-purple-700 transition hover:border-purple-300 hover:text-purple-900 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Clear
                    </button>
                    <span className="text-xs font-semibold text-purple-600">
                      {hasSelectedImprovements
                        ? `${selectedImprovementCount} selected`
                        : 'No improvements selected'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRunSelectedImprovements}
                    disabled={!hasSelectedImprovements || improvementButtonsDisabled}
                    className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-purple-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                    aria-busy={activeImprovement === 'batch' ? 'true' : 'false'}
                  >
                    {improvementBusy && activeImprovement === 'batch'
                      ? 'Generating…'
                      : `Generate selected${hasSelectedImprovements ? ` (${selectedImprovementCount})` : ''
                      }`}
                  </button>
                </div>
                {improvementsUnlocked && improvementResults.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-purple-300 bg-white/70 p-4 text-sm text-purple-700">
                    Review the Step 2 ATS dashboard, then choose an improvement above to preview tailored rewrites before you generate downloads.
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-purple-300 bg-white/70 p-4 text-sm text-purple-700">
                Complete Step 2 (Score) to populate your ATS dashboard. Once the metrics are ready, you can unlock focused improvement options tailored to the analysis.
              </div>
            )}
          </section>
        )}
        {currentPhase === 'enhance' && resumeComparisonData && (
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

        {currentPhase === 'enhance' && resumeText && (
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

        {currentPhase === 'generate' &&
          outputFiles.length === 0 &&
          improvementsUnlocked &&
          improvementsRequireAcceptance &&
          !hasAcceptedImprovement && (
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

        {currentPhase === 'generate' && outputFiles.length === 0 && improvementsUnlocked && canGenerateEnhancedDocs && (
          <section className="space-y-4">
            <header className="space-y-1">
              <p className="caps-label text-xs font-semibold text-purple-500">Step 4 · Generate</p>
              <h2 className="text-2xl font-bold text-purple-900">Generate Enhanced Documents</h2>
              <p className="text-sm text-purple-700/80">
                {improvementsRequireAcceptance
                  ? 'Apply the improvements you like, then create polished CV and cover letter downloads tailored to the JD.'
                  : 'Great news — no manual fixes were required. Generate polished CV and cover letter downloads tailored to the JD.'}
              </p>
            </header>
            <div className="space-y-6">
              {renderTemplateSelection('downloads')}

              {downloadTemplateSummaryMessage && (
                <p className="text-sm font-semibold text-purple-700/90">
                  {downloadTemplateSummaryMessage}
                </p>
              )}

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
            </div>
          </section>
        )}

        {currentPhase === 'download' && downloadsReady && (
          <section className="space-y-5">
            <header className="space-y-1">
              <p className="caps-label text-xs font-semibold text-purple-500">Step 5 · Download</p>
              <h2 className="text-2xl font-bold text-purple-900">Download Enhanced Documents</h2>
              <p className="text-sm text-purple-700/80">
                Download tailored cover letters plus your original and AI-enhanced CVs. Links remain active for 60 minutes.
              </p>
            </header>
            <div className="space-y-6">
              {renderTemplateSelection('downloads')}

              {downloadTemplateSummaryMessage && (
                <p className="text-sm font-semibold text-purple-700/90">
                  {downloadTemplateSummaryMessage}
                </p>
              )}

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

        {previewFile &&
          (() => {
            const previewDownloadStateKey = getDownloadStateKey(previewFile)
            const previewResolvedStateKey =
              previewDownloadStateKey || (typeof previewFile.url === 'string' ? previewFile.url : '')
            const previewDownloadState = previewResolvedStateKey
              ? downloadStates[previewResolvedStateKey]
              : undefined
            const previewIsDownloading = previewDownloadState?.status === 'loading'
            const previewHasError = previewDownloadState?.status === 'error'
            const previewDownloadError = previewDownloadState?.error || ''
            const pendingDownloadKey = pendingDownloadFile
              ? getDownloadStateKey(pendingDownloadFile)
              : ''
            const previewRequiresConfirmation = Boolean(
              pendingDownloadFile &&
              ((pendingDownloadKey && pendingDownloadKey === previewDownloadStateKey) ||
                (pendingDownloadFile.url && pendingDownloadFile.url === previewFile.url))
            )
            const expiryDate = previewFile.expiresAt ? new Date(previewFile.expiresAt) : null
            const expiryValid = expiryDate && !Number.isNaN(expiryDate.getTime())
            const previewExpired = Boolean(expiryValid && expiryDate.getTime() <= Date.now())
            const previewHasUrl = typeof previewFile.url === 'string' && previewFile.url
            const previewStorageKey =
              typeof previewFile.storageKey === 'string'
                ? previewFile.storageKey.trim()
                : ''
            const previewCanRefresh = Boolean(previewStorageKey)
            const previewPresentation =
              previewFile.presentation || getDownloadPresentation(previewFile)
            const previewButtonDisabled =
              previewIsDownloading || previewHasError || (!previewHasUrl && !previewCanRefresh)
            const previewLinkDisabled = previewExpired || !previewHasUrl || previewHasError
            const previewTemplateMeta = previewFile.templateMeta || {}
            const previewTemplateName =
              (typeof previewTemplateMeta.name === 'string' && previewTemplateMeta.name.trim()) ||
              (typeof previewFile.templateName === 'string' && previewFile.templateName.trim()) ||
              (typeof previewFile.coverTemplateName === 'string' && previewFile.coverTemplateName.trim()) ||
              ''
            const previewTemplateId =
              (typeof previewTemplateMeta.id === 'string' && previewTemplateMeta.id.trim()) ||
              (typeof previewFile.templateId === 'string' && previewFile.templateId.trim()) ||
              (typeof previewFile.coverTemplateId === 'string' &&
                previewFile.coverTemplateId.trim()) ||
              (typeof previewFile.template === 'string' && previewFile.template.trim()) ||
              ''
            const previewDownloadFileName = previewHasUrl
              ? deriveDownloadFileName(previewFile, previewPresentation, null, {
                templateName: previewTemplateName,
                templateId: previewTemplateId,
                generatedAt: previewFile.generatedAt,
                contentTypeOverride: 'application/pdf',
                forcePdfExtension: true,
                versionId: previewFile.versionId,
                versionHash: previewFile.versionHash,
              })
              : ''
            const previewDownloadLinkLabel = previewPresentation.linkLabel || 'Download File'
            const previewDownloadLinkClass = `text-sm font-semibold transition ${previewLinkDisabled
                ? 'text-rose-500 cursor-not-allowed'
                : 'text-purple-700 hover:text-purple-900 underline decoration-purple-300 decoration-2 underline-offset-4'
              }`

            const downloadButtonLabel = (() => {
              if (previewHasError) return 'Link unavailable'
              if (previewIsDownloading) return 'Downloading…'
              if (previewExpired) return previewCanRefresh ? 'Refresh link' : 'Link expired'
              if (!previewHasUrl) return previewCanRefresh ? 'Refresh link' : 'Link unavailable'
              return 'Download PDF'
            })()

            return (
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
                        src={previewHasUrl ? `${previewFile.url}#toolbar=0&navpanes=0` : undefined}
                        title={previewFile.presentation?.label || 'Document preview'}
                        className="h-full w-full"
                      />
                    </div>
                    <p className="mt-3 text-xs text-purple-600">
                      Trouble viewing? Download the PDF instead to open it in your preferred reader.
                    </p>
                  </div>
                  <div className="border-t border-purple-100 bg-white/80 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs text-purple-600 space-y-1">
                      <p>
                        {previewRequiresConfirmation
                          ? 'Looks good? Confirm this preview before downloading your PDF.'
                          : 'Happy with the updates? Download the PDF once you have reviewed it.'}
                      </p>
                      {previewDownloadError && (
                        <span className="block font-semibold text-rose-600">
                          {previewDownloadError}
                        </span>
                      )}
                      {!previewHasUrl && (
                        <span className="block font-semibold text-rose-600">
                          {previewCanRefresh
                            ? 'Download link unavailable. Select Download to refresh it automatically.'
                            : 'Download link unavailable. Please regenerate the document.'}
                        </span>
                      )}
                      {previewExpired && (
                        <span className="block font-semibold text-rose-600">
                          {previewCanRefresh
                            ? 'This link expired. Select Download to refresh it automatically.'
                            : 'This link has expired. Regenerate the documents to refresh the download.'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {previewHasUrl && (
                        <a
                          href={previewLinkDisabled ? undefined : previewFile.url}
                          onClick={async (event) => {
                            if (previewLinkDisabled) {
                              event.preventDefault()
                              event.stopPropagation()
                              if (previewHasError) {
                                return
                              }
                              if (previewCanRefresh) {
                                try {
                                  await refreshDownloadLink(previewFile)
                                } catch (refreshErr) {
                                  console.warn('Preview download refresh failed', refreshErr)
                                }
                              }
                              return
                            }

                            setTimeout(() => {
                              resetUiAfterDownload()
                            }, 0)
                          }}
                          className={previewDownloadLinkClass}
                          aria-disabled={previewLinkDisabled ? 'true' : undefined}
                          target={previewLinkDisabled ? undefined : '_blank'}
                          rel={previewLinkDisabled ? undefined : 'noopener noreferrer'}
                          download={previewLinkDisabled ? undefined : previewDownloadFileName || undefined}
                        >
                          {previewDownloadLinkLabel}
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          await handleDownloadFile(previewFile)
                        }}
                        disabled={previewButtonDisabled}
                        className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold text-white shadow focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${previewButtonDisabled
                            ? 'bg-purple-300 cursor-not-allowed'
                            : 'bg-purple-600 hover:bg-purple-700'
                          }`}
                      >
                        {downloadButtonLabel}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}

        <CoverLetterEditorModal
          isOpen={Boolean(coverLetterEditor)}
          label={coverLetterEditor?.label}
          draftText={coverLetterEditorDraftText}
          originalText={coverLetterEditorOriginalText}
          hasChanges={coverLetterEditorHasChanges}
          wordCount={coverLetterEditorWordCount}
          onClose={closeCoverLetterEditor}
          onChange={handleCoverEditorChange}
          onReset={handleCoverEditorReset}
          onCopy={handleCoverEditorCopy}
          onDownload={handleDownloadEditedCoverLetter}
          isDownloading={isCoverLetterDownloading}
          downloadError={coverLetterDownloadError}
          clipboardStatus={coverLetterClipboardStatus}
          coverTemplateId={coverLetterEditorTemplate?.templateId}
          coverTemplateName={coverLetterEditorTemplate?.templateName}
        />

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
              <div className="border-t border-purple-100 bg-white/80 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-purple-600">
                  Decide whether to apply this rewrite or keep your original wording.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handlePreviewReject}
                    disabled={previewRejectDisabled}
                    className="px-4 py-2 rounded-full text-sm font-medium border border-rose-300 text-rose-600 hover:bg-rose-50 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {previewRejectLabel}
                  </button>
                  <button
                    type="button"
                    onClick={handlePreviewAccept}
                    disabled={previewAcceptDisabled}
                    className="px-4 py-2 rounded-full text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {previewAcceptLabel}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        <footer className="text-center text-[0.65rem] uppercase tracking-[0.2em] text-purple-800/60">
          Build {BUILD_VERSION}
        </footer>
      </div>
    </div>
  )
}

export default App
