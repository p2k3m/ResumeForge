/**
 * @jest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import ATSScoreDashboard from '../ATSScoreDashboard.jsx'

describe('ATSScoreDashboard', () => {
  const metrics = [
    { category: 'Keyword Match', score: 82, ratingLabel: 'Excellent', tip: 'Optimise your summary to mirror the JD headline.' },
    { category: 'Skills Coverage', score: 76, ratingLabel: 'Good', tip: 'Blend missing keywords into experience bullets.' },
    { category: 'Format Compliance', score: 91, ratingLabel: 'Excellent', tip: 'Keep headings concise for ATS parsing.' },
    { category: 'Readability', score: 70, ratingLabel: 'Good', tip: 'Shorten longer paragraphs into high-impact bullets.' },
    { category: 'Experience Alignment', score: 65, ratingLabel: 'Needs Improvement', tip: 'Lead with quantified outcomes tied to job priorities.' }
  ]

  const match = {
    originalScore: 48,
    enhancedScore: 76,
    originalTitle: 'Product Manager',
    modifiedTitle: 'Senior Product Manager'
  }

  it('renders each metric card and match comparison', () => {
    render(<ATSScoreDashboard metrics={metrics} match={match} />)

    const cards = screen.getAllByTestId('ats-score-card')
    expect(cards).toHaveLength(metrics.length)
    expect(screen.getByLabelText('match comparison')).toBeInTheDocument()
    expect(screen.getByTestId('original-score')).toHaveTextContent('48')
    expect(screen.getByTestId('enhanced-score')).toHaveTextContent('76')
  })

  it('updates to reflect new scores immediately when data changes', () => {
    const { rerender } = render(<ATSScoreDashboard metrics={metrics} match={match} />)

    const updatedMatch = { ...match, enhancedScore: 90 }
    rerender(<ATSScoreDashboard metrics={metrics} match={updatedMatch} />)

    expect(screen.getByTestId('enhanced-score')).toHaveTextContent('90')
    const deltaBadge = screen.getByTestId('match-delta')
    expect(deltaBadge).toHaveTextContent('+42 pts')
  })

  it('handles absent tips gracefully', () => {
    const minimalMetrics = [{ category: 'Structure', score: 50, ratingLabel: 'Fair' }]
    render(<ATSScoreDashboard metrics={minimalMetrics} />)

    const card = screen.getByTestId('ats-score-card')
    expect(card).toBeInTheDocument()
    expect(within(card).queryByTestId('metric-tip')).not.toBeInTheDocument()
  })
})
