/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import ChangeLogSummaryPanel from '../ChangeLogSummaryPanel.jsx'

describe('ChangeLogSummaryPanel', () => {
  it('renders highlights and category rationale', () => {
    render(
      <ChangeLogSummaryPanel
        summary={{
          highlights: [
            {
              key: 'skills:added',
              label: 'Skills added',
              type: 'added',
              items: ['Kubernetes', 'AWS'],
              count: 2
            },
            {
              key: 'designation:changed',
              label: 'Designation changed',
              type: 'changed',
              items: ['Engineer → Lead'],
              count: 1
            }
          ],
          categories: [
            {
              key: 'ats',
              label: 'ATS',
              description: 'Score movement and JD alignment rationale.',
              reasons: ['Score impact: +4 pts versus the baseline upload.']
            }
          ],
          totals: { entries: 1, categories: 1, highlights: 2, addedItems: 2, removedItems: 0 }
        }}
      />
    )

    expect(screen.getByText('Skills added')).toBeInTheDocument()
    expect(screen.getByText('Kubernetes')).toBeInTheDocument()
    expect(screen.getByText('Designation changed')).toBeInTheDocument()
    expect(screen.getByText('Engineer → Lead')).toBeInTheDocument()
    expect(screen.getByText('Score movement and JD alignment rationale.')).toBeInTheDocument()
    expect(
      screen.getByText('Score impact: +4 pts versus the baseline upload.')
    ).toBeInTheDocument()
  })

  it('returns null when there are no highlights or categories', () => {
    const { container } = render(
      <ChangeLogSummaryPanel summary={{ highlights: [], categories: [], totals: { entries: 0 } }} />
    )
    expect(container).toBeEmptyDOMElement()
  })
})
