/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, within } from '@testing-library/react'
import TemplateSelector from '../TemplateSelector.jsx'

describe('TemplateSelector', () => {
  const options = [
    { id: 'modern', name: 'Modern Minimal', description: 'Two-column balance.' },
    { id: 'professional', name: 'Professional Blue', description: 'Classic layout.' }
  ]

  it('renders options and highlights the selected template', () => {
    const { rerender } = render(
      <TemplateSelector
        options={options}
        selectedTemplate="modern"
        onSelect={jest.fn()}
      />
    )

    const selectedBadge = within(screen.getByTestId('template-option-modern')).getByText(/selected/i)
    expect(selectedBadge).toBeInTheDocument()
    expect(
      within(screen.getByTestId('template-option-professional')).queryByText(/selected/i)
    ).not.toBeInTheDocument()

    rerender(
      <TemplateSelector
        options={options}
        selectedTemplate="professional"
        onSelect={jest.fn()}
      />
    )

    const newlySelectedBadge = within(screen.getByTestId('template-option-professional')).getByText(/selected/i)
    expect(newlySelectedBadge).toBeInTheDocument()
  })

  it('invokes onSelect when a template is chosen', () => {
    const handleSelect = jest.fn()
    render(
      <TemplateSelector
        options={options}
        selectedTemplate="modern"
        onSelect={handleSelect}
      />
    )

    const optionButton = screen.getByTestId('template-option-professional')
    fireEvent.click(optionButton)

    expect(handleSelect).toHaveBeenCalledWith('professional')
  })

  it('respects the disabled state', () => {
    const handleSelect = jest.fn()
    render(
      <TemplateSelector
        options={options}
        selectedTemplate="modern"
        onSelect={handleSelect}
        disabled
      />
    )

    const optionButton = screen.getByTestId('template-option-professional')
    expect(optionButton).toBeDisabled()
    fireEvent.click(optionButton)
    expect(handleSelect).not.toHaveBeenCalled()
  })
})
