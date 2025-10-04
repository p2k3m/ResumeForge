/**
 * @jest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import ATSScoreDashboard from '../ATSScoreDashboard.jsx'

describe('ATSScoreDashboard', () => {
  const metrics = [
    {
      category: 'Keyword Match',
      score: 82,
      ratingLabel: 'Excellent',
      tips: ['Optimise your summary to mirror the JD headline.'],
    },
    {
      category: 'Skills Coverage',
      score: 76,
      ratingLabel: 'Good',
      tips: ['Blend missing keywords into experience bullets.'],
    },
    {
      category: 'Format Compliance',
      score: 91,
      ratingLabel: 'Excellent',
      tips: ['Keep headings concise for ATS parsing.'],
    },
    {
      category: 'Readability',
      score: 70,
      ratingLabel: 'Good',
      tips: ['Shorten longer paragraphs into high-impact bullets.'],
    },
    {
      category: 'Experience Alignment',
      score: 65,
      ratingLabel: 'Needs Improvement',
      tips: ['Lead with quantified outcomes tied to job priorities.'],
    }
  ]

  const baselineMetrics = metrics.map((metric) => ({
    ...metric,
    score: Math.max(metric.score - 8, 0)
  }))

  const baseMatch = {
    originalScore: 48,
    enhancedScore: 76,
    originalTitle: 'Product Manager',
    modifiedTitle: 'Senior Product Manager'
  }

  it('renders each metric card and match comparison', () => {
    const match = {
      ...baseMatch,
      missingSkills: ['SQL', 'Roadmap execution'],
      addedSkills: ['Stakeholder communication']
    }
    render(<ATSScoreDashboard metrics={metrics} baselineMetrics={baselineMetrics} match={match} />)

    const cards = screen.getAllByTestId('ats-score-card')
    expect(cards).toHaveLength(metrics.length)
    expect(screen.getAllByText('ATS Score Before')).not.toHaveLength(0)
    expect(screen.getAllByText('ATS Score After')).not.toHaveLength(0)
    expect(screen.getByLabelText('match comparison')).toBeInTheDocument()
    expect(screen.getByTestId('original-score')).toHaveTextContent('48')
    expect(screen.getByTestId('enhanced-score')).toHaveTextContent('76')
    const chart = screen.getByTestId('score-comparison-chart')
    expect(chart).toBeInTheDocument()
    expect(within(chart).getByText('Original')).toBeInTheDocument()
    expect(within(chart).getByText('Enhanced')).toBeInTheDocument()
    expect(screen.getByTestId('dashboard-live-indicator')).toBeInTheDocument()
    expect(screen.getByTestId('original-match-status')).toHaveTextContent('Mismatch')
    expect(screen.getByTestId('enhanced-match-status')).toHaveTextContent('Mismatch')
    expect(screen.getByTestId('original-match-advice')).toHaveTextContent(
      'You are missing these skills: SQL, Roadmap execution'
    )
    expect(screen.getByTestId('enhanced-match-advice')).toHaveTextContent(
      'Still missing these skills: SQL, Roadmap execution'
    )
  })

  it('updates to reflect new scores immediately when data changes', () => {
    const match = {
      ...baseMatch,
      missingSkills: ['SQL', 'Roadmap execution'],
      addedSkills: ['Stakeholder communication']
    }
    const { rerender } = render(
      <ATSScoreDashboard metrics={metrics} baselineMetrics={baselineMetrics} match={match} />
    )

    const updatedMatch = { ...match, enhancedScore: 90 }
    rerender(
      <ATSScoreDashboard
        metrics={metrics}
        baselineMetrics={baselineMetrics}
        match={updatedMatch}
      />
    )

    expect(screen.getByTestId('enhanced-score')).toHaveTextContent('90')
    const deltaBadge = screen.getByTestId('match-delta')
    expect(deltaBadge).toHaveTextContent('+42 pts')
    expect(screen.getByTestId('score-improvement-narrative')).toHaveTextContent(
      'Score moved from 48% to 90%'
    )
  })

  it('shows match flags and positive advice when gaps are closed', () => {
    const match = {
      ...baseMatch,
      missingSkills: [],
      addedSkills: ['Cross-functional leadership', 'Go-to-market strategy']
    }

    render(<ATSScoreDashboard metrics={metrics} baselineMetrics={baselineMetrics} match={match} />)

    expect(screen.getByTestId('original-match-status')).toHaveTextContent('Match')
    expect(screen.getByTestId('enhanced-match-status')).toHaveTextContent('Match')
    expect(screen.getByTestId('original-match-advice')).toHaveTextContent(
      'ResumeForge added: Cross-functional leadership, Go-to-market strategy'
    )
    expect(screen.getByTestId('enhanced-match-advice')).toHaveTextContent(
      'Now highlighting: Cross-functional leadership, Go-to-market strategy'
    )
  })

  it('summarises improvements with rationale and interview preparation guidance', () => {
    const match = {
      ...baseMatch,
      improvementSummary: [
        {
          section: 'Professional Summary',
          added: ['Product strategist framing'],
          removed: ['Generic objective statement'],
          reason: ['Signals senior-level ownership that the hiring panel expects.']
        },
        {
          section: 'Experience',
          added: ['Revenue growth metrics'],
          reason: ['Highlights measurable impact aligned to the JD KPIs.']
        }
      ]
    }

    render(<ATSScoreDashboard metrics={metrics} baselineMetrics={baselineMetrics} match={match} />)

    const recap = screen.getByTestId('improvement-recap-card')
    expect(recap).toBeInTheDocument()

    const items = screen.getAllByTestId('improvement-recap-item')
    expect(items).toHaveLength(2)
    expect(within(items[0]).getByText('Professional Summary')).toBeInTheDocument()
    expect(within(items[0]).getByText(/Added Product strategist framing/)).toBeInTheDocument()
    expect(within(items[0]).getByTestId('improvement-recap-reason')).toHaveTextContent(
      'Why it matters: Signals senior-level ownership that the hiring panel expects.'
    )
    expect(within(items[0]).getByTestId('improvement-recap-interview')).toHaveTextContent(
      /Interview prep:/
    )
  })

  it('handles absent tips gracefully', () => {
    const minimalMetrics = [{ category: 'Structure', score: 50, ratingLabel: 'Fair' }]
    render(<ATSScoreDashboard metrics={minimalMetrics} baselineMetrics={baselineMetrics} />)

    const card = screen.getByTestId('ats-score-card')
    expect(card).toBeInTheDocument()
    expect(within(card).queryByTestId('metric-tip')).not.toBeInTheDocument()
  })
})
