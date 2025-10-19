/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import DeltaSummaryPanel from '../DeltaSummaryPanel.jsx'

describe('DeltaSummaryPanel', () => {
  const summary = {
    skills: { added: ['AWS', 'React'], missing: ['GraphQL'] },
    designation: { added: ['Senior Engineer'], missing: ['Engineer'] },
    experience: { added: ['Scaled API throughput'], missing: [] },
    tasks: { added: ['Own product experimentation'], missing: ['Mentor cross-functional pods'] },
    highlights: { added: ['Quantified retention win'], missing: ['Generic leadership statement'] },
    certificates: { added: ['AWS SA — Amazon'], missing: ['PMP'] }
  }

  it('renders chips for added and missing items', () => {
    render(<DeltaSummaryPanel summary={summary} />)

    expect(screen.getByText('Immediate Match Deltas')).toBeInTheDocument()
    expect(screen.getByText('Before updates')).toBeInTheDocument()
    expect(screen.getByText('After enhancements')).toBeInTheDocument()
    expect(screen.getByText(/gaps flagged/i)).toBeInTheDocument()
    expect(screen.getByText(/signals added/i)).toBeInTheDocument()
    expect(screen.getByText('JD Skills')).toBeInTheDocument()
    expect(screen.getByText('AWS')).toBeInTheDocument()
    expect(screen.getByText('GraphQL')).toBeInTheDocument()
    expect(screen.getByText('Senior Engineer')).toBeInTheDocument()
    expect(screen.getByText('PMP')).toBeInTheDocument()
    expect(screen.getByText(/Add these skills next: GraphQL/i)).toBeInTheDocument()
    expect(
      screen.getByText(/Change your last designation from Engineer to Senior Engineer/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/Expand these highlights: Scaled API throughput/i)).toBeInTheDocument()
    expect(
      screen.getByText(/Refresh the stories covering Mentor cross-functional pods/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Surface these summary hooks: Quantified retention win/i)
    ).toBeInTheDocument()
  })

  it('shows placeholders when a category has no entries', () => {
    render(
      <DeltaSummaryPanel
        summary={{
          skills: { added: [], missing: [] },
          designation: { added: [], missing: [] },
          experience: { added: [], missing: [] },
          tasks: { added: [], missing: [] },
          highlights: { added: [], missing: [] },
          certificates: { added: [], missing: [] }
        }}
      />
    )

    expect(screen.getAllByText(/No new/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/No missing/i).length).toBeGreaterThan(0)
  })
})
