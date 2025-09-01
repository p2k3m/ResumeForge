import { jest } from '@jest/globals';

const mockGet = jest.fn();

jest.unstable_mockModule('axios', () => ({ default: { get: mockGet } }));

const { fetchCredlyProfile, ensureRequiredSections } = await import('../server.js');

describe('fetchCredlyProfile', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  test('parses active badges only', async () => {
    const html = `
      <div class="badge">
        <a href="https://credly.com/aws-dev"><span class="badge-name">AWS Certified Developer</span></a>
        <span class="issuer-name">Amazon</span>
        <span class="badge-status">Active</span>
      </div>
      <div class="badge">
        <a href="https://credly.com/expired"><span class="badge-name">Old Cert</span></a>
        <span class="issuer-name">Old Org</span>
        <span class="badge-status">Expired</span>
      </div>
    `;
    mockGet.mockResolvedValueOnce({ data: html });
    const certs = await fetchCredlyProfile('http://example.com');
    expect(certs).toEqual([
      {
        name: 'AWS Certified Developer',
        provider: 'Amazon',
        url: 'https://credly.com/aws-dev',
        source: 'credly'
      }
    ]);
  });

  test('integrates with ensureRequiredSections to render certification details', async () => {
    const html = `
      <div class="badge">
        <a href="https://credly.com/aws-dev"><span class="badge-name">AWS Certified Developer</span></a>
        <span class="issuer-name">Amazon</span>
        <span class="badge-status">Active</span>
      </div>
    `;
    mockGet.mockResolvedValueOnce({ data: html });
    const certs = await fetchCredlyProfile('http://example.com');
    const ensured = ensureRequiredSections({ sections: [] }, { credlyCertifications: certs });
    const certSection = ensured.sections.find((s) => s.heading === 'Certification');
    expect(certSection).toBeTruthy();
    const first = certSection.items[0];
    const text = first.filter((t) => t.text).map((t) => t.text).join(' ');
    expect(text).toContain('AWS Certified Developer');
    expect(text).toContain('Amazon');
    const link = first.find((t) => t.type === 'link');
    expect(link?.href).toBe('https://credly.com/aws-dev');
  });
});
