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

  test('skips placeholder when another experience section has items', () => {
    const data = {
      sections: [
        {
          heading: 'Professional Experience',
          items: [parseLine('- Engineer at Acme (2020 – 2021)')]
        }
      ]
    };
    const ensured = ensureRequiredSections(data, {});
    const work = ensured.sections.find((s) => s.heading === 'Work Experience');
    expect(work).toBeUndefined();
    const placeholders = ensured.sections
      .filter((s) => s.heading.toLowerCase().includes('experience'))
      .flatMap((s) =>
        (s.items || []).flatMap((tokens) => tokens.map((t) => t.text || ''))
      );
    expect(placeholders).not.toContain('Information not provided');
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
    const credlyCertifications = [
      {
        name: 'AWS Certified Developer',
        provider: 'Amazon',
        url: 'https://www.credly.com/badges/aws-dev'
      }
    ];
    const ensured = ensureRequiredSections(data, {
      resumeCertifications,
      linkedinCertifications,
      credlyCertifications
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
    const firstText = first
      .filter((t) => t.text)
      .map((t) => t.text)
      .join(' ');
    expect(firstText).toContain('AWS Certified Developer');
    expect(firstText).toContain('Amazon');
    const firstLink = first.find(
      (t) => t.type === 'link' && t.href === 'https://www.credly.com/badges/aws-dev'
    );
    expect(firstLink).toBeTruthy();
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
      const link = first[1];
      expect(link.type).toBe('link');
      expect(link.text).toContain('AWS Certified Developer');
      expect(link.text).toContain('Amazon');
      expect(link.href).toBe('https://credly.com/aws-dev');
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

    test('limits certification list to five most recent entries with clickable names', () => {
      const resumeCertifications = [
        { name: 'Cert1', provider: 'P1', url: 'https://c1', date: '2024-01-01' },
        { name: 'Cert2', provider: 'P2', url: 'https://c2', date: '2023-01-01' },
        { name: 'Cert3', provider: 'P3', url: 'https://c3', date: '2022-01-01' },
        { name: 'Cert4', provider: 'P4', url: 'https://c4', date: '2021-01-01' },
        { name: 'Cert5', provider: 'P5', url: 'https://c5', date: '2020-01-01' },
        { name: 'Cert6', provider: 'P6', url: 'https://c6', date: '2019-01-01' }
      ];
      const ensured = ensureRequiredSections(
        { sections: [] },
        { resumeCertifications }
      );
      const certSection = ensured.sections.find(
        (s) => s.heading === 'Certification'
      );
      expect(certSection.items).toHaveLength(5);
      const texts = certSection.items.map((tokens) => tokens[1].text);
      expect(texts.join(' ')).not.toMatch(/Cert6/);
      expect(texts[0]).toContain('Cert1');
      expect(texts[4]).toContain('Cert5');
      certSection.items.forEach((tokens, idx) => {
        expect(tokens[0].type).toBe('bullet');
        const link = tokens[1];
        expect(link.type).toBe('link');
        expect(link.href).toBe(resumeCertifications[idx].url);
      });
    });
  });
