import { jest } from '@jest/globals';

const mockGet = jest.fn();

jest.unstable_mockModule('axios', () => ({ default: { get: mockGet } }));

const { fetchLinkedInProfile } = await import('../server.js');

describe('fetchLinkedInProfile error handling', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  test('includes status and message in thrown error', async () => {
    const error = new Error('Request failed');
    error.response = { status: 404 };
    mockGet.mockRejectedValueOnce(error);
    await expect(
      fetchLinkedInProfile('https://linkedin.com/in/example')
    ).rejects.toMatchObject({
      message: 'LinkedIn profile fetch failed: Request failed (status 404)',
      status: 404
    });
  });

  test('returns empty profile on LinkedIn status 999', async () => {
    const error = new Error('Blocked');
    error.response = { status: 999 };
    mockGet.mockRejectedValueOnce(error);
    await expect(
      fetchLinkedInProfile('https://linkedin.com/in/example')
    ).resolves.toEqual({
      headline: '',
      experience: [],
      education: [],
      skills: [],
      certifications: []
    });
  });
});
