/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import App from './App.jsx'

const mockResponse = {
  jobId: '1',
  scores: {
    ats: 70,
    overallScore: 70,
    metrics: {
      layoutSearchability: 50,
      atsReadability: 60,
      impact: 80,
      crispness: 90,
      keywordDensity: 40,
      sectionHeadingClarity: 100,
      contactInfoCompleteness: 30,
      grammar: 70
    }
  },
  seniority: 'mid',
  keywords: { mustHave: ['aws'], niceToHave: [] },
  tips: {},
  selectionProbability: 70,
  issues: {}
}

global.fetch = jest.fn()

beforeEach(() => {
  fetch.mockReset()
})

test('renders job URL and description inputs; one is required', () => {
  render(<App />)
  // both inputs present
  expect(screen.getByPlaceholderText('Job Description URL')).toBeInTheDocument()
  expect(screen.getByPlaceholderText('Job Description Text')).toBeInTheDocument()

  const submit = screen.getByText('Evaluate me against the JD')
  // add CV file to enable validation on job fields
  const file = new File(['dummy'], 'resume.pdf', { type: 'application/pdf' })
  fireEvent.change(
    screen.getByLabelText('Choose File', { selector: 'input', hidden: true }),
    { target: { files: [file] } }
  )

  // Initially disabled since no JD fields filled
  expect(submit).toBeDisabled()

  // Filling job description text enables submission
  fireEvent.change(screen.getByPlaceholderText('Job Description Text'), {
    target: { value: 'Some description' },
  })
  expect(submit).not.toBeDisabled()

  // Clearing text and entering URL also enables submission
  fireEvent.change(screen.getByPlaceholderText('Job Description Text'), {
    target: { value: '' },
  })
  expect(submit).toBeDisabled()
  fireEvent.change(screen.getByPlaceholderText('Job Description URL'), {
    target: { value: 'https://example.com/job' },
  })
  expect(submit).not.toBeDisabled()
})

test('evaluates CV and displays results', async () => {
  fetch.mockResolvedValueOnce({
    ok: true,
    headers: { get: () => 'application/json' },
    json: () => Promise.resolve(mockResponse)
  })
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
  expect(await screen.findByText('TEST RESULTS ARE READY')).toBeInTheDocument()
  expect(
    await screen.findByText('Your score is 30 points less than top resumes.')
  ).toBeInTheDocument()
  expect(
    await screen.findByText(/Layout Searchability: 50% \(Average\)/)
  ).toBeInTheDocument()
  expect(
    await screen.findByText(/Crispness: 90% \(Excellent\)/)
  ).toBeInTheDocument()
  expect(
    await screen.findByText('Include email and phone.')
  ).toBeInTheDocument()
  expect(await screen.findByText('Must-have')).toBeInTheDocument()
  expect(await screen.findByText('aws')).toBeInTheDocument()
})

test('updates file label on selection', () => {
  render(<App />)
  expect(screen.getByText('Browse... No file selected.')).toBeInTheDocument()
  const file = new File(['dummy'], 'resume.pdf', { type: 'application/pdf' })
  fireEvent.change(
    screen.getByLabelText('Choose File', { selector: 'input', hidden: true }),
    {
      target: { files: [file] }
    }
  )
  expect(screen.getByText('Browse... resume.pdf')).toBeInTheDocument()
})

test('allows file to be dropped in drop zone', async () => {
  fetch.mockResolvedValueOnce({
    ok: true,
    headers: { get: () => 'application/json' },
    json: () => Promise.resolve(mockResponse)
  })
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

test('shows macro warning when macroWarning flag is true', async () => {
  fetch.mockResolvedValueOnce({
    ok: true,
    headers: { get: () => 'application/json' },
    json: () => Promise.resolve({ ...mockResponse, macroWarning: true })
  })
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
  expect(
    await screen.findByText('Warning: macros detected in your document.')
  ).toBeInTheDocument()
})

test('shows category tip and fetches category fix suggestion', async () => {
  fetch
    .mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve(mockResponse)
    })
    .mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve({ suggestion: 'Improve layout' })
    })

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

  const layoutCategory = await screen.findByText('Layout')
  const categoryContainer = layoutCategory.closest('div')
  const fixLink = within(categoryContainer).getByText('Click to FIX')
  fireEvent.click(fixLink)
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
  expect(await screen.findByText('Improve layout')).toBeInTheDocument()
})

test('displays new additions section after compile', async () => {
  fetch
    .mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve(mockResponse),
    })
    .mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: () =>
        Promise.resolve({
          existingCvKey: 'key.pdf',
          cvTextKey: 'key.txt',
          addedProjects: ['Project Alpha'],
          addedCertifications: ['AWS Cert - Amazon'],
        }),
    })
    .mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: () =>
        Promise.resolve({
          cvUrl: 'cv.pdf',
          coverLetterUrl: '',
          atsScore: 80,
          improvement: 10,
          addedSkills: ['aws', 'python'],
          designation: 'Senior Developer',
        }),
    })

  render(<App />)

  const file = new File(['dummy'], 'resume.pdf', { type: 'application/pdf' })
  fireEvent.change(
    screen.getByLabelText('Choose File', { selector: 'input', hidden: true }),
    {
      target: { files: [file] },
    }
  )
  fireEvent.change(screen.getByPlaceholderText('Job Description URL'), {
    target: { value: 'https://indeed.com/job' },
  })
  fireEvent.click(screen.getByText('Evaluate me against the JD'))
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))

  fireEvent.click(
    await screen.findByText('Improve Score (Generate Tailored CV + Cover Letter)')
  )
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))
  expect(
    await screen.findByText('New Additions for Interview Prep')
  ).toBeInTheDocument()
  expect(await screen.findByText('aws')).toBeInTheDocument()
  expect(await screen.findByText('python')).toBeInTheDocument()
  expect(await screen.findByText('Senior Developer')).toBeInTheDocument()
  expect(await screen.findByText('Project Alpha')).toBeInTheDocument()
  expect(await screen.findByText('AWS Cert - Amazon')).toBeInTheDocument()
})

test('shows error when LinkedIn authentication is required', async () => {
  fetch.mockResolvedValueOnce({
    status: 403,
    ok: false,
    headers: { get: () => 'application/json' },
    json: () => Promise.resolve({ code: 'LINKEDIN_AUTH_REQUIRED' }),
  })
  render(<App />)
  const file = new File(['dummy'], 'resume.pdf', { type: 'application/pdf' })
  fireEvent.change(
    screen.getByLabelText('Choose File', { selector: 'input', hidden: true }),
    {
      target: { files: [file] },
    }
  )
  fireEvent.change(screen.getByPlaceholderText('Job Description URL'), {
    target: { value: 'https://linkedin.com/job' },
  })
  fireEvent.click(screen.getByText('Evaluate me against the JD'))
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  expect(
    await screen.findByText(
      'Job URL requires authentication. Please paste the job description text.'
    )
  ).toBeInTheDocument()
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

test('shows curated resource link for known skill', async () => {
  fetch
    .mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve(mockResponse),
    })
    .mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve({ existingCvKey: 'key.pdf', cvTextKey: 'key.txt' }),
    })
    .mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: () =>
        Promise.resolve({
          cvUrl: 'cv.pdf',
          coverLetterUrl: '',
          atsScore: 80,
          improvement: 10,
          addedSkills: ['aws', 'python'],
          designation: 'Senior Developer',
        }),
    })

  render(<App />)

  const file = new File(['dummy'], 'resume.pdf', { type: 'application/pdf' })
  fireEvent.change(
    screen.getByLabelText('Choose File', { selector: 'input', hidden: true }),
    {
      target: { files: [file] },
    }
  )
  fireEvent.change(screen.getByPlaceholderText('Job Description URL'), {
    target: { value: 'https://indeed.com/job' },
  })
  fireEvent.click(screen.getByText('Evaluate me against the JD'))
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))

  fireEvent.click(
    await screen.findByText('Improve Score (Generate Tailored CV + Cover Letter)')
  )
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))

  const link = await screen.findByText('AWS Training')
  expect(link).toHaveAttribute('href', 'https://aws.amazon.com/training/')
  const pyLink = await screen.findByText('Python Official Tutorial')
  expect(pyLink).toHaveAttribute(
    'href',
    'https://docs.python.org/3/tutorial/'
  )
})
