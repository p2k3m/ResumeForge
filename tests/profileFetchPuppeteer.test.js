import { jest } from '@jest/globals';

const mockAxiosGet = jest.fn();
const mockLaunch = jest.fn();

jest.unstable_mockModule('axios', () => ({ default: { get: mockAxiosGet } }));
jest.unstable_mockModule('puppeteer', () => ({ default: { launch: mockLaunch } }));

const { fetchLinkedInProfile, fetchCredlyProfile } = await import('../server.js');

describe('fetchLinkedInProfile puppeteer retry', () => {
  const mockPage = { goto: jest.fn(), content: jest.fn() };
  const mockBrowser = { newPage: jest.fn().mockResolvedValue(mockPage), close: jest.fn() };

  beforeEach(() => {
    mockAxiosGet.mockReset();
    mockLaunch.mockReset().mockResolvedValue(mockBrowser);
    mockPage.goto.mockReset();
    mockPage.content.mockReset();
    mockBrowser.newPage.mockReset().mockResolvedValue(mockPage);
    mockBrowser.close.mockReset();
  });

  test('falls back to puppeteer on empty axios response', async () => {
    mockAxiosGet.mockResolvedValueOnce({ data: '' });
    mockPage.content.mockResolvedValueOnce(
      '<section id="experience"><li><h3>Engineer</h3><h4>Acme</h4><span>Jan 2020 - Feb 2021</span></li></section>'
    );
    const profile = await fetchLinkedInProfile('https://linkedin.com/in/example');
    expect(mockLaunch).toHaveBeenCalled();
    expect(profile.experience).toEqual([
      { company: 'Acme', title: 'Engineer', startDate: 'Jan 2020', endDate: 'Feb 2021' }
    ]);
  });

  test('throws on blocked content', async () => {
    mockAxiosGet.mockResolvedValueOnce({ data: 'Access Denied' });
    mockPage.content.mockResolvedValueOnce('Access Denied');
    await expect(
      fetchLinkedInProfile('https://linkedin.com/in/example')
    ).rejects.toThrow('Blocked content');
    expect(mockLaunch).toHaveBeenCalled();
  });
});

describe('fetchCredlyProfile puppeteer retry', () => {
  const mockPage = { goto: jest.fn(), content: jest.fn() };
  const mockBrowser = { newPage: jest.fn().mockResolvedValue(mockPage), close: jest.fn() };

  beforeEach(() => {
    mockAxiosGet.mockReset();
    mockLaunch.mockReset().mockResolvedValue(mockBrowser);
    mockPage.goto.mockReset();
    mockPage.content.mockReset();
    mockBrowser.newPage.mockReset().mockResolvedValue(mockPage);
    mockBrowser.close.mockReset();
  });

  test('falls back to puppeteer on empty axios response', async () => {
    mockAxiosGet.mockResolvedValueOnce({ data: '' });
    mockPage.content.mockResolvedValueOnce(
      '<div class="badge"><a href="https://credly.com/cert"><span class="badge-name">Cert</span></a><span class="issuer-name">Org</span><span class="badge-status">Active</span></div>'
    );
    const certs = await fetchCredlyProfile('https://credly.com/user');
    expect(mockLaunch).toHaveBeenCalled();
    expect(certs).toEqual([
      { name: 'Cert', provider: 'Org', url: 'https://credly.com/cert', source: 'credly' }
    ]);
  });

  test('throws on blocked content', async () => {
    mockAxiosGet.mockResolvedValueOnce({ data: 'Access Denied' });
    mockPage.content.mockResolvedValueOnce('Access Denied');
    await expect(
      fetchCredlyProfile('https://credly.com/user')
    ).rejects.toThrow('Blocked content');
    expect(mockLaunch).toHaveBeenCalled();
  });
});
