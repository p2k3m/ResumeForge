/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from './App.jsx'

const mockResponse = {
  atsScore: 70,
  jobTitle: 'Senior Developer',
  originalTitle: 'Developer',
  designationMatch: false,
  missingSkills: ['aws']
}

global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    headers: { get: () => 'application/json' },
    json: () => Promise.resolve(mockResponse)
  })
)

test('evaluates CV and displays results', async () => {
  window.alert = jest.fn()
  render(<App />)
  const file = new File(['dummy'], 'resume.pdf', { type: 'application/pdf' })
  fireEvent.change(screen.getByLabelText('Choose File'), {
    target: { files: [file] }
  })
  fireEvent.change(screen.getByPlaceholderText('Job Description URL'), {
    target: { value: 'https://indeed.com/job' }
  })
  fireEvent.click(screen.getByText('Evaluate me against the JD'))
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  expect(window.alert).toHaveBeenCalled()
  expect(await screen.findByText(/ATS Score: 70%/)).toBeInTheDocument()
  expect(
    await screen.findByText(/Designation: Developer vs Senior Developer/)
  ).toBeInTheDocument()
  expect(
    await screen.findByPlaceholderText('Revised Designation')
  ).toBeInTheDocument()
  expect(await screen.findByText(/Missing skills: aws/)).toBeInTheDocument()
})
