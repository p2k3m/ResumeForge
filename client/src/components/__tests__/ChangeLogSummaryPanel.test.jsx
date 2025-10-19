/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import ChangeLogSummaryPanel from '../ChangeLogSummaryPanel.jsx'

describe('ChangeLogSummaryPanel', () => {
  it('shows totals, section chips, and category updates', () => {
    render(
      <ChangeLogSummaryPanel
        summary={{
          totals: {
            entries: 3,
            categories: 4,
            addedItems: 7,
            removedItems: 2
          },
          sections: [
            { key: 'skills', label: 'Skills', count: 4 },
            { key: 'experience', label: 'Experience', count: 2 }
          ],
          highlights: [
            {
              key: 'skills:added',
              category: 'skills',
              label: 'Skills added',
              type: 'added',
              items: ['GraphQL'],
              count: 1
            }
          ],
          categories: [
            {
              key: 'skills',
              label: 'Skills',
              description: 'Keyword coverage surfaced across the resume.',
              added: ['GraphQL', 'Rust'],
              removed: ['Legacy stack'],
              reasons: ['Needed to mirror the JD keywords.']
            }
          ],
          interviewPrepAdvice: 'We added GraphQL; prepare for questions.'
        }}
        context={{
          jobTitle: 'Senior Software Engineer',
          jobDescription: 'Build and ship new experiences.',
          targetTitle: 'Senior Software Engineer',
          originalTitle: 'Software Engineer'
        }}
      />
    )

    expect(screen.getByText('Accepted improvements')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Categories impacted')).toBeInTheDocument()
    expect(screen.getByText(/Where updates landed/i)).toBeInTheDocument()
    expect(screen.getByText('Skills')).toBeInTheDocument()
    expect(screen.getByText('Experience')).toBeInTheDocument()
    expect(screen.getByText('GraphQL')).toBeInTheDocument()
    expect(screen.getByText('Rust')).toBeInTheDocument()
    expect(screen.getByText('Legacy stack')).toBeInTheDocument()
    expect(screen.getByText(/Needed to mirror the JD keywords/i)).toBeInTheDocument()
    expect(screen.getByText(/We added GraphQL/i)).toBeInTheDocument()
  })

  it('returns null when summary is missing', () => {
    const { container } = render(<ChangeLogSummaryPanel summary={null} />)
    expect(container.firstChild).toBeNull()
  })
})
