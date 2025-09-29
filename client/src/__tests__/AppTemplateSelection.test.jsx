/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, within } from '@testing-library/react'
import TemplateSelector from '../components/TemplateSelector.jsx'

describe('TemplateSelector', () => {
  const options = [
    { id: 'modern', name: 'Modern Minimal', description: 'Minimal layout with ATS-safe spacing.' },
    { id: 'professional', name: 'Professional Blue', description: 'Conservative layout with blue dividers.' }
  ]

  it('highlights the selected template and updates when a new template is chosen', () => {
    const handleSelect = jest.fn()
    render(
      <TemplateSelector
        options={options}
        selectedTemplate="modern"
        onSelect={handleSelect}
      />
    )

    const modernButton = screen.getByRole('button', { name: /Modern Minimal/i })
    expect(within(modernButton).getByText(/Selected/i)).toBeInTheDocument()

    const professionalButton = screen.getByRole('button', { name: /Professional Blue/i })
    expect(within(professionalButton).queryByText(/Selected/i)).toBeNull()

    fireEvent.click(professionalButton)
    expect(handleSelect).toHaveBeenCalledWith('professional')
  })
})
