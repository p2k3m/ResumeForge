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

  test('includes multiple roles from resumeExperience', () => {
    const data = { sections: [{ heading: 'Work Experience', items: [] }] };
    const resumeExperience = [
      {
        company: 'Acme',
        roles: [
          { title: 'Senior Dev', startDate: '2021', endDate: '2022' },
          { title: 'Dev', startDate: '2019', endDate: '2021' }
        ]
      }
    ];
    const ensured = ensureRequiredSections(data, { resumeExperience });
    const lines = ensured.sections[0].items.map((tokens) =>
      tokens.map((t) => t.text || '').join('').trim()
    );
    expect(lines).toEqual([
      'Senior Dev at Acme (2021 – 2022)',
      'Dev at Acme (2019 – 2021)'
    ]);
  });

  test('includes multiple roles from linkedinExperience', () => {
    const data = { sections: [{ heading: 'Work Experience', items: [] }] };
    const linkedinExperience = [
      {
        company: 'Beta',
        roles: [
          { title: 'Lead', startDate: '2022', endDate: '2023' },
          { title: 'Engineer', startDate: '2020', endDate: '2022' }
        ]
      }
    ];
    const ensured = ensureRequiredSections(data, { linkedinExperience });
    const lines = ensured.sections[0].items.map((tokens) =>
      tokens.map((t) => t.text || '').join('').trim()
    );
    expect(lines).toEqual([
      'Lead at Beta (2022 – 2023)',
      'Engineer at Beta (2020 – 2022)'
    ]);
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

  test('deduplicates existing certification entries', () => {
    const data = {
      sections: [
        {
          heading: 'Certification',
          items: [
            parseLine('AWS Certified Developer (Amazon) https://www.credly.com/badges/aws-dev'),
            parseLine('AWS Certified Developer (Amazon) https://www.credly.com/badges/aws-dev')
          ]
        }
      ]
    };
    const ensured = ensureRequiredSections(data, {});
    const certSection = ensured.sections.find((s) => s.heading === 'Certification');
    expect(certSection.items).toHaveLength(1);
  });

  test('includes credly certifications and profile link', () => {
    const data = { sections: [] };
    const credlyCertifications = [
      {
        name: 'AWS Certified Developer',
        provider: 'Amazon',
        url: 'https://credly.com/aws-dev'
      }
    ];
    const ensured = ensureRequiredSections(data, {
      credlyCertifications,
      credlyProfileUrl: 'https://credly.com/user'
    });
    const certSection = ensured.sections.find(
      (s) => s.heading === 'Certification'
    );
    expect(certSection).toBeTruthy();
    expect(certSection.items).toHaveLength(2);
    const first = certSection.items[0];
    const hasLink = first.some(
      (t) => t.type === 'link' && t.href === 'https://credly.com/aws-dev'
    );
    expect(hasLink).toBe(true);
    const profile = certSection.items[1];
    const profileLink = profile.find(
      (t) => t.type === 'link' && t.href === 'https://credly.com/user'
    );
    expect(profileLink).toBeTruthy();
  });

  test('omits certification section when only credly profile link provided', () => {
    const ensured = ensureRequiredSections(
      { sections: [] },
      { credlyCertifications: [], credlyProfileUrl: 'https://credly.com/user' }
    );
    const certSection = ensured.sections.find(
      (s) => s.heading === 'Certification'
    );
    expect(certSection).toBeUndefined();
  });

  test('removes certification section if no certificates remain', () => {
    const data = { sections: [{ heading: 'Certification', items: [] }] };
    const ensured = ensureRequiredSections(data, {});
    const certSection = ensured.sections.find((s) => s.heading === 'Certification');
    expect(certSection).toBeUndefined();
  });
});
