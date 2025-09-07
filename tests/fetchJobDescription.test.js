import { jest } from '@jest/globals';

const mockAxiosGet = jest.fn();
const mockLaunch = jest.fn();

jest.unstable_mockModule('axios', () => ({ default: { get: mockAxiosGet } }));
jest.unstable_mockModule('puppeteer', () => ({ default: { launch: mockLaunch } }));

const { fetchJobDescription } = await import('../routes/processCv.js');

describe('fetchJobDescription', () => {
  const mockPage = {
    setUserAgent: jest.fn(),
    goto: jest.fn(),
    content: jest.fn().mockResolvedValue('<html>dynamic</html>'),
  };
  const mockBrowser = {
    newPage: jest.fn().mockResolvedValue(mockPage),
    close: jest.fn(),
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

  test('returns axios content when available', async () => {
    mockAxiosGet.mockResolvedValueOnce({ data: '<html>static</html>' });
    const html = await fetchJobDescription('http://example.com', {
      timeout: 1000,
      userAgent: 'agent',
    });
    expect(html).toBe('<html>static</html>');
    expect(mockLaunch).not.toHaveBeenCalled();
  });

  test('falls back to puppeteer on empty axios content', async () => {
    mockAxiosGet.mockResolvedValueOnce({ data: '' });
    const html = await fetchJobDescription('http://example.com', {
      timeout: 1000,
      userAgent: 'agent',
    });
    expect(mockLaunch).toHaveBeenCalled();
    expect(html).toBe('<html>dynamic</html>');
    expect(mockPage.setUserAgent).toHaveBeenCalledWith('agent');
    expect(mockPage.goto).toHaveBeenCalledWith('http://example.com', {
      timeout: 1000,
      waitUntil: 'networkidle2',
    });
  });

  test('falls back to puppeteer on blocked axios content', async () => {
    mockAxiosGet.mockResolvedValueOnce({ data: 'Access Denied' });
    const html = await fetchJobDescription('http://example.com', {
      timeout: 1000,
      userAgent: 'agent',
    });
    expect(mockLaunch).toHaveBeenCalled();
    expect(html).toBe('<html>dynamic</html>');
  });

  test('rejects invalid URL', async () => {
    await expect(fetchJobDescription('http:/bad')).rejects.toThrow('Invalid URL');
    expect(mockAxiosGet).not.toHaveBeenCalled();
    expect(mockLaunch).not.toHaveBeenCalled();
  });

  test('rejects private IP URL', async () => {
    await expect(fetchJobDescription('http://127.0.0.1')).rejects.toThrow('Invalid URL');
    expect(mockAxiosGet).not.toHaveBeenCalled();
    expect(mockLaunch).not.toHaveBeenCalled();
  });
});
