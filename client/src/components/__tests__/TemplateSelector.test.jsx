/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import TemplateSelector from '../TemplateSelector.jsx'

describe('TemplateSelector', () => {
  const options = [
    { id: 'modern', name: 'Modern Minimal', description: 'Two-column balance.' },
    { id: 'professional', name: 'Professional Blue', description: 'Classic layout.' }
  ]

  it('renders options and reflects the selected template', () => {
    const { rerender } = render(
      <TemplateSelector options={options} selectedTemplate="modern" onSelect={jest.fn()} />
    )

    const select = screen.getByRole('combobox', { name: /Template Style/i })
    expect(select).toHaveValue('modern')
    expect(screen.getByTestId('template-selector-selected-description')).toHaveTextContent(
      /Two-column balance\./i
    )

    rerender(<TemplateSelector options={options} selectedTemplate="professional" onSelect={jest.fn()} />)

    expect(select).toHaveValue('professional')
    expect(screen.getByTestId('template-selector-selected-description')).toHaveTextContent(
      /Classic layout\./i
    )
  })

  it('invokes onSelect when a template is chosen', () => {
    const handleSelect = jest.fn()
    render(
      <TemplateSelector options={options} selectedTemplate="modern" onSelect={handleSelect} />
    )

    const select = screen.getByRole('combobox', { name: /Template Style/i })
    fireEvent.change(select, { target: { value: 'professional' } })

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

    const select = screen.getByRole('combobox', { name: /Template Style/i })
    expect(select).toBeDisabled()
    fireEvent.change(select, { target: { value: 'professional' } })
    expect(handleSelect).not.toHaveBeenCalled()
  })
})
