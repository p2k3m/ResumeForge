/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, within } from '@testing-library/react'
import TemplateSelector from '../components/TemplateSelector.jsx'

describe('TemplateSelector', () => {
  const options = [
    {
      id: 'modern',
      name: 'Modern Minimal',
      description: 'Minimal layout with ATS-safe spacing.',
      badge: 'Best for Tech Roles'
    },
    {
      id: 'professional',
      name: 'Professional Blue',
      description: 'Conservative layout with blue dividers.',
      badge: 'Best for Sr Managers'
    }
  ]

  it('reflects the selected template and updates when a new template is chosen', () => {
    const handleSelect = jest.fn()
    render(<TemplateSelector options={options} selectedTemplate="modern" onSelect={handleSelect} />)

    const group = screen.getByRole('radiogroup', { name: /Template Style/i })
    const modernOption = within(group).getByRole('radio', { name: /Modern Minimal/i })
    expect(modernOption).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('template-selector-selected-description')).toHaveTextContent(
      /Minimal layout with ATS-safe spacing\./i
    )

    const professionalOption = within(group).getByRole('radio', { name: /Professional Blue/i })
    fireEvent.click(professionalOption)
    expect(handleSelect).toHaveBeenCalledWith('professional')
  })

  it('shows a history summary when provided', () => {
    render(
      <TemplateSelector
        options={options}
        selectedTemplate="modern"
        historySummary="Professional, Modern, and Classic"
      />
    )

    expect(screen.getByText(/You tried Professional, Modern, and Classic/i)).toBeInTheDocument()
  })
})
