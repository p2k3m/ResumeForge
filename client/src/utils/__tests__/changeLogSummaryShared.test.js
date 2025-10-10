import { buildAggregatedChangeLogSummary } from '../changeLogSummaryShared.js'

describe('buildAggregatedChangeLogSummary', () => {
  it('aggregates category changelog details into highlights', () => {
    const summary = buildAggregatedChangeLogSummary([
      {
        id: 'entry-1',
        categoryChangelog: [
          {
            key: 'skills',
            label: 'Skills',
            added: ['Kubernetes', 'AWS'],
            reasons: ['Added for better JD alignment.']
          },
          {
            key: 'designation',
            label: 'Designation',
            added: ['Senior Platform Engineer'],
            removed: ['Software Engineer']
          }
        ]
      }
    ])

    expect(summary.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'skills',
          added: expect.arrayContaining(['Kubernetes', 'AWS'])
        }),
        expect.objectContaining({
          key: 'designation',
          added: expect.arrayContaining(['Senior Platform Engineer']),
          removed: expect.arrayContaining(['Software Engineer'])
        })
      ])
    )

    const designationHighlight = summary.highlights.find((item) => item.key === 'designation:changed')
    expect(designationHighlight).toEqual(
      expect.objectContaining({
        label: 'Designation changed',
        items: expect.arrayContaining(['Software Engineer → Senior Platform Engineer'])
      })
    )

    const skillsHighlight = summary.highlights.find((item) => item.key === 'skills:added')
    expect(skillsHighlight).toEqual(
      expect.objectContaining({
        label: 'Skills added',
        items: expect.arrayContaining(['Kubernetes', 'AWS'])
      })
    )
  })

  it('derives categories when categoryChangelog is missing', () => {
    const summary = buildAggregatedChangeLogSummary([
      {
        id: 'entry-2',
        summarySegments: [
          {
            section: 'Skills Matrix',
            added: ['Docker'],
            reason: ['Matched job tooling requirements.']
          }
        ],
        detail: 'Added Docker for JD alignment.'
      }
    ])

    const skillsHighlight = summary.highlights.find((item) => item.key === 'skills:added')
    expect(skillsHighlight).toBeDefined()
    expect(skillsHighlight.items).toEqual(expect.arrayContaining(['Docker']))
    expect(summary.totals.entries).toBe(1)
    const skillsCategory = summary.categories.find((category) => category.key === 'skills')
    expect(skillsCategory).toBeDefined()
    expect(skillsCategory.added).toEqual(expect.arrayContaining(['Docker']))
  })

  it('ignores reverted entries', () => {
    const summary = buildAggregatedChangeLogSummary([
      {
        id: 'entry-3',
        reverted: true,
        categoryChangelog: [
          {
            key: 'skills',
            label: 'Skills',
            added: ['Terraform']
          }
        ]
      }
    ])

    expect(summary.categories).toHaveLength(0)
    expect(summary.highlights).toHaveLength(0)
    expect(summary.totals.entries).toBe(0)
  })
})
