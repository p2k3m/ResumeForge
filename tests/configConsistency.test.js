import { jest } from '@jest/globals';

// Ensure known environment value before modules load
process.env.PUPPETEER_HEADLESS = 'false';

const mockAxiosGet = jest.fn();
const mockLaunch = jest.fn();

jest.unstable_mockModule('axios', () => ({ default: { get: mockAxiosGet } }));
jest.unstable_mockModule('puppeteer', () => ({ default: { launch: mockLaunch } }));

const { PUPPETEER_HEADLESS } = await import('../config/puppeteer.js');
const serverModule = await import('../server.js');
const { BLOCKED_PATTERNS } = serverModule;
const { fetchJobDescription } = await import('../routes/processCv.js');

describe('shared configuration values', () => {
  const mockPage = {
    setUserAgent: jest.fn(),
    goto: jest.fn(),
    content: jest.fn().mockResolvedValue('<html>dynamic</html>')
  };
  const mockBrowser = {
    newPage: jest.fn().mockResolvedValue(mockPage),
    close: jest.fn()
  };

  beforeEach(() => {
    mockAxiosGet.mockReset();
    mockLaunch.mockReset();
    mockPage.setUserAgent.mockReset();
    mockPage.goto.mockReset();
    mockPage.content.mockReset().mockResolvedValue('<html>dynamic</html>');
    mockBrowser.newPage.mockReset().mockResolvedValue(mockPage);
    mockBrowser.close.mockReset();
    mockLaunch.mockResolvedValue(mockBrowser);
  });

  test('fetchJobDescription uses exported PUPPETEER_HEADLESS', async () => {
    mockAxiosGet.mockResolvedValueOnce({ data: '' });
    await fetchJobDescription('http://example.com');
    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ headless: PUPPETEER_HEADLESS })
    );
  });

  test('fetchJobDescription honors shared BLOCKED_PATTERNS', async () => {
    mockAxiosGet.mockResolvedValueOnce({ data: 'Access Denied' });
    await fetchJobDescription('http://example.com');
    expect(mockLaunch).toHaveBeenCalled();
    expect(BLOCKED_PATTERNS.some((re) => re.test('Access Denied'))).toBe(true);
  });
});
