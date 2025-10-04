/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import ChangeComparisonView from '../ChangeComparisonView.jsx'

describe('ChangeComparisonView', () => {
  it('surfaces actionable suggestions for summary segments', () => {
    render(
      <ChangeComparisonView
        before="Old summary line"
        after="New summary line"
        summarySegments={[
          {
            section: 'Skills Spotlight',
            added: ['GraphQL', 'Rust'],
            removed: ['Legacy stack']
          },
          {
            section: 'Latest Designation',
            added: ['Senior Engineer'],
            removed: ['Engineer']
          },
          {
            section: 'Experience Highlights',
            added: ['Doubled conversion rate']
          }
        ]}
      />
    )

    expect(screen.getByText(/Keep spotlighting GraphQL and Rust/i)).toBeInTheDocument()
    expect(
      screen.getByText(/Change your last designation from Engineer to Senior Engineer/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/Expand these highlights: Doubled conversion rate/i)).toBeInTheDocument()
  })
})

