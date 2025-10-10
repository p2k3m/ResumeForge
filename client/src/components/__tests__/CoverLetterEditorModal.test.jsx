/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'

import CoverLetterEditorModal from '../CoverLetterEditorModal.jsx'

describe('CoverLetterEditorModal template styling', () => {
  const defaultProps = {
    isOpen: true,
    label: 'Cover letter',
    draftText: '',
    originalText: '',
    onClose: () => {},
    onChange: () => {},
    onReset: () => {},
    onCopy: () => {},
    onDownload: () => {}
  }

  it('applies header and footer classes for the selected template', () => {
    render(
      <CoverLetterEditorModal
        {...defaultProps}
        coverTemplateId="cover_classic"
        coverTemplateName="Classic Cover Letter"
      />
    )

    const header = screen.getByRole('heading', { name: 'Cover letter' }).closest('header')
    expect(header).toHaveClass('from-amber-700')

    const footer = screen.getByRole('button', { name: 'Reset to original' }).closest('footer')
    expect(footer).toHaveClass('bg-amber-100')
  })

  it('falls back to default styling when template is unknown', () => {
    render(
      <CoverLetterEditorModal
        {...defaultProps}
        coverTemplateId="cover_unknown"
      />
    )

    const header = screen.getByRole('heading', { name: 'Cover letter' }).closest('header')
    expect(header).toHaveClass('from-slate-700')
  })
})
