/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import TemplateSelector from '../components/TemplateSelector.jsx'

describe('TemplateSelector', () => {
  const options = [
    { id: 'modern', name: 'Modern Minimal', description: 'Minimal layout with ATS-safe spacing.' },
    {
      id: 'professional',
      name: 'Professional Blue',
      description: 'Conservative layout with blue dividers.'
    }
  ]

  it('reflects the selected template and updates when a new template is chosen', () => {
    const handleSelect = jest.fn()
    render(<TemplateSelector options={options} selectedTemplate="modern" onSelect={handleSelect} />)

    const dropdown = screen.getByRole('combobox', { name: /Template Style/i })
    expect(dropdown).toHaveValue('modern')
    expect(screen.getByTestId('template-selector-selected-description')).toHaveTextContent(
      /Minimal layout with ATS-safe spacing\./i
    )

    fireEvent.change(dropdown, { target: { value: 'professional' } })
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
