const CATEGORY_METADATA = {
  ats: {
    key: 'ats',
    label: 'ATS',
    description: 'Score movement and JD alignment rationale.'
  },
  skills: {
    key: 'skills',
    label: 'Skills',
    description: 'Keyword coverage surfaced across the resume.'
  },
  designation: {
    key: 'designation',
    label: 'Designation',
    description: 'Visible job titles aligned to the target role.'
  },
  tasks: {
    key: 'tasks',
    label: 'Tasks',
    description: 'Experience bullets, responsibilities, and project highlights.'
  },
  highlights: {
    key: 'highlights',
    label: 'Highlights',
    description: 'Headline wins and summary messaging that were refreshed.'
  },
  certs: {
    key: 'certs',
    label: 'Certifications',
    description: 'Credentials emphasised for the JD.'
  }
}

const CATEGORY_ORDER = ['ats', 'skills', 'designation', 'tasks', 'highlights', 'certs']

const SECTION_CATEGORY_MATCHERS = [
  { keys: ['skills'], pattern: /skill|keyword/i },
  { keys: ['designation'], pattern: /designation|title|headline|position/i },
  { keys: ['tasks'], pattern: /experience|project|responsibilit|task|achievement|impact/i },
  { keys: ['highlights'], pattern: /highlight|summary|profile|overview/i },
  { keys: ['certs'], pattern: /cert|badge|accredit/i },
  {
    keys: ['ats'],
    pattern: /ats|layout|readability|candidatescore|impact metric|probability|quality/i
  }
]

const PRIMARY_CATEGORY_BY_SUGGESTION = {
  'improve-summary': 'highlights',
  'add-missing-skills': 'skills',
  'align-experience': 'tasks',
  'change-designation': 'designation',
  'improve-certifications': 'certs',
  'improve-projects': 'tasks',
  'improve-highlights': 'highlights'
}

const RELATED_CATEGORIES_BY_SUGGESTION = {
  'improve-summary': ['ats', 'highlights'],
  'add-missing-skills': ['ats', 'skills'],
  'align-experience': ['ats', 'tasks', 'highlights'],
  'change-designation': ['ats', 'designation'],
  'improve-certifications': ['ats', 'certs', 'skills'],
  'improve-projects': ['ats', 'tasks', 'highlights'],
  'improve-highlights': ['ats', 'highlights'],
  'enhance-all': ['ats', 'skills', 'designation', 'tasks', 'highlights', 'certs']
}

function normaliseList(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') {
          return item.trim()
        }
        if (item === null || item === undefined) {
          return ''
        }
        return String(item || '').trim()
      })
      .filter(Boolean)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? [trimmed] : []
  }
  if (value === null || value === undefined) {
    return []
  }
  return [String(value || '').trim()].filter(Boolean)
}

function resolveSectionCategories(sectionLabel) {
  if (!sectionLabel) {
    return []
  }
  const lower = sectionLabel.toLowerCase()
  const matched = new Set()
  SECTION_CATEGORY_MATCHERS.forEach((matcher) => {
    if (matcher.pattern.test(lower)) {
      matcher.keys.forEach((key) => matched.add(key))
    }
  })
  return Array.from(matched)
}

function ensureCategoryEntry(map, key) {
  if (!CATEGORY_METADATA[key]) {
    return null
  }
  if (!map.has(key)) {
    map.set(key, {
      key,
      label: CATEGORY_METADATA[key].label,
      description: CATEGORY_METADATA[key].description,
      added: new Set(),
      removed: new Set(),
      reasons: new Set()
    })
  }
  return map.get(key)
}

function pushItems(targetSet, items) {
  normaliseList(items).forEach((item) => {
    if (!item) return
    targetSet.add(item)
  })
}

function pushReasons(targetSet, reasons) {
  normaliseList(reasons).forEach((reason) => {
    if (!reason) return
    const lower = reason.toLowerCase()
    // Prevent near-duplicate rationale lines.
    if (!Array.from(targetSet).some((existing) => existing.toLowerCase() === lower)) {
      targetSet.add(reason)
    }
  })
}

function addScoreDeltaReason(categoryEntry, scoreDelta) {
  if (!categoryEntry) return
  if (typeof scoreDelta !== 'number' || Number.isNaN(scoreDelta) || !Number.isFinite(scoreDelta)) {
    return
  }
  if (scoreDelta === 0) {
    categoryEntry.reasons.add('Confirmed the ATS score stayed stable after the change.')
    return
  }
  const rounded = Math.round(scoreDelta)
  const prefix = rounded > 0 ? '+' : ''
  categoryEntry.reasons.add(`Score impact: ${prefix}${rounded} pts versus the baseline upload.`)
}

export function buildCategoryChangeLog({
  summarySegments = [],
  detail,
  addedItems = [],
  removedItems = [],
  itemizedChanges = [],
  before,
  after,
  scoreDelta = null,
  suggestionType
} = {}) {
  const detailText = typeof detail === 'string' ? detail.trim() : ''
  const categoryMap = new Map()

  const segments = Array.isArray(summarySegments) ? summarySegments : []

  segments.forEach((rawSegment) => {
    if (!rawSegment || typeof rawSegment !== 'object') {
      return
    }
    const sectionLabel =
      typeof rawSegment.section === 'string'
        ? rawSegment.section
        : typeof rawSegment.label === 'string'
          ? rawSegment.label
          : typeof rawSegment.key === 'string'
            ? rawSegment.key
            : ''
    const sectionCategories = resolveSectionCategories(sectionLabel)
    if (sectionCategories.length === 0) {
      return
    }
    const segmentAdded = normaliseList(rawSegment.added)
    const segmentRemoved = normaliseList(rawSegment.removed)
    const segmentReason = normaliseList(rawSegment.reason)
    const reasonsToUse = segmentReason.length > 0 ? segmentReason : detailText ? [detailText] : []

    sectionCategories.forEach((categoryKey) => {
      const entry = ensureCategoryEntry(categoryMap, categoryKey)
      if (!entry) return
      pushItems(entry.added, segmentAdded)
      pushItems(entry.removed, segmentRemoved)
      pushReasons(entry.reasons, reasonsToUse)
    })
  })

  const suggestionKey = typeof suggestionType === 'string' ? suggestionType.trim() : ''
  const primaryCategory = PRIMARY_CATEGORY_BY_SUGGESTION[suggestionKey] || null

  if (primaryCategory) {
    const entry = ensureCategoryEntry(categoryMap, primaryCategory)
    if (entry) {
      pushItems(entry.added, addedItems)
      pushItems(entry.removed, removedItems)
      if (entry.reasons.size === 0 && detailText) {
        entry.reasons.add(detailText)
      }
    }
  }

  if (Array.isArray(itemizedChanges) && itemizedChanges.length > 0) {
    const fallbackCategory = primaryCategory || (RELATED_CATEGORIES_BY_SUGGESTION[suggestionKey] || [])[0]
    if (fallbackCategory) {
      const entry = ensureCategoryEntry(categoryMap, fallbackCategory)
      if (entry) {
        itemizedChanges.forEach((change) => {
          if (!change || typeof change !== 'object') return
          const reasons = normaliseList(change.reasons)
          pushReasons(entry.reasons, reasons)
        })
      }
    }
  }

  if (suggestionKey === 'change-designation' && before && after && before !== after) {
    const entry = ensureCategoryEntry(categoryMap, 'designation')
    if (entry) {
      entry.reasons.add('Updated your visible title to align with the JD role name.')
      pushItems(entry.added, after)
      pushItems(entry.removed, before)
    }
  }

  if (suggestionKey === 'enhance-all') {
    // Ensure all related categories inherit the overarching rationale.
    const related = RELATED_CATEGORIES_BY_SUGGESTION[suggestionKey] || []
    related.forEach((key) => {
      const entry = ensureCategoryEntry(categoryMap, key)
      if (entry && detailText) {
        entry.reasons.add(detailText)
      }
    })
  }

  const relatedCategories = RELATED_CATEGORIES_BY_SUGGESTION[suggestionKey] || []
  relatedCategories.forEach((key) => {
    const entry = ensureCategoryEntry(categoryMap, key)
    if (!entry) return
    if (entry.reasons.size === 0 && detailText) {
      entry.reasons.add(detailText)
    }
  })

  if (detailText) {
    const atsEntry = ensureCategoryEntry(categoryMap, 'ats')
    if (atsEntry && atsEntry.reasons.size === 0) {
      atsEntry.reasons.add(detailText)
    }
  }

  addScoreDeltaReason(categoryMap.get('ats'), scoreDelta)

  const result = CATEGORY_ORDER.map((key) => {
    const entry = categoryMap.get(key)
    if (!entry) {
      return null
    }
    const added = Array.from(entry.added)
    const removed = Array.from(entry.removed)
    const reasons = Array.from(entry.reasons)
    if (added.length === 0 && removed.length === 0 && reasons.length === 0) {
      return null
    }
    return {
      key,
      label: entry.label,
      description: entry.description,
      added,
      removed,
      reasons
    }
  }).filter(Boolean)

  return result
}

export default buildCategoryChangeLog
