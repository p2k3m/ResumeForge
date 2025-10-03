const SECTION_KEYWORDS = [
  {
    label: 'Overview',
    patterns: [
      /^overview$/i,
      /^about (the )?role/i,
      /^role overview/i,
      /^about us/i,
      /^mission$/i,
    ],
  },
  {
    label: 'Responsibilities',
    patterns: [
      /responsibil/i,
      /what (you('ll| will) do|we expect)/i,
      /day[-\s]*to[-\s]*day/i,
      /duties/i,
      /in this role/i,
    ],
  },
  {
    label: 'Requirements',
    patterns: [
      /requirement/i,
      /qualification/i,
      /what you bring/i,
      /skills you/i,
      /you(('|\s)ll) need/i,
      /experience/i,
    ],
  },
  {
    label: 'Preferred Qualifications',
    patterns: [
      /preferred/i,
      /nice to have/i,
      /bonus/i,
      /plus$/i,
    ],
  },
  {
    label: 'Benefits',
    patterns: [
      /benefit/i,
      /perks/i,
      /what we offer/i,
      /compensation/i,
      /why you'll love/i,
    ],
  },
  {
    label: 'Company',
    patterns: [
      /about (the )?company/i,
      /who we are/i,
      /our team/i,
      /culture/i,
    ],
  },
]

const STOP_WORDS = new Set([
  'about',
  'above',
  'after',
  'also',
  'an',
  'and',
  'any',
  'are',
  'as',
  'at',
  'be',
  'being',
  'both',
  'but',
  'by',
  'can',
  'company',
  'candidate',
  'day',
  'do',
  'each',
  'ensure',
  'every',
  'for',
  'from',
  'have',
  'help',
  'including',
  'into',
  'is',
  'it',
  'its',
  'join',
  'make',
  'may',
  'more',
  'must',
  'new',
  'of',
  'on',
  'our',
  'role',
  'skills',
  'such',
  'team',
  'the',
  'their',
  'this',
  'to',
  'we',
  'what',
  'will',
  'with',
  'work',
  'you',
  'your',
])

const META_PATTERNS = [
  { label: 'Company', regex: /^company\s*[:\-]\s*(.+)$/i },
  { label: 'Location', regex: /^location\s*[:\-]\s*(.+)$/i },
  { label: 'Employment Type', regex: /^(employment|contract)\s*type\s*[:\-]\s*(.+)$/i },
  { label: 'Salary', regex: /^(salary|compensation|pay range)\s*[:\-]\s*(.+)$/i },
  { label: 'Experience', regex: /^(experience|years of experience)\s*[:\-]\s*(.+)$/i },
]

function normalizeLine(line = '') {
  return line.replace(/\s+/g, ' ').trim()
}

function isBulletLine(line = '') {
  return /^(?:[\u2022\u2023\u25CF\u25CB\u25A0\u25AA\-\*\+\•\▪\◦\‣]\s+|\d+\.\s+)/.test(line)
}

function detectSectionHeading(line = '') {
  if (!line) return null
  const trimmed = line.replace(/[\s:;\-–—]+$/g, '').trim()
  if (!trimmed) return null

  const lower = trimmed.toLowerCase()
  const keywordMatch = SECTION_KEYWORDS.find((entry) =>
    entry.patterns.some((pattern) => pattern.test(lower))
  )
  if (keywordMatch) {
    return keywordMatch.label
  }

  const wordCount = trimmed.split(/\s+/).length
  const looksLikeHeading =
    (trimmed === trimmed.toUpperCase() && wordCount <= 10) ||
    (line.endsWith(':') && wordCount <= 12)

  if (looksLikeHeading) {
    return toTitleCase(trimmed)
  }

  return null
}

function toTitleCase(value = '') {
  if (!value) return ''
  const lower = value.toLowerCase()
  return lower.replace(/(^|[\s-/])([a-z])/g, (match, separator, char) =>
    `${separator}${char.toUpperCase()}`
  )
}

function extractKeywords(text = '') {
  const tokens = text
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9+#\.\-/]{1,}/g)
  if (!tokens) return []

  const counts = new Map()
  for (const token of tokens) {
    if (token.length < 4) continue
    if (STOP_WORDS.has(token)) continue
    const cleaned = token.replace(/^(?:and|the)\-/, '')
    const current = counts.get(cleaned) || 0
    counts.set(cleaned, current + 1)
  }

  return Array.from(counts.entries())
    .sort((a, b) => {
      if (b[1] === a[1]) {
        return a[0].localeCompare(b[0])
      }
      return b[1] - a[1]
    })
    .slice(0, 12)
    .map(([token]) => token.replace(/\+\+/g, '++'))
}

function isLikelyTitle(line = '') {
  if (!line) return false
  if (isBulletLine(line)) return false
  if (/^(company|location|employment type|job description|about|overview|responsibil)/i.test(line)) {
    return false
  }
  const wordCount = line.split(/\s+/).length
  return wordCount > 0 && wordCount <= 16
}

function extractMeta(lines = []) {
  const meta = []
  for (const line of lines) {
    for (const pattern of META_PATTERNS) {
      const match = line.match(pattern.regex)
      if (match) {
        const value = normalizeLine(match[1] || match[2] || '')
        if (value && value.length <= 120 && !meta.some((item) => item.label === pattern.label)) {
          meta.push({ label: pattern.label, value })
        }
      }
    }
  }
  return meta
}

export function parseJobDescriptionText(rawText = '') {
  if (typeof rawText !== 'string') return null
  const text = rawText.replace(/\r\n?/g, '\n')
  const lines = text.split('\n').map(normalizeLine)
  const nonEmpty = lines.filter(Boolean)
  if (!nonEmpty.length) return null

  let title = ''
  const contentLines = []
  for (const line of nonEmpty) {
    if (!title && isLikelyTitle(line)) {
      title = toTitleCase(line)
      continue
    }
    contentLines.push(line)
  }

  if (!title && contentLines.length) {
    title = toTitleCase(contentLines.shift())
  }
  if (!title) {
    title = 'Job Description'
  }

  const meta = extractMeta(contentLines.slice(0, 12))

  const sections = []
  let currentSection = {
    heading: 'Overview',
    bullets: [],
    paragraphs: [],
  }

  const pushSection = () => {
    if (currentSection.bullets.length || currentSection.paragraphs.length) {
      sections.push(currentSection)
    }
  }

  for (const line of contentLines) {
    const heading = detectSectionHeading(line)
    if (heading) {
      if (
        currentSection.heading !== heading &&
        (currentSection.bullets.length || currentSection.paragraphs.length)
      ) {
        pushSection()
        currentSection = {
          heading,
          bullets: [],
          paragraphs: [],
        }
      } else {
        currentSection = {
          heading,
          bullets: [],
          paragraphs: [],
        }
      }
      continue
    }

    const bulletMatch = line.match(/^(?:[\u2022\u2023\u25CF\u25CB\u25A0\u25AA\-\*\+\•\▪\◦\‣]\s+|\d+\.\s+)(.+)$/)
    if (bulletMatch) {
      const bulletText = normalizeLine(bulletMatch[1])
      if (bulletText) currentSection.bullets.push(bulletText)
      continue
    }

    if (line) {
      currentSection.paragraphs.push(line)
    }
  }

  pushSection()

  if (!sections.length && (currentSection.bullets.length || currentSection.paragraphs.length)) {
    sections.push(currentSection)
  }

  const combinedText = [title, ...contentLines].join(' ')
  const keywords = extractKeywords(combinedText)
  const wordCount = combinedText.split(/\s+/).filter(Boolean).length

  return {
    title,
    sections,
    keywords,
    wordCount,
    meta,
  }
}

export default parseJobDescriptionText
