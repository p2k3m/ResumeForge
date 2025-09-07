import { jest } from '@jest/globals';

const mockGet = jest.fn();
const mockLaunch = jest.fn();

jest.unstable_mockModule('axios', () => ({ default: { get: mockGet } }));
jest.unstable_mockModule('puppeteer', () => ({ default: { launch: mockLaunch } }));

const { fetchLinkedInProfile } = await import('../server.js');

describe('fetchLinkedInProfile error handling', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockLaunch.mockReset();
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
    const mockPage = { goto: jest.fn(), content: jest.fn().mockResolvedValue('Access Denied') };
    const mockBrowser = { newPage: jest.fn().mockResolvedValue(mockPage), close: jest.fn() };
    mockLaunch.mockResolvedValueOnce(mockBrowser);
    await expect(
      fetchLinkedInProfile('https://linkedin.com/in/example')
    ).resolves.toEqual({
      headline: '',
      experience: [],
      education: [],
      skills: [],
      certifications: [],
      languages: []
    });
  });
});
