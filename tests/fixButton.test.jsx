/** @jest-environment jsdom */
import { jest } from '@jest/globals'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from '../client/src/App.jsx'

test('clicking Fix fetches suggestion', async () => {
  const evaluationResponse = {
    atsScore: 50,
    atsMetrics: { impact: 60 },
    jobTitle: 'Dev',
    originalTitle: 'Dev',
    designationMatch: true,
    missingSkills: [],
    missingExperience: [],
    missingEducation: [],
    missingCertifications: [],
    missingLanguages: []
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

  render(<App />)
  const file = new File(['resume'], 'resume.pdf', { type: 'application/pdf' })
  const fileInput = screen.getByLabelText('Choose File')
  await waitFor(() =>
    fireEvent.change(fileInput, { target: { files: [file] } })
  )
  fireEvent.change(
    screen.getByPlaceholderText('Job Description URL'),
    { target: { value: 'https://example.com/job' } }
  )
  fireEvent.change(
    screen.getByPlaceholderText('LinkedIn Profile URL'),
    { target: { value: 'https://linkedin.com/in/test' } }
  )
  fireEvent.click(screen.getByText('Evaluate me against the JD'))
  const fixBtn = await screen.findByText('Fix')
  fireEvent.click(fixBtn)
  await screen.findByText('Use action verbs.')
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining('/api/fix-metric'),
    expect.any(Object)
  )
})
