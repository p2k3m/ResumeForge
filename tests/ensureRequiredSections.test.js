import { ensureRequiredSections, parseLine } from '../server.js';

describe('ensureRequiredSections work experience merging', () => {
  test('appends missing roles and sorts chronologically', () => {
    const existingToken = parseLine('- Engineer at Acme (2020 – 2021)');
    const data = { sections: [{ heading: 'Work Experience', items: [existingToken] }] };
    const resumeExperience = [
      { company: 'Beta', title: 'Developer', startDate: '2019', endDate: '2020' }
    ];
    const ensured = ensureRequiredSections(data, { resumeExperience });
    const items = ensured.sections[0].items;
    expect(items).toHaveLength(2);
    const lines = items.map((tokens) =>
      tokens.map((t) => t.text || '').join('').trim()
    );
    expect(lines[0]).toBe('Engineer at Acme (2020 – 2021)');
    expect(lines[1]).toBe('Developer at Beta (2019 – 2020)');
  });

  test('does not duplicate existing roles', () => {
    const existingToken = parseLine('- Engineer at Acme (2020 – 2021)');
    const data = { sections: [{ heading: 'Work Experience', items: [existingToken] }] };
    const resumeExperience = [
      { company: 'Acme', title: 'Engineer', startDate: '2020', endDate: '2021' }
    ];
    const ensured = ensureRequiredSections(data, { resumeExperience });
    expect(ensured.sections[0].items).toHaveLength(1);
  });
});

describe('ensureRequiredSections certifications merging', () => {
  test('merges and deduplicates certifications with hyperlinks', () => {
    const data = { sections: [] };
    const resumeCertifications = [
      {
        name: 'AWS Certified Developer',
        provider: 'Amazon',
        url: 'https://www.credly.com/badges/aws-dev'
      }
    ];
    const linkedinCertifications = [
      {
        name: 'AWS Certified Developer',
        provider: 'Amazon',
        url: 'https://www.credly.com/badges/aws-dev'
      },
      {
        name: 'PMP',
        provider: 'PMI',
        url: 'https://example.com/pmp'
      }
    ];
    const ensured = ensureRequiredSections(data, {
      resumeCertifications,
      linkedinCertifications
    });
    const certSection = ensured.sections.find(
      (s) => s.heading === 'Certification'
    );
    expect(certSection).toBeTruthy();
    expect(certSection.heading).toBe('Certification');
    expect(certSection.items).toHaveLength(2);
    certSection.items.forEach((tokens) => {
      expect(tokens[0].type).toBe('bullet');
    });
    const first = certSection.items[0];
    const hasLink = first.some(
      (t) => t.type === 'link' && t.href === 'https://www.credly.com/badges/aws-dev'
    );
    expect(hasLink).toBe(true);
  });

  test('prepends bullet to existing certification entries missing one', () => {
    const data = {
      sections: [{ heading: 'Certification', items: [parseLine('AWS Dev')] }]
    };
    const ensured = ensureRequiredSections(data, {});
    const certSection = ensured.sections.find((s) => s.heading === 'Certification');
    expect(certSection.items).toHaveLength(1);
    expect(certSection.items[0][0].type).toBe('bullet');
  });
});
