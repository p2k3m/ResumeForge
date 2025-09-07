import dns from 'dns';
import { validateUrl } from '../server.js';

describe('validateUrl', () => {
  test('allows public IPv4 address', async () => {
    const url = 'http://8.8.8.8';
    expect(await validateUrl(url)).toBe(new URL(url).toString());
  });

  test('allows public IPv6 address', async () => {
    const url = 'http://[2001:4860:4860::8888]';
    expect(await validateUrl(url)).toBe(new URL(url).toString());
  });

  test.each([
    'http://localhost',
    'http://10.0.0.1',
    'http://172.16.0.1',
    'http://192.168.0.1',
    'http://[fd00::1]',
    'http://[::1]'
  ])('blocks private or internal host %s', async (url) => {
    expect(await validateUrl(url)).toBeNull();
  });

  test('blocks domain resolving to private ip', async () => {
    dns.promises.lookup.mockResolvedValueOnce({ address: '127.0.0.1', family: 4 });
    await expect(validateUrl('http://evil.com')).resolves.toBeNull();
  });
});
