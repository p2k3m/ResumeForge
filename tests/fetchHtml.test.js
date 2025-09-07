import { jest } from '@jest/globals';

process.env.PUPPETEER_HEADLESS = 'false';

const mockAxiosGet = jest.fn();
const mockLaunch = jest.fn();

jest.unstable_mockModule('axios', () => ({ default: { get: mockAxiosGet } }));
jest.unstable_mockModule('puppeteer', () => ({ default: { launch: mockLaunch } }));

const { analyzeJobDescription } = await import('../server.js');

describe('fetchHtml blocked content detection', () => {
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

  test('throws on blocked axios content', async () => {
    mockAxiosGet.mockResolvedValueOnce({ data: 'Access Denied' });
    await expect(analyzeJobDescription('http://example.com')).rejects.toThrow('Blocked content');
    expect(mockLaunch).not.toHaveBeenCalled();
  });

  test('throws on blocked puppeteer content', async () => {
    mockAxiosGet.mockResolvedValueOnce({ data: '' });
    mockPage.content.mockResolvedValueOnce('Access Denied');
    await expect(analyzeJobDescription('http://example.com')).rejects.toThrow('Blocked content');
    expect(mockLaunch).toHaveBeenCalled();
  });
});
