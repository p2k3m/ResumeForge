/** @jest-environment jsdom */
import { jest } from '@jest/globals'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from '../client/src/App.jsx'

test('Fix buttons work in each metric category', async () => {
  const evaluationResponse = {
    jobId: '1',
    scores: { ats: 50, metrics: { impact: 60, keywordDensity: 40 } },
    seniority: 'mid',
    keywords: { mustHave: [], niceToHave: [] },
    tips: {},
    selectionProbability: 50,
    issues: {}
  }
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => evaluationResponse
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ suggestion: 'Use action verbs.' })
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ suggestion: 'Repeat keywords naturally.' })
    })

  render(<App />)
  const file = new File(['resume'], 'resume.pdf', { type: 'application/pdf' })
  const fileInput = screen.getByLabelText('Choose File')
  await waitFor(() => fireEvent.change(fileInput, { target: { files: [file] } }))
  fireEvent.change(
    screen.getByPlaceholderText('Job Description URL'),
    { target: { value: 'https://example.com/job' } }
  )
  fireEvent.click(screen.getByText('Evaluate me against the JD'))

  expect(await screen.findByText('ATS Breakdown')).toBeInTheDocument()
  expect(await screen.findByText('Other Quality Metrics')).toBeInTheDocument()

  const fixButtons = await screen.findAllByText('Fix')
  expect(fixButtons.length).toBe(2)

  fireEvent.click(fixButtons[0])
  await screen.findByText('Use action verbs.')
  fireEvent.click(fixButtons[1])
  await screen.findByText('Repeat keywords naturally.')

  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining('/api/fix-metric'),
    expect.any(Object)
  )
})
