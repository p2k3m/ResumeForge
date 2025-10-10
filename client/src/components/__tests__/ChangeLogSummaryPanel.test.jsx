/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import ChangeLogSummaryPanel from '../ChangeLogSummaryPanel.jsx'

describe('ChangeLogSummaryPanel', () => {
  it('renders highlights, category rationale, and context', () => {
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
          totals: { entries: 1, categories: 1, highlights: 2, addedItems: 2, removedItems: 0 },
          interviewPrepAdvice: 'We added AWS and Terraform; prepare for questions.'
        }}
        context={{
          jobTitle: 'Lead Platform Engineer',
          jobDescription:
            'Lead the platform squad to scale infrastructure, partner with security, and collaborate with data teams.',
          targetTitle: 'Principal Platform Engineer',
          originalTitle: 'Senior Platform Engineer',
          targetSummary: 'CV now emphasises platform leadership and impact tied to the JD.'
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
    expect(screen.getByText('Interview prep spotlight')).toBeInTheDocument()
    expect(
      screen.getByText('We added AWS and Terraform; prepare for questions.')
    ).toBeInTheDocument()
    expect(screen.getByText('Original JD')).toBeInTheDocument()
    expect(screen.getByText('Lead Platform Engineer')).toBeInTheDocument()
    expect(screen.getByText('What your CV now targets')).toBeInTheDocument()
    expect(screen.getByText('Principal Platform Engineer')).toBeInTheDocument()
    expect(
      screen.getByText('CV now emphasises platform leadership and impact tied to the JD.')
    ).toBeInTheDocument()
    expect(screen.getByText(/Originally titled: Senior Platform Engineer/i)).toBeInTheDocument()
  })

  it('renders context even when highlights are unavailable', () => {
    render(
      <ChangeLogSummaryPanel
        summary={{ highlights: [], categories: [], totals: { entries: 0 } }}
        context={{
          jobTitle: 'Data Scientist',
          jobDescription: 'Solve ML problems and collaborate with stakeholders.',
          targetTitle: 'Senior Data Scientist'
        }}
      />
    )

    expect(screen.getByText('Original JD')).toBeInTheDocument()
    expect(screen.getByText('Data Scientist')).toBeInTheDocument()
    expect(screen.getByText('What your CV now targets')).toBeInTheDocument()
    expect(screen.getByText('Senior Data Scientist')).toBeInTheDocument()
  })

  it('returns null when there are no highlights, categories, or context', () => {
    const { container } = render(
      <ChangeLogSummaryPanel summary={{ highlights: [], categories: [], totals: { entries: 0 } }} />
    )
    expect(container).toBeEmptyDOMElement()
  })
})
