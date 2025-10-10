const TEMPLATE_ALIASES = {
  ucmo: 'classic',
  vibrant: 'modern',
  creative: 'modern'
}

const SUPPORTED_RESUME_TEMPLATE_IDS = new Set([
  'modern',
  'professional',
  'classic',
  'ats',
  '2025'
])

const canonicalizeTemplateId = (value) => {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return ''

  const normalized = trimmed.replace(/[\s_]+/g, '-')
  const alias = TEMPLATE_ALIASES[normalized] || TEMPLATE_ALIASES[trimmed]
  if (alias) {
    return alias
  }

  if (SUPPORTED_RESUME_TEMPLATE_IDS.has(trimmed)) {
    return trimmed
  }

  if (SUPPORTED_RESUME_TEMPLATE_IDS.has(normalized)) {
    return normalized
  }

  if (normalized.startsWith('2025-')) {
    return '2025'
  }

  return ''
}

const BASE_TEMPLATE_OPTIONS = [
  {
    id: 'modern',
    name: 'Modern Minimal',
    description: 'Sleek two-column layout with clean dividers and ATS-safe spacing.',
    badge: 'Best for Tech Roles'
  },
  {
    id: 'professional',
    name: 'Professional Edge',
    description: 'Refined corporate styling with confident headings and balanced whitespace.',
    badge: 'Best for Sr Managers'
  },
  {
    id: 'classic',
    name: 'Classic Heritage',
    description: 'Timeless serif typography with structured section framing.'
  },
  {
    id: 'ats',
    name: 'ATS Optimized',
    description: 'Single-column structure engineered for parsing accuracy.',
    badge: 'High Impact/ATS'
  },
  {
    id: '2025',
    name: 'Future Vision 2025',
    description: 'Futuristic grid layout with crisp typography and subtle neon cues.'
  }
]

module.exports = {
  TEMPLATE_ALIASES,
  SUPPORTED_RESUME_TEMPLATE_IDS,
  canonicalizeTemplateId,
  BASE_TEMPLATE_OPTIONS
}
