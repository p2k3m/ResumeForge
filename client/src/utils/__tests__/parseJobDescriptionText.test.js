import { parseJobDescriptionText } from '../parseJobDescriptionText.js'

describe('parseJobDescriptionText', () => {
  it('extracts title, meta, sections, and bullets from a pasted JD', () => {
    const text = `
Senior Product Manager
Company: Innovate Labs
Location: Remote (US)
Responsibilities:
- Lead product roadmap and prioritisation
- Partner with engineering and design to deliver releases
Requirements:
- 5+ years product management experience
- Comfortable with SQL and experimentation frameworks
Nice to have:
- Fintech or payments background
`

    const parsed = parseJobDescriptionText(text)

    expect(parsed.title).toBe('Senior Product Manager')
    expect(parsed.wordCount).toBeGreaterThan(10)
    expect(parsed.meta).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Company', value: 'Innovate Labs' }),
        expect.objectContaining({ label: 'Location', value: 'Remote (US)' }),
      ])
    )
    const responsibilities = parsed.sections.find((section) => section.heading === 'Responsibilities')
    expect(responsibilities).toBeDefined()
    expect(responsibilities.bullets).toEqual(
      expect.arrayContaining([
        'Lead product roadmap and prioritisation',
        'Partner with engineering and design to deliver releases',
      ])
    )
    const requirements = parsed.sections.find((section) => section.heading === 'Requirements')
    expect(requirements).toBeDefined()
    expect(requirements.bullets).toEqual(
      expect.arrayContaining([
        '5+ years product management experience',
        'Comfortable with SQL and experimentation frameworks',
      ])
    )
    expect(parsed.keywords.length).toBeGreaterThan(0)
    expect(parsed.keywords).toContain('product')
  })

  it('returns null when no meaningful text is supplied', () => {
    expect(parseJobDescriptionText('')).toBeNull()
    expect(parseJobDescriptionText('   ')).toBeNull()
    expect(parseJobDescriptionText(null)).toBeNull()
  })
})
