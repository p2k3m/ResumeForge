import { describe, expect, it } from '@jest/globals'
import { deriveDeltaSummary } from '../deriveDeltaSummary.js'

describe('deriveDeltaSummary', () => {
  it('combines match data, change logs, and certificates into category buckets', () => {
    const summary = deriveDeltaSummary({
      match: {
        addedSkills: ['AWS', 'React'],
        missingSkills: ['GraphQL'],
        originalTitle: 'Software Engineer',
        modifiedTitle: 'Senior Software Engineer'
      },
      changeLog: [
        {
          type: 'align-experience',
          addedItems: ['Scaled API throughput 3x'],
          removedItems: ['Maintained legacy module'],
          summarySegments: [
            {
              section: 'Experience',
              added: ['Scaled API throughput 3x'],
              removed: ['Maintained legacy module'],
              reason: ['Expanded metrics to mirror JD emphasis.']
            }
          ]
        },
        {
          type: 'add-missing-skills',
          addedItems: ['Node.js'],
          summarySegments: [
            {
              section: 'Skills',
              added: ['Node.js'],
              removed: []
            }
          ]
        }
      ],
      certificateInsights: {
        known: [{ name: 'AWS Certified Solutions Architect', provider: 'Amazon' }],
        suggestions: ['PMP'],
        manualEntryRequired: true
      },
      manualCertificates: [{ name: 'Scrum Master', provider: 'Scrum.org' }],
      jobSkills: ['AWS', 'GraphQL', 'Leadership'],
      resumeSkills: ['AWS', 'React', 'Leadership']
    })

    expect(summary.skills.added).toEqual(expect.arrayContaining(['AWS', 'React', 'Node.js']))
    expect(summary.skills.missing).toEqual(expect.arrayContaining(['GraphQL']))
    expect(summary.experience.added).toEqual(expect.arrayContaining(['Scaled API throughput 3x']))
    expect(summary.experience.missing).toEqual(expect.arrayContaining(['Maintained legacy module']))
    expect(summary.designation.added).toContain('Senior Software Engineer')
    expect(summary.designation.missing).toContain('Software Engineer')
    expect(summary.keywords.missing).toEqual(expect.arrayContaining(['GraphQL']))
    expect(summary.certificates.added).toEqual(
      expect.arrayContaining(['AWS Certified Solutions Architect — Amazon', 'Scrum Master — Scrum.org'])
    )
    expect(summary.certificates.missing).toEqual(expect.arrayContaining(['PMP', 'Manual entry required']))
  })

  it('returns empty buckets when no data is provided', () => {
    const summary = deriveDeltaSummary({})

    expect(summary.skills.added).toEqual([])
    expect(summary.skills.missing).toEqual([])
    expect(summary.certificates.added).toEqual([])
    expect(summary.certificates.missing).toEqual([])
  })
})
