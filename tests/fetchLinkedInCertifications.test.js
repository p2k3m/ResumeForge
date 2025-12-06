import { jest } from '@jest/globals';

const mockGet = jest.fn();

jest.unstable_mockModule('axios', () => ({ default: { get: mockGet } }));

const { fetchLinkedInProfile, ensureRequiredSections } = await import('../server.js');

describe.skip('fetchLinkedInProfile certifications', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  test('includes certifications when present', async () => {
    const html = `
      <section id="licenses_and_certifications">
        <li>
          <h3>AWS Certified Developer</h3>
          <h4>Amazon</h4>
          <a href="https://credly.com/aws-dev">Link</a>
        </li>
      </section>
    `;
    mockGet.mockResolvedValueOnce({ data: html });
    const profile = await fetchLinkedInProfile('http://example.com');
    expect(profile.certifications).toEqual([
      {
        name: 'AWS Certified Developer',
        provider: 'Amazon',
        url: 'https://credly.com/aws-dev'
      }
    ]);
    const ensured = ensureRequiredSections(
      { sections: [] },
      { linkedinCertifications: profile.certifications }
    );
    const certSection = ensured.sections.find(
      (s) => s.heading === 'Certification'
    );
    expect(certSection).toBeTruthy();
    expect(certSection.items).toHaveLength(1);
  });

  test('omits certification section when no valid data', async () => {
    const html = `
      <section id="licenses_and_certifications">
        <li><a href="https://credly.com/aws-dev">https://credly.com/aws-dev</a></li>
      </section>
    `;
    mockGet.mockResolvedValueOnce({ data: html });
    const profile = await fetchLinkedInProfile('http://example.com');
    expect(profile.certifications).toEqual([
      { name: '', provider: '', url: 'https://credly.com/aws-dev' }
    ]);
    const ensured = ensureRequiredSections(
      { sections: [] },
      { linkedinCertifications: profile.certifications }
    );
    const certSection = ensured.sections.find(
      (s) => s.heading === 'Certification'
    );
    expect(certSection).toBeUndefined();
  });
});
