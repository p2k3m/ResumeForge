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
    atsScoreBefore: 48,
    atsScoreAfter: 76,
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
    expect(screen.getByTestId('ats-score-summary')).toHaveTextContent(
      'ATS score moved from 48% to 76% (+28 pts).'
    )
    const snapshotMetrics = screen.getByTestId('score-summary-metrics')
    const atsSnapshot = within(snapshotMetrics).getByTestId('ats-summary-card')
    expect(within(atsSnapshot).getByTestId('ats-summary-before')).toHaveTextContent('48%')
    expect(within(atsSnapshot).getByTestId('ats-summary-after')).toHaveTextContent('76%')
    expect(screen.getByLabelText('match comparison')).toBeInTheDocument()
    expect(screen.getByTestId('original-score')).toHaveTextContent('48%')
    expect(screen.getByTestId('enhanced-score')).toHaveTextContent('76%')
    const chart = screen.getByTestId('score-comparison-chart')
    expect(chart).toBeInTheDocument()
    expect(within(chart).getByText('ATS Score Before')).toBeInTheDocument()
    expect(within(chart).getByText('ATS Score After')).toBeInTheDocument()
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

  it('fills in missing ATS categories with placeholders', () => {
    const partialMetrics = [
      { category: 'Readability', score: 64, ratingLabel: 'Good', tips: ['Tighten paragraphs.'] },
      { category: 'Crispness', score: 52, ratingLabel: 'Needs Improvement', tips: ['Trim filler language.'] }
    ]

    render(<ATSScoreDashboard metrics={partialMetrics} baselineMetrics={[]} />)

    const expectedCategories = [
      'Layout & Searchability',
      'Readability',
      'Impact',
      'Crispness',
      'Other'
    ]

    expectedCategories.forEach((category) => {
      expect(screen.getByRole('heading', { name: category })).toBeInTheDocument()
    })

    const layoutCard = screen.getByRole('heading', { name: 'Layout & Searchability' }).closest('article')
    expect(layoutCard).not.toBeNull()
    if (layoutCard) {
      expect(within(layoutCard).getByText(/layout & searchability score yet/i)).toBeInTheDocument()
    }
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

    const updatedMatch = { ...match, enhancedScore: 90, atsScoreAfter: 90 }
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

  it('provides actionable tips when the API omits them', () => {
    const minimalMetrics = [{ category: 'Structure', score: 50, ratingLabel: 'Fair' }]
    render(<ATSScoreDashboard metrics={minimalMetrics} baselineMetrics={baselineMetrics} />)

    const card = screen.getByTestId('ats-score-card')
    expect(card).toBeInTheDocument()
    const tip = within(card).getByTestId('metric-tip')
    expect(tip).toHaveTextContent('Tighten formatting')
  })

  it('describes selection probability changes before and after enhancements', () => {
    const match = {
      ...baseMatch,
      selectionProbabilityBefore: 42,
      selectionProbabilityAfter: 71,
      selectionProbabilityFactors: [
        {
          key: 'designation-changed',
          label: 'Designation changed',
          detail: 'Updated from “Product Manager” to “Senior Product Manager”.',
          impact: 'positive'
        },
        {
          key: 'skills-added',
          label: 'Missing skills added',
          detail: 'Added stakeholder communication.',
          impact: 'positive'
        }
      ]
    }

    render(<ATSScoreDashboard metrics={metrics} baselineMetrics={baselineMetrics} match={match} />)

    expect(screen.getByTestId('selection-summary')).toHaveTextContent(
      'Selection chance moved from 42% to 71% (+29 pts).'
    )
    const summaryMetrics = screen.getByTestId('score-summary-metrics')
    const selectionSnapshot = within(summaryMetrics).getByTestId('selection-summary-card')
    expect(within(selectionSnapshot).getByTestId('selection-summary-before')).toHaveTextContent('42%')
    expect(within(selectionSnapshot).getByTestId('selection-summary-after')).toHaveTextContent('71%')
    expect(within(selectionSnapshot).getByTestId('selection-summary-delta')).toHaveTextContent('+29 pts')
    expect(screen.getByText('Selection % Before')).toBeInTheDocument()
    expect(screen.getByText('Selection % After')).toBeInTheDocument()
    const factorList = screen.getByTestId('selection-factors-list')
    const factorItems = within(factorList).getAllByTestId('selection-factor-item')
    expect(factorItems).toHaveLength(2)
    expect(factorItems[0]).toHaveTextContent('Designation changed')
    expect(factorItems[1]).toHaveTextContent('Missing skills added')
  })

  it('highlights the baseline score when enhanced metrics are unavailable', () => {
    const match = {
      ...baseMatch,
      atsScoreBefore: undefined,
      atsScoreAfter: undefined,
      originalScore: 44,
      enhancedScore: 66,
      missingSkills: ['Strategic planning'],
      addedSkills: ['Market analysis']
    }

    render(<ATSScoreDashboard metrics={metrics} baselineMetrics={baselineMetrics} match={match} />)

    expect(screen.getByTestId('ats-score-summary')).toHaveTextContent(
      'Current ATS score before enhancements: 44%.'
    )
    expect(screen.getByTestId('original-score')).toHaveTextContent('44%')
    expect(screen.getByTestId('enhanced-score')).toHaveTextContent('—')
    expect(screen.queryByTestId('match-delta')).not.toBeInTheDocument()
  })
})
