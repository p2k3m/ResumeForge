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

  test('normalizes relative badge URLs', async () => {
    const html = `
      <div class="badge">
        <a href="/badges/aws-dev"><span class="badge-name">AWS Certified Developer</span></a>
        <span class="issuer-name">Amazon</span>
        <span class="badge-status">Active</span>
      </div>
    `;
    mockGet.mockResolvedValueOnce({ data: html });
    const certs = await fetchCredlyProfile('http://example.com');
    expect(certs).toEqual([
      {
        name: 'AWS Certified Developer',
        provider: 'Amazon',
        url: 'https://www.credly.com/badges/aws-dev',
        source: 'credly'
      }
    ]);
  });

  test('integrates with ensureRequiredSections to render certification hyperlink and profile link', async () => {
    const html = `
      <div class="badge">
        <a href="https://credly.com/aws-dev"><span class="badge-name">AWS Certified Developer</span></a>
        <span class="issuer-name">Amazon</span>
        <span class="badge-status">Active</span>
      </div>
    `;
    mockGet.mockResolvedValueOnce({ data: html });
    const certs = await fetchCredlyProfile('http://example.com');
    const ensured = ensureRequiredSections(
      { sections: [] },
      {
        credlyCertifications: certs,
        credlyProfileUrl: 'https://credly.com/user'
      }
    );
    const certSection = ensured.sections.find((s) => s.heading === 'Certification');
    expect(certSection).toBeTruthy();
    expect(certSection.items).toHaveLength(2);
    const first = certSection.items[0];
    expect(first[0].type).toBe('bullet');
    expect(first[1]).toMatchObject({
      type: 'link',
      href: 'https://credly.com/aws-dev'
    });
    const text = first[1].text;
    expect(text).toContain('AWS Certified Developer');
    expect(text).toContain('Amazon');
    const profile = certSection.items[1];
    expect(profile[0].type).toBe('bullet');
    expect(profile[1]).toMatchObject({
      type: 'link',
      text: 'Credly Profile',
      href: 'https://credly.com/user'
    });
  });
});
