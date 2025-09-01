import { extractCertifications } from '../server.js';

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
});
