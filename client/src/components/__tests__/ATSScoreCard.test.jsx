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
    expect(screen.getByTestId('metric-score')).toHaveTextContent('82')
    expect(screen.getByTestId('rating-badge')).toHaveTextContent('EXCELLENT')
    expect(screen.getByTestId('metric-tip')).toHaveTextContent(
      /leadership verbs/i
    )
  })

  it('matches the gradient snapshot for consistency', () => {
    const { asFragment } = render(
      <ATSScoreCard metric={baseMetric} accentClass="from-indigo-500 to-purple-500" />
    )

    expect(asFragment()).toMatchSnapshot()
  })
})
