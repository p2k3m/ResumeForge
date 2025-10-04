const ACTION_TYPE_PATTERNS = [
  { type: 'skills', regex: /skill|keyword|competenc/i },
  { type: 'designation', regex: /designation|title|headline|role/i },
  { type: 'experience', regex: /experience|impact|achievement|project|highlight|story/i },
  { type: 'summary', regex: /summary|profile|overview/i },
  { type: 'certificates', regex: /cert|badge|credential/i },
  { type: 'format', regex: /format|layout|structure|readability|crisp/i }
]

function normaliseString(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed : ''
  }
  if (value === null || value === undefined) {
    return ''
  }
  return String(value || '').trim()
}

function normaliseActionList(items) {
  if (!Array.isArray(items)) return []
  const seen = new Set()
  const output = []
  items.forEach((item) => {
    const text = normaliseString(item)
    if (!text) return
    const key = text.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    output.push(text)
  })
  return output
}

function formatActionList(items) {
  const list = normaliseActionList(items)
  if (list.length === 0) return ''
  if (list.length === 1) return list[0]
  if (list.length === 2) return `${list[0]} and ${list[1]}`
  return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`
}

function inferActionType(source, fallback = 'general') {
  const text = normaliseString(source)
  if (!text) return fallback
  const lower = text.toLowerCase()
  const directMap = {
    skills: 'skills',
    keywords: 'skills',
    designation: 'designation',
    certificates: 'certificates',
    experience: 'experience'
  }
  if (directMap[lower]) {
    return directMap[lower]
  }
  const match = ACTION_TYPE_PATTERNS.find((pattern) => pattern.regex.test(lower))
  return match ? match.type : fallback
}

function buildSkillsAdvice({ added = [], missing = [], removed = [] }) {
  const addedText = formatActionList(added)
  const missingText = formatActionList(missing.length ? missing : removed)
  if (missingText && addedText) {
    return `Add these skills next: ${missingText}. Keep spotlighting ${addedText}.`
  }
  if (missingText) {
    return `Add these skills next: ${missingText}.`
  }
  if (addedText) {
    return `Keep spotlighting these skills: ${addedText}.`
  }
  return 'Keep mirroring the JD skill keywords in upcoming drafts.'
}

function buildExperienceAdvice({ added = [], missing = [], removed = [] }) {
  const addedText = formatActionList(added)
  const missingText = formatActionList(missing.length ? missing : removed)
  if (addedText && missingText) {
    return `Expand these highlights: ${addedText}. Refresh the stories covering ${missingText}.`
  }
  if (addedText) {
    return `Expand these highlights: ${addedText}.`
  }
  if (missingText) {
    return `Refresh the stories covering ${missingText}.`
  }
  return 'Continue backing experience bullets with quantified impact.'
}

function buildDesignationAdvice({ added = [], missing = [], removed = [] }) {
  const addedText = formatActionList(added)
  const missingText = formatActionList(missing.length ? missing : removed)
  if (addedText && missingText) {
    return `Change your last designation from ${missingText} to ${addedText} so the ATS reads the target title.`
  }
  if (addedText) {
    return `Change your last designation to ${addedText} to mirror the job post.`
  }
  if (missingText) {
    return `Retire the ${missingText} title so your headline matches the role.`
  }
  return 'Keep the job title aligned with the role you are pursuing.'
}

function buildSummaryAdvice({ added = [], missing = [], removed = [] }) {
  const addedText = formatActionList(added)
  const missingText = formatActionList(missing.length ? missing : removed)
  if (addedText && missingText) {
    return `Surface these summary hooks: ${addedText}. Phase out ${missingText} for clarity.`
  }
  if (addedText) {
    return `Surface these summary hooks: ${addedText}.`
  }
  if (missingText) {
    return `Trim ${missingText} from the summary to stay concise.`
  }
  return 'Lead with a sharp summary that mirrors the role’s priorities.'
}

function buildCertificateAdvice({ added = [], missing = [], removed = [] }) {
  const addedText = formatActionList(added)
  const missingText = formatActionList(missing.length ? missing : removed)
  if (missingText && addedText) {
    return `Log these certificates next: ${missingText}. Highlight ${addedText} near your summary.`
  }
  if (missingText) {
    return `Log these certificates next: ${missingText}.`
  }
  if (addedText) {
    return `Highlight these certificates near your summary: ${addedText}.`
  }
  return 'Keep credentials up to date across LinkedIn and your resume.'
}

function buildFormatAdvice() {
  return 'Tighten formatting, headings, and spacing so ATS parsers never stumble.'
}

function buildActionableMessage(type, payload = {}) {
  switch (type) {
    case 'skills':
      return buildSkillsAdvice(payload)
    case 'experience':
      return buildExperienceAdvice(payload)
    case 'designation':
      return buildDesignationAdvice(payload)
    case 'summary':
      return buildSummaryAdvice(payload)
    case 'certificates':
      return buildCertificateAdvice(payload)
    case 'format':
      return buildFormatAdvice()
    default:
      return 'Keep iterating here so hiring managers immediately spot your fit.'
  }
}

function buildCategoryAdvice(categoryKey, bucket = {}) {
  const type = inferActionType(categoryKey)
  const added = normaliseActionList(bucket.added || [])
  const missing = normaliseActionList(bucket.missing || [])
  const advice = buildActionableMessage(type, { added, missing })
  return advice
}

function buildSegmentAdvice(label, segment = {}) {
  const type = inferActionType(label)
  const added = normaliseActionList(segment.added || [])
  const removed = normaliseActionList(segment.removed || segment.missing || [])
  const advice = buildActionableMessage(type, { added, missing: [], removed })
  return advice
}

function collectSegmentsByType(segments, targetType) {
  if (!Array.isArray(segments) || !segments.length) {
    return { added: [], removed: [] }
  }
  return segments.reduce(
    (acc, segment) => {
      if (!segment || typeof segment !== 'object') return acc
      const label = [segment.section, segment.label, segment.key]
        .map((value) => normaliseString(value))
        .find(Boolean)
      const type = inferActionType(label)
      if (type !== targetType) return acc
      acc.added.push(...normaliseActionList(segment.added || []))
      const removed = normaliseActionList(segment.removed || segment.missing || [])
      acc.removed.push(...removed)
      return acc
    },
    { added: [], removed: [] }
  )
}

function buildImprovementHintFromSegment(segment) {
  if (!segment || typeof segment !== 'object') return null
  const label = [segment.section, segment.label, segment.key]
    .map((value) => normaliseString(value))
    .find(Boolean)
  const advice = buildSegmentAdvice(label, segment)
  if (advice) {
    return label ? `${label}: ${advice}` : advice
  }
  const reasons = normaliseActionList(segment.reason || segment.reasons || [])
  if (reasons.length) {
    return label ? `${label}: ${reasons[0]}` : reasons[0]
  }
  return null
}

function buildMetricTip(metric = {}, context = {}) {
  const explicit = normaliseString(metric.tip)
  if (explicit) return explicit
  if (Array.isArray(metric.tips)) {
    const firstTip = metric.tips.map(normaliseString).find(Boolean)
    if (firstTip) {
      return firstTip
    }
  }

  const category = normaliseString(metric.category)
  const type = inferActionType(category)
  const match = context.match || {}
  const segments = Array.isArray(match.improvementSummary) ? match.improvementSummary : []

  switch (type) {
    case 'skills': {
      const added = normaliseActionList(match.addedSkills || [])
      const missing = normaliseActionList(match.missingSkills || [])
      return buildActionableMessage('skills', { added, missing })
    }
    case 'designation': {
      const added = normaliseActionList([match.modifiedTitle])
      const missing = normaliseActionList([match.originalTitle])
      return buildActionableMessage('designation', { added, missing })
    }
    case 'experience': {
      const payload = collectSegmentsByType(segments, 'experience')
      return buildActionableMessage('experience', payload)
    }
    case 'summary': {
      const payload = collectSegmentsByType(segments, 'summary')
      return buildActionableMessage('summary', payload)
    }
    case 'certificates': {
      const payload = collectSegmentsByType(segments, 'certificates')
      if (payload.added.length || payload.removed.length) {
        return buildActionableMessage('certificates', payload)
      }
      return buildActionableMessage('certificates', {})
    }
    case 'format':
      return buildActionableMessage('format')
    default:
      return buildActionableMessage('general')
  }
}

module.exports = {
  normaliseActionList,
  formatActionList,
  inferActionType,
  buildActionableMessage,
  buildCategoryAdvice,
  buildSegmentAdvice,
  buildImprovementHintFromSegment,
  buildMetricTip
}
