/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
import TemplatePreview from '../TemplatePreview.jsx'

describe('TemplatePreview comparison support', () => {
  const resumeTemplates = [
    { id: 'modern', name: 'Modern', description: 'Modern resume style.' },
    { id: 'classic', name: 'Classic', description: 'Classic resume style.' },
    { id: 'professional', name: 'Professional', description: 'Professional resume style.' }
  ]

  const coverTemplates = [
    { id: 'cover_modern', name: 'Modern Cover', description: 'Modern cover style.' },
    { id: 'cover_classic', name: 'Classic Cover', description: 'Classic cover style.' },
    { id: 'cover_professional', name: 'Professional Cover', description: 'Professional cover style.' }
  ]

  const renderComponent = (overrideProps = {}) =>
    render(
      <TemplatePreview
        resumeTemplateId="modern"
        resumeTemplateName="Modern"
        resumeTemplateDescription="Modern resume style."
        coverTemplateId="cover_modern"
        coverTemplateName="Modern Cover"
        coverTemplateDescription="Modern cover style."
        availableResumeTemplates={resumeTemplates}
        availableCoverTemplates={coverTemplates}
        onResumeTemplateApply={jest.fn()}
        onCoverTemplateApply={jest.fn()}
        {...overrideProps}
      />
    )

  it('shows a custom resume comparison view when two templates are selected', () => {
    renderComponent()

    fireEvent.click(screen.getByLabelText('Compare Classic CV template'))
    fireEvent.click(screen.getByLabelText('Compare Professional CV template'))

    const comparisonLabels = screen.getAllByText(/Comparison choice/i)
    expect(comparisonLabels).toHaveLength(2)
    const compareGroup = screen.getByRole('group', { name: /Select CV templates to compare/i })
    const compareSection = compareGroup.parentElement
    expect(compareSection).toBeTruthy()
    expect(
      within(compareSection).queryByText(/Select two templates to activate the comparison view/i)
    ).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Use this CV style/i })).toHaveLength(2)
  })

  it('shows a custom cover comparison view when two templates are selected', () => {
    renderComponent()

    fireEvent.click(screen.getByLabelText('Compare Classic Cover cover letter template'))
    fireEvent.click(screen.getByLabelText('Compare Professional Cover cover letter template'))

    const comparisonLabels = screen.getAllByText(/Comparison choice/i)
    expect(comparisonLabels.length).toBeGreaterThanOrEqual(2)
    const compareGroup = screen.getByRole('group', { name: /Select cover letter templates to compare/i })
    const compareSection = compareGroup.parentElement
    expect(compareSection).toBeTruthy()
    expect(
      within(compareSection).queryByText(/Select two templates to activate the comparison view/i)
    ).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Use this cover style/i })).toHaveLength(2)
  })

  it('explains when the cover letter style is independent from the CV', () => {
    renderComponent({ isCoverLinkedToResume: false })

    expect(
      screen.getByText(/Cover letters stay in the Modern Cover even if you swap CV templates/i)
    ).toBeInTheDocument()
  })
})
