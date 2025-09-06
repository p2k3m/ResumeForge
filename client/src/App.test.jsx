/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App.jsx';

global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    headers: { get: () => 'application/json' },
    json: () =>
      Promise.resolve({
        urls: [],
        table: [],
        addedSkills: [],
        missingSkills: [],
        originalScore: 40,
        enhancedScore: 60,
        metrics: [],
        iteration: 0,
        bestCvKey: 'key1',
      }),
  })
);

test('triggers multiple improvement cycles', async () => {
  render(<App />);
  const file = new File(['dummy'], 'resume.pdf', { type: 'application/pdf' });
  fireEvent.change(screen.getByPlaceholderText('LinkedIn Profile URL'), {
    target: { value: 'https://linkedin.com/in/example' },
  });
  fireEvent.change(screen.getByPlaceholderText('Job Description URL'), {
    target: { value: 'https://indeed.com/job' },
  });
  fireEvent.change(screen.getByLabelText('Choose File'), { target: { files: [file] } });
  fireEvent.click(screen.getByText('Enhance CV'));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

  fetch.mockResolvedValueOnce({
    ok: true,
    headers: { get: () => 'application/json' },
    json: () =>
      Promise.resolve({
        urls: [],
        table: [],
        addedSkills: [],
        missingSkills: [],
        originalScore: 60,
        enhancedScore: 70,
        metrics: [],
        iteration: 1,
        bestCvKey: 'key2',
      }),
  });
  fireEvent.click(screen.getByText('Refine CV'));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(screen.getAllByText(/Skill Match Score/).length).toBe(2);
});
