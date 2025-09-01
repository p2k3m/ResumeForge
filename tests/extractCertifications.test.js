import { extractCertifications, ensureRequiredSections } from '../server.js';

describe('extractCertifications', () => {
  test('parses certification line with provider and credly link', () => {
    const text = `Certifications\n- AWS Certified Developer (Amazon) https://www.credly.com/badges/abc`;
    const certs = extractCertifications(text);
    expect(certs).toEqual([
      {
        name: 'AWS Certified Developer',
        provider: 'Amazon',
        url: 'https://www.credly.com/badges/abc'
      }
    ]);
  });

  test('detects credly link outside certification section', () => {
    const text = `- AWS Certified Developer (Amazon) https://www.credly.com/badges/abc`;
    const certs = extractCertifications(text);
    expect(certs).toEqual([
      {
        name: 'AWS Certified Developer',
        provider: 'Amazon',
        url: 'https://www.credly.com/badges/abc'
      }
    ]);
  });

  test('parses LinkedIn style objects', () => {
    const src = [
      {
        name: 'PMP',
        provider: 'PMI',
        url: 'https://example.com/pmp'
      },
      {
        certificateName: 'CKA',
        issuingOrganization: 'CNCF',
        credentialUrl: 'https://www.credly.com/cka'
      }
    ];
    const certs = extractCertifications(src);
    expect(certs).toEqual([
      {
        name: 'PMP',
        provider: 'PMI',
        url: 'https://example.com/pmp'
      },
      {
        name: 'CKA',
        provider: 'CNCF',
        url: 'https://www.credly.com/cka'
      }
    ]);
  });

  test('omits certification heading when no certifications are present', () => {
    const text = `No credentials listed here.`;
    const certs = extractCertifications(text);
    expect(certs).toEqual([]);
    const ensured = ensureRequiredSections(
      { sections: [{ heading: 'Certification', items: [] }] },
      { resumeCertifications: certs }
    );
    const certSection = ensured.sections.find(
      (s) => s.heading === 'Certification'
    );
    expect(certSection).toBeUndefined();
  });

  test('deduplicates certifications by name and provider before rendering', () => {
    const resumeCertifications = [
      {
        name: 'AWS Certified Developer',
        provider: 'Amazon',
        url: 'https://www.credly.com/badges/abc'
      },
      {
        name: 'AWS Certified Developer',
        provider: 'Amazon',
        url: 'https://example.com/other'
      }
    ];
    const ensured = ensureRequiredSections(
      { sections: [] },
      { resumeCertifications }
    );
    const certSection = ensured.sections.find(
      (s) => s.heading === 'Certification'
    );
    expect(certSection).toBeTruthy();
    expect(certSection.items).toHaveLength(1);
    const link = certSection.items[0].find((t) => t.type === 'link');
    expect(link).toMatchObject({
      text: 'AWS Certified Developer',
      href: 'https://www.credly.com/badges/abc'
    });
  });

  test('consolidates training headings and links certificate names to their URLs', () => {
    const resumeCertifications = [
      {
        name: 'PMP',
        provider: 'PMI',
        url: 'https://www.credly.com/pmp'
      },
      {
        name: 'CKA',
        provider: 'CNCF',
        url: 'https://www.credly.com/cka'
      }
    ];
    const data = {
      sections: [
        { heading: 'Trainings', items: [] },
        { heading: 'Certifications', items: [] }
      ]
    };
    const ensured = ensureRequiredSections(data, { resumeCertifications });
    const certSections = ensured.sections.filter(
      (s) => s.heading === 'Certification'
    );
    expect(certSections).toHaveLength(1);
    const items = certSections[0].items;
    expect(items).toHaveLength(2);
    items.forEach((tokens, idx) => {
      const link = tokens.find((t) => t.type === 'link');
      expect(link).toMatchObject({
        text: resumeCertifications[idx].name,
        href: resumeCertifications[idx].url
      });
    });
  });
});
