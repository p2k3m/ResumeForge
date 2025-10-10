import { buildCategoryChangeLog, CATEGORY_METADATA, CATEGORY_ORDER } from './changeLogCategorySummaries.js'

const HIGHLIGHT_LABEL_OVERRIDES = {
  designation: {
    changed: 'Designation changed'
  },
  ats: {
    reasons: 'ATS rationale'
  }
}

function normaliseSummaryString(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length ? trimmed : ''
  }
  if (value === null || value === undefined) {
    return ''
  }
  return String(value || '').trim()
}

function normaliseSummaryList(value) {
  if (Array.isArray(value)) {
    return value.map(normaliseSummaryString).filter(Boolean)
  }
  const text = normaliseSummaryString(value)
  return text ? [text] : []
}

function createCollector() {
  return {
    items: [],
    seen: new Set()
  }
}

function addToCollector(collector, values) {
  if (!collector) return
  normaliseSummaryList(values).forEach((item) => {
    const key = item.toLowerCase()
    if (collector.seen.has(key)) {
      return
    }
    collector.seen.add(key)
    collector.items.push(item)
  })
}

function resolveCategoryKey(category = {}) {
  const directKey = normaliseSummaryString(category.key).toLowerCase()
  if (directKey && CATEGORY_METADATA[directKey]) {
    return directKey
  }
  const label = normaliseSummaryString(category.label)
  if (label) {
    const lower = label.toLowerCase()
    const matched = Object.entries(CATEGORY_METADATA).find(([, meta]) => meta.label.toLowerCase() === lower)
    if (matched) {
      return matched[0]
    }
    return lower.replace(/[^a-z0-9]+/g, '_') || 'general'
  }
  return 'general'
}

function resolveCategoryLabel(category = {}, resolvedKey) {
  const metadata = CATEGORY_METADATA[resolvedKey]
  if (metadata?.label) {
    return metadata.label
  }
  const label = normaliseSummaryString(category.label)
  if (label) {
    return label
  }
  return resolvedKey.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function resolveCategoryDescription(category = {}, resolvedKey) {
  const metadata = CATEGORY_METADATA[resolvedKey]
  if (metadata?.description) {
    return metadata.description
  }
  const description = normaliseSummaryString(category.description)
  return description
}

function ensureCategoryBucket(map, category, resolvedKey) {
  const key = resolvedKey || resolveCategoryKey(category)
  if (!map.has(key)) {
    map.set(key, {
      key,
      label: resolveCategoryLabel(category, key),
      description: resolveCategoryDescription(category, key),
      added: createCollector(),
      removed: createCollector(),
      reasons: createCollector()
    })
  } else {
    const bucket = map.get(key)
    const label = resolveCategoryLabel(category, key)
    if (label && bucket.label !== label) {
      bucket.label = label
    }
    const description = resolveCategoryDescription(category, key)
    if (description && !bucket.description) {
      bucket.description = description
    }
  }
  return map.get(key)
}

function buildCategoryEntriesForChange(entry = {}) {
  if (Array.isArray(entry.categoryChangelog) && entry.categoryChangelog.length > 0) {
    return entry.categoryChangelog
  }
  return buildCategoryChangeLog({
    summarySegments: entry.summarySegments,
    detail: entry.detail,
    addedItems: entry.addedItems,
    removedItems: entry.removedItems,
    itemizedChanges: entry.itemizedChanges,
    before: entry.before,
    after: entry.after,
    scoreDelta: entry.scoreDelta,
    suggestionType: entry.type
  })
}

function finaliseCategory(bucket) {
  if (!bucket) return null
  const added = bucket.added.items
  const removed = bucket.removed.items
  const reasons = bucket.reasons.items
  if (added.length === 0 && removed.length === 0 && reasons.length === 0) {
    return null
  }
  return {
    key: bucket.key,
    label: bucket.label,
    description: bucket.description,
    added,
    removed,
    reasons,
    totalAdded: added.length,
    totalRemoved: removed.length,
    totalReasons: reasons.length,
    totalChanges: added.length + removed.length
  }
}

function buildDesignationChanges(category) {
  const collector = createCollector()
  const pairCount = Math.min(category.removed.length, category.added.length)
  for (let index = 0; index < pairCount; index += 1) {
    const from = normaliseSummaryString(category.removed[index])
    const to = normaliseSummaryString(category.added[index])
    if (!from || !to) continue
    const summary = `${from} → ${to}`
    addToCollector(collector, [summary])
  }
  return collector.items
}

function getHighlightLabel(categoryKey, type, fallback) {
  const overrides = HIGHLIGHT_LABEL_OVERRIDES[categoryKey]
  if (overrides && overrides[type]) {
    return overrides[type]
  }
  const metadata = CATEGORY_METADATA[categoryKey]
  const labelBase = metadata?.label || fallback || categoryKey
  switch (type) {
    case 'added':
      return `${labelBase} added`
    case 'removed':
      return `${labelBase} removed`
    case 'changed':
      return `${labelBase} changed`
    case 'reasons':
      return `${labelBase} rationale`
    default:
      return fallback || labelBase
  }
}

function buildHighlights(categories = []) {
  const highlights = []
  categories.forEach((category) => {
    if (category.key === 'designation') {
      const transitions = buildDesignationChanges(category)
      if (transitions.length > 0) {
        highlights.push({
          key: 'designation:changed',
          category: 'designation',
          label: getHighlightLabel('designation', 'changed', 'Designation changed'),
          type: 'changed',
          items: transitions,
          count: transitions.length
        })
      } else if (category.added.length > 0) {
        highlights.push({
          key: 'designation:added',
          category: 'designation',
          label: getHighlightLabel('designation', 'added', 'Designation added'),
          type: 'added',
          items: category.added,
          count: category.added.length
        })
      }
      if (category.removed.length > 0) {
        highlights.push({
          key: 'designation:removed',
          category: 'designation',
          label: getHighlightLabel('designation', 'removed', 'Designation removed'),
          type: 'removed',
          items: category.removed,
          count: category.removed.length
        })
      }
      return
    }

    if (category.added.length > 0) {
      highlights.push({
        key: `${category.key}:added`,
        category: category.key,
        label: getHighlightLabel(category.key, 'added', `${category.label} added`),
        type: 'added',
        items: category.added,
        count: category.added.length
      })
    }
    if (category.removed.length > 0) {
      highlights.push({
        key: `${category.key}:removed`,
        category: category.key,
        label: getHighlightLabel(category.key, 'removed', `${category.label} removed`),
        type: 'removed',
        items: category.removed,
        count: category.removed.length
      })
    }
    if (category.reasons.length > 0 && ['ats'].includes(category.key)) {
      highlights.push({
        key: `${category.key}:reasons`,
        category: category.key,
        label: getHighlightLabel(category.key, 'reasons', `${category.label} rationale`),
        type: 'reasons',
        items: category.reasons,
        count: category.reasons.length
      })
    }
  })
  return highlights
}

function buildTotals(entries, categories, highlights) {
  const activeEntries = Array.isArray(entries)
    ? entries.filter((entry) => entry && !entry.reverted)
    : []
  const addedItems = categories.reduce((sum, category) => sum + category.added.length, 0)
  const removedItems = categories.reduce((sum, category) => sum + category.removed.length, 0)
  return {
    entries: activeEntries.length,
    categories: categories.length,
    highlights: highlights.length,
    addedItems,
    removedItems
  }
}

export function buildAggregatedChangeLogSummary(entries = []) {
  const categoryMap = new Map()
  const safeEntries = Array.isArray(entries) ? entries : []

  safeEntries.forEach((entry) => {
    if (entry?.reverted) {
      return
    }
    const categories = buildCategoryEntriesForChange(entry)
    categories.forEach((category) => {
      if (!category) return
      const bucket = ensureCategoryBucket(categoryMap, category)
      addToCollector(bucket.added, category.added)
      addToCollector(bucket.removed, category.removed)
      addToCollector(bucket.reasons, category.reasons)
    })
  })

  const ordered = []
  const consumedKeys = new Set()
  CATEGORY_ORDER.forEach((key) => {
    if (categoryMap.has(key)) {
      const category = finaliseCategory(categoryMap.get(key))
      if (category) {
        ordered.push(category)
      }
      consumedKeys.add(key)
    }
  })

  categoryMap.forEach((bucket, key) => {
    if (consumedKeys.has(key)) {
      return
    }
    const category = finaliseCategory(bucket)
    if (category) {
      ordered.push(category)
    }
  })

  const highlights = buildHighlights(ordered)
  const totals = buildTotals(safeEntries, ordered, highlights)

  return {
    categories: ordered,
    highlights,
    totals
  }
}

export default buildAggregatedChangeLogSummary
