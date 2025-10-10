/**
 * @jest-environment node
 */
let BASE_TEMPLATE_OPTIONS
let canonicalizeTemplateId

beforeAll(async () => {
  const registry = await import('../templateRegistry.js')
  BASE_TEMPLATE_OPTIONS = registry.BASE_TEMPLATE_OPTIONS
  canonicalizeTemplateId = registry.canonicalizeTemplateId
})

describe('resume template registry', () => {
  it('exposes at least four distinct resume templates by default', () => {
    const ids = BASE_TEMPLATE_OPTIONS.map((option) => option.id)
    const uniqueIds = new Set(ids)

    expect(uniqueIds.size).toBeGreaterThanOrEqual(4)
    ids.forEach((id) => {
      expect(canonicalizeTemplateId(id)).toBe(id)
    })
  })

  it('maps legacy aliases onto supported templates', () => {
    expect(canonicalizeTemplateId('UcMo')).toBe('classic')
    expect(canonicalizeTemplateId('vibrant')).toBe('modern')
    expect(canonicalizeTemplateId('creative')).toBe('modern')
  })

  it('maps seasonal 2025 variants back to the base Future Vision template', () => {
    expect(canonicalizeTemplateId('2025-q4-emerald')).toBe('2025')
    expect(canonicalizeTemplateId('2025 Q4 Slate')).toBe('2025')
    expect(canonicalizeTemplateId('2025_q3_pilot')).toBe('2025')
  })

  it('filters unsupported or experimental template identifiers', () => {
    ;['portal', 'precision', 'structured', 'beta-template'].forEach((id) => {
      expect(canonicalizeTemplateId(id)).toBe('')
    })
  })
})
