/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, within } from '@testing-library/react'
import TemplateSelector from '../TemplateSelector.jsx'

describe('TemplateSelector', () => {
  const options = [
    {
      id: 'modern',
      name: 'Modern Minimal',
      description: 'Two-column balance.',
      badge: 'Best for Tech Roles'
    },
    {
      id: 'professional',
      name: 'Professional Blue',
      description: 'Classic layout.',
      badge: 'Best for Sr Managers'
    }
  ]

  it('renders options with previews and reflects the selected template', () => {
    const { rerender } = render(
      <TemplateSelector options={options} selectedTemplate="modern" onSelect={jest.fn()} />
    )

    const group = screen.getByRole('radiogroup', { name: /Template Style/i })
    const modernOption = within(group).getByRole('radio', { name: /Modern Minimal/i })
    expect(modernOption).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('template-selector-preview-modern')).toBeInTheDocument()
    expect(within(modernOption).getByText(/Best for Tech Roles/i)).toBeInTheDocument()
    expect(screen.getByTestId('template-selector-selected-description')).toHaveTextContent(
      /Two-column balance\./i
    )

    rerender(<TemplateSelector options={options} selectedTemplate="professional" onSelect={jest.fn()} />)

    const professionalOption = within(group).getByRole('radio', { name: /Professional Blue/i })
    expect(professionalOption).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('template-selector-selected-description')).toHaveTextContent(
      /Classic layout\./i
    )
  })

  it('invokes onSelect when a template is chosen', () => {
    const handleSelect = jest.fn()
    render(
      <TemplateSelector options={options} selectedTemplate="modern" onSelect={handleSelect} />
    )

    const professionalOption = screen.getByRole('radio', { name: /Professional Blue/i })
    fireEvent.click(professionalOption)

    expect(handleSelect).toHaveBeenCalledWith('professional')
    expect(within(professionalOption).getByText(/Best for Sr Managers/i)).toBeInTheDocument()
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

    const modernOption = screen.getByRole('radio', { name: /Modern Minimal/i })
    expect(modernOption).toBeDisabled()
    fireEvent.click(modernOption)
    expect(handleSelect).not.toHaveBeenCalled()
  })
})
