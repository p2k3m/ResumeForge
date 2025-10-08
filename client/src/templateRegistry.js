const TEMPLATE_ALIASES = {
  ucmo: 'classic',
  vibrant: 'modern',
  creative: 'modern'
}

export const SUPPORTED_RESUME_TEMPLATE_IDS = new Set([
  'modern',
  'professional',
  'classic',
  'ats',
  '2025'
])

export const canonicalizeTemplateId = (value) => {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return ''
  const canonical = TEMPLATE_ALIASES[trimmed] || trimmed
  return SUPPORTED_RESUME_TEMPLATE_IDS.has(canonical) ? canonical : ''
}

export const BASE_TEMPLATE_OPTIONS = [
  {
    id: 'modern',
    name: 'Modern Minimal',
    description: 'Sleek two-column layout with clean dividers and ATS-safe spacing.'
  },
  {
    id: 'professional',
    name: 'Professional Edge',
    description: 'Refined corporate styling with confident headings and balanced whitespace.'
  },
  {
    id: 'classic',
    name: 'Classic Heritage',
    description: 'Timeless serif typography with structured section framing.'
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
