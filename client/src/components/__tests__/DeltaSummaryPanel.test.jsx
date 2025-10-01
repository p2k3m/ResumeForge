/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import DeltaSummaryPanel from '../DeltaSummaryPanel.jsx'

describe('DeltaSummaryPanel', () => {
  const summary = {
    skills: { added: ['AWS', 'React'], missing: ['GraphQL'] },
    experience: { added: ['Scaled API throughput'], missing: [] },
    designation: { added: ['Senior Engineer'], missing: ['Engineer'] },
    keywords: { added: ['Leadership'], missing: ['Serverless'] },
    certificates: { added: ['AWS SA — Amazon'], missing: ['PMP'] }
  }

  it('renders chips for added and missing items', () => {
    render(<DeltaSummaryPanel summary={summary} />)

    expect(screen.getByText('Immediate Match Deltas')).toBeInTheDocument()
    expect(screen.getByText('Skills')).toBeInTheDocument()
    expect(screen.getByText('AWS')).toBeInTheDocument()
    expect(screen.getByText('GraphQL')).toBeInTheDocument()
    expect(screen.getByText('Senior Engineer')).toBeInTheDocument()
    expect(screen.getByText('PMP')).toBeInTheDocument()
  })

  it('shows placeholders when a category has no entries', () => {
    render(
      <DeltaSummaryPanel
        summary={{
          skills: { added: [], missing: [] },
          experience: { added: [], missing: [] },
          designation: { added: [], missing: [] },
          keywords: { added: [], missing: [] },
          certificates: { added: [], missing: [] }
        }}
      />
    )

    expect(screen.getAllByText(/No new/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/No missing/i).length).toBeGreaterThan(0)
  })
})
