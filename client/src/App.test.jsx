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
  render(<App />)
  const file = new File(['dummy'], 'resume.pdf', { type: 'application/pdf' })
  fireEvent.change(
    screen.getByLabelText('Choose File', { selector: 'input', hidden: true }),
    {
      target: { files: [file] }
    }
  )
  fireEvent.change(screen.getByPlaceholderText('Job Description URL'), {
    target: { value: 'https://indeed.com/job' }
  })
  fireEvent.click(screen.getByText('Evaluate me against the JD'))
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  expect(await screen.findByText(/ATS Score: 70%/)).toBeInTheDocument()
  expect(
    await screen.findByText(/Designation: Developer vs Senior Developer/)
  ).toBeInTheDocument()
  expect(await screen.findByText(/Designation mismatch/)).toBeInTheDocument()
  expect(
    await screen.findByPlaceholderText('Revised Designation')
  ).toBeInTheDocument()
  expect(await screen.findByDisplayValue('aws')).toBeInTheDocument()
  fireEvent.click(await screen.findByText('Add Skill'))
  const skillInputs = await screen.findAllByPlaceholderText('Skill')
  expect(skillInputs.length).toBe(2)
})

test('allows file to be dropped in drop zone', async () => {
  fetch.mockClear()
  render(<App />)
  const dropZone = screen.getByTestId('dropzone')
  const file = new File(['dummy'], 'resume.pdf', { type: 'application/pdf' })
  const dropEvent = new Event('drop', { bubbles: true })
  Object.assign(dropEvent, {
    dataTransfer: { files: [file] },
    preventDefault: jest.fn()
  })
  dropZone.dispatchEvent(dropEvent)
  expect(dropEvent.preventDefault).toHaveBeenCalled()
  fireEvent.change(screen.getByPlaceholderText('Job Description URL'), {
    target: { value: 'https://indeed.com/job' }
  })
  fireEvent.click(screen.getByText('Evaluate me against the JD'))
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
})

test('highlights drop zone on drag over', () => {
  render(<App />)
  const dropZone = screen.getByTestId('dropzone')
  const dragOverEvent = new Event('dragover', { bubbles: true })
  dragOverEvent.preventDefault = jest.fn()
  dropZone.dispatchEvent(dragOverEvent)
  expect(dragOverEvent.preventDefault).toHaveBeenCalled()
  expect(dropZone.className).toMatch('border-blue-500')

  const dragLeaveEvent = new Event('dragleave', { bubbles: true })
  dragLeaveEvent.preventDefault = jest.fn()
  dropZone.dispatchEvent(dragLeaveEvent)
  expect(dragLeaveEvent.preventDefault).toHaveBeenCalled()
  expect(dropZone.className).not.toMatch('border-blue-500')
})
