import { buildCategoryChangeLog } from '../changeLogCategorySummaries.js'

describe('buildCategoryChangeLog', () => {
  it('captures category updates with reasons from summary segments', () => {
    const changeLog = buildCategoryChangeLog({
      summarySegments: [
        {
          section: 'Skills',
          added: ['Kubernetes', 'Terraform'],
          removed: ['Flash'],
          reason: ['Added for better fit to JD']
        }
      ],
      detail: 'Inserted missing keywords so the CV satisfies the role requirements.',
      suggestionType: 'add-missing-skills',
      scoreDelta: 7
    })

    const skills = changeLog.find((entry) => entry.key === 'skills')
    expect(skills).toBeDefined()
    expect(skills.added).toEqual(expect.arrayContaining(['Kubernetes', 'Terraform']))
    expect(skills.removed).toEqual(expect.arrayContaining(['Flash']))
    expect(skills.reasons).toEqual(
      expect.arrayContaining(['Added for better fit to JD'])
    )

    const ats = changeLog.find((entry) => entry.key === 'ats')
    expect(ats).toBeDefined()
    expect(ats.reasons.join(' ')).toContain('Score impact: +7 pts')
  })

  it('records designation swaps even when summary segments are absent', () => {
    const changeLog = buildCategoryChangeLog({
      detail: 'Aligned the visible designation with the target role title.',
      before: 'Project Lead',
      after: 'Product Manager',
      suggestionType: 'change-designation'
    })

    const designation = changeLog.find((entry) => entry.key === 'designation')
    expect(designation).toBeDefined()
    expect(designation.added).toContain('Product Manager')
    expect(designation.removed).toContain('Project Lead')
    expect(designation.reasons.join(' ')).toContain('align with the JD role name')

    const ats = changeLog.find((entry) => entry.key === 'ats')
    expect(ats).toBeDefined()
    expect(ats.reasons).toEqual(
      expect.arrayContaining(['Aligned the visible designation with the target role title.'])
    )
  })
})
