const CATEGORY_KEYS = [
  'skills',
  'experience',
  'tasks',
  'designation',
  'highlights',
  'keywords',
  'certificates'
]

function createAccumulator() {
  return CATEGORY_KEYS.reduce((acc, key) => {
    acc[key] = { added: new Set(), missing: new Set() }
    return acc
  }, {})
}

function normalizeText(value) {
  if (typeof value === 'string') {
    return value.trim()
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  return ''
}

function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return value
      .map(normalizeText)
      .filter(Boolean)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? [trimmed] : []
  }
  return []
}

function normalizeCertificateList(value) {
  if (!value) return []
  const list = Array.isArray(value) ? value : [value]
  return list
    .map((item) => {
      if (!item) return ''
      if (typeof item === 'string') {
        return item.trim()
      }
      if (typeof item === 'object') {
        const name = normalizeText(item.name || item.title)
        const provider = normalizeText(item.provider || item.issuer || item.organization)
        const combined = [name, provider].filter(Boolean).join(' — ')
        return combined || name || provider
      }
      return ''
    })
    .filter(Boolean)
}

function finalise(accumulator) {
  return CATEGORY_KEYS.reduce((result, key) => {
    const added = Array.from(accumulator[key].added).filter(Boolean)
    const missing = Array.from(accumulator[key].missing).filter(Boolean)
    result[key] = { added, missing }
    return result
  }, {})
}

function pushItems(targetSet, items) {
  items.forEach((item) => {
    const text = normalizeText(item)
    if (text) {
      targetSet.add(text)
    }
  })
}

export function deriveDeltaSummary({
  match,
  changeLog,
  certificateInsights,
  manualCertificates,
  jobSkills,
  resumeSkills
}) {
  const accumulator = createAccumulator()
  const addToCategory = (key, items) => {
    if (!CATEGORY_KEYS.includes(key)) return
    pushItems(accumulator[key].added, normalizeStringList(items))
  }
  const markMissingInCategory = (key, items) => {
    if (!CATEGORY_KEYS.includes(key)) return
    pushItems(accumulator[key].missing, normalizeStringList(items))
  }

  const addCertificates = (items) => {
    normalizeCertificateList(items).forEach((item) => {
      const text = normalizeText(item)
      if (text) {
        accumulator.certificates.added.add(text)
      }
    })
  }
  const markCertificatesMissing = (items) => {
    normalizeCertificateList(items).forEach((item) => {
      const text = normalizeText(item)
      if (text) {
        accumulator.certificates.missing.add(text)
      }
    })
  }

  const addedSkills = normalizeStringList(match?.addedSkills)
  const missingSkills = normalizeStringList(match?.missingSkills)
  addToCategory('skills', addedSkills)
  addToCategory('keywords', addedSkills)
  markMissingInCategory('skills', missingSkills)
  markMissingInCategory('keywords', missingSkills)

  const originalTitle = normalizeText(match?.originalTitle)
  const modifiedTitle = normalizeText(match?.modifiedTitle)
  if (modifiedTitle) {
    accumulator.designation.added.add(modifiedTitle)
  }
  if (originalTitle && modifiedTitle && originalTitle.toLowerCase() !== modifiedTitle.toLowerCase()) {
    accumulator.designation.missing.add(originalTitle)
  }

  const normalisedJobSkills = normalizeStringList(jobSkills)
  const normalisedResumeSkills = normalizeStringList(resumeSkills)
  const resumeSkillSet = new Set(normalisedResumeSkills.map((skill) => skill.toLowerCase()))
  const jobSkillSet = new Set(normalisedJobSkills.map((skill) => skill.toLowerCase()))

  const jobOnlySkills = normalisedJobSkills.filter((skill) => !resumeSkillSet.has(skill.toLowerCase()))
  markMissingInCategory('skills', jobOnlySkills)
  markMissingInCategory('keywords', jobOnlySkills)

  const resumeOnlySkills = normalisedResumeSkills.filter((skill) => !jobSkillSet.has(skill.toLowerCase()))
  addToCategory('skills', resumeOnlySkills)

  addCertificates(certificateInsights?.known)
  addCertificates(manualCertificates)
  markCertificatesMissing(certificateInsights?.suggestions)
  if (certificateInsights?.manualEntryRequired) {
    accumulator.certificates.missing.add('Manual entry required')
  }

  const changeLogEntries = Array.isArray(changeLog) ? changeLog : []
  changeLogEntries.forEach((entry) => {
    if (entry?.reverted) {
      return
    }
    const entryType = normalizeText(entry?.type)
    const entryAdded = normalizeStringList(entry?.addedItems)
    const entryRemoved = normalizeStringList(entry?.removedItems)
    if (entryType === 'add-missing-skills') {
      addToCategory('skills', entryAdded)
      addToCategory('keywords', entryAdded)
      markMissingInCategory('skills', entryRemoved)
      markMissingInCategory('keywords', entryRemoved)
    }
    if (entryType === 'align-experience' || entryType === 'improve-projects') {
      addToCategory('experience', entryAdded)
      markMissingInCategory('experience', entryRemoved)
      addToCategory('tasks', entryAdded)
      markMissingInCategory('tasks', entryRemoved)
    }
    if (entryType === 'improve-summary' || entryType === 'improve-highlights') {
      addToCategory('highlights', entryAdded)
      markMissingInCategory('highlights', entryRemoved)
    }
    if (entryType === 'change-designation') {
      addToCategory('designation', entryAdded)
      markMissingInCategory('designation', entryRemoved)
    }

    const segments = Array.isArray(entry?.summarySegments) ? entry.summarySegments : []
    segments.forEach((segment) => {
      const section = normalizeText(segment?.section)
      const sectionLower = section.toLowerCase()
      const segmentAdded = normalizeStringList(segment?.added)
      const segmentRemoved = normalizeStringList(segment?.removed)

      if (sectionLower && /skill|keyword/.test(sectionLower)) {
        addToCategory('skills', segmentAdded)
        addToCategory('keywords', segmentAdded)
        markMissingInCategory('skills', segmentRemoved)
        markMissingInCategory('keywords', segmentRemoved)
      }

      if (sectionLower && /experience|career|project|achievement|impact/.test(sectionLower)) {
        addToCategory('experience', segmentAdded)
        markMissingInCategory('experience', segmentRemoved)
      }

      if (sectionLower && /responsibilit|task|project|experience/.test(sectionLower)) {
        addToCategory('tasks', segmentAdded)
        markMissingInCategory('tasks', segmentRemoved)
      }

      if (sectionLower && /certificate|certification|badge/.test(sectionLower)) {
        addToCategory('certificates', segmentAdded)
        markCertificatesMissing(segmentRemoved)
      }

      if (sectionLower && /highlight|summary|profile|overview/.test(sectionLower)) {
        addToCategory('highlights', segmentAdded)
        markMissingInCategory('highlights', segmentRemoved)
      }

      if (sectionLower && /designation|title|headline|position/.test(sectionLower)) {
        addToCategory('designation', segmentAdded)
        markMissingInCategory('designation', segmentRemoved)
      }
    })
  })

  return finalise(accumulator)
}

export default deriveDeltaSummary
