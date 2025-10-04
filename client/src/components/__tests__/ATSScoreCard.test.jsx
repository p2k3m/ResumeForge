/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import ATSScoreCard from '../ATSScoreCard.jsx'

describe('ATSScoreCard', () => {
  const baseMetric = {
    category: 'Keyword Match',
    score: 82,
    ratingLabel: 'Excellent',
    tip: 'Incorporate the role-specific leadership verbs to boost resonance.'
  }

  it('renders all core metric content', () => {
    render(<ATSScoreCard metric={baseMetric} accentClass="from-indigo-500 to-purple-500" />)

    expect(screen.getByText('Keyword Match')).toBeInTheDocument()
    expect(screen.getByText('ATS Score Before')).toBeInTheDocument()
    expect(screen.getByText('ATS Score After')).toBeInTheDocument()
    expect(screen.getByTestId('metric-score-before')).toHaveTextContent('82')
    expect(screen.getByTestId('metric-score')).toHaveTextContent('82')
    expect(screen.getByTestId('rating-badge')).toHaveTextContent('EXCELLENT')
    expect(screen.getByTestId('metric-tip')).toHaveTextContent(
      /leadership verbs/i
    )
    expect(screen.getByText('Tip')).toBeInTheDocument()
  })

  it('matches the gradient snapshot for consistency', () => {
    const { asFragment } = render(
      <ATSScoreCard metric={baseMetric} accentClass="from-indigo-500 to-purple-500" />
    )

    expect(asFragment()).toMatchSnapshot()
  })

  it('normalises rating labels and hides percent for non-numeric values', () => {
    const metric = { ...baseMetric, ratingLabel: 'Needs Improvement', score: 'N/A', tip: '' }
    render(<ATSScoreCard metric={metric} accentClass="from-indigo-500 to-purple-500" />)

    expect(screen.getByTestId('rating-badge')).toHaveTextContent('NEEDS IMPROVEMENT')
    expect(screen.getByTestId('metric-score')).toHaveTextContent('N/A')
    expect(screen.getByTestId('metric-score-before')).toHaveTextContent('N/A')
    expect(screen.queryAllByText('%')).toHaveLength(0)
    expect(screen.queryByTestId('metric-tip')).not.toBeInTheDocument()
  })
})
