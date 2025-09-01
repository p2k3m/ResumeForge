import { jest } from '@jest/globals';

const sampleHtml = `
<section id="experience">
  <li>
    <h3>Engineer</h3>
    <h4>Acme Corp</h4>
    <span>Jan 2020 - Feb 2021</span>
  </li>
</section>
`;

jest.unstable_mockModule('axios', () => ({
  default: { get: jest.fn().mockResolvedValue({ data: sampleHtml }) }
}));

const { extractExperience, fetchLinkedInProfile } = await import('../server.js');

describe('extractExperience', () => {
  test('parses company and dates from resume text, ignoring responsibilities', () => {
    const text =
      'Experience\n- Developer at Beta Corp (Mar 2018 - Apr 2019)\n  - Built API\n';
    expect(extractExperience(text)).toEqual([
      {
        company: 'Beta Corp',
        title: 'Developer',
        startDate: 'Mar 2018',
        endDate: 'Apr 2019'
      }
    ]);
  });

  test('handles "Work Experience" section header', () => {
    const text =
      'Work Experience\n- Developer at Beta Corp (Mar 2018 - Apr 2019)\n';
    expect(extractExperience(text)).toEqual([
      {
        company: 'Beta Corp',
        title: 'Developer',
        startDate: 'Mar 2018',
        endDate: 'Apr 2019'
      }
    ]);
  });

  test('handles "Professional Experience" section header', () => {
    const text =
      'Professional Experience\n- Developer at Beta Corp (Mar 2018 - Apr 2019)\n';
    expect(extractExperience(text)).toEqual([
      {
        company: 'Beta Corp',
        title: 'Developer',
        startDate: 'Mar 2018',
        endDate: 'Apr 2019'
      }
    ]);
  });

  test('retains multiple roles within the section', () => {
    const text =
      'Experience\n' +
      '- Developer at Beta Corp (Mar 2018 - Apr 2019)\n' +
      '  - Built API\n\n' +
      '  - Improved UX\n\n' +
      '- Manager at Gamma LLC (May 2019 - Jun 2020)\n' +
      '  - Led team\n' +
      '  - Managed budget\n' +
      'Education\n' +
      '- BSc Computer Science\n';
    expect(extractExperience(text)).toEqual([
      {
        company: 'Beta Corp',
        title: 'Developer',
        startDate: 'Mar 2018',
        endDate: 'Apr 2019'
      },
      {
        company: 'Gamma LLC',
        title: 'Manager',
        startDate: 'May 2019',
        endDate: 'Jun 2020'
      }
    ]);
  });

  test('captures roles separated by blank lines until next heading', () => {
    const text =
      'Experience\n' +
      'Developer at Beta Corp (Mar 2018 - Apr 2019)\n' +
      '  - Built API\n\n' +
      'Manager at Gamma LLC (May 2019 - Jun 2020)\n' +
      '  - Led team\n\n' +
      'Analyst at Delta Inc (Jul 2020 - Present)\n' +
      '  - Analyzed data\n' +
      'Skills\n' +
      '- JavaScript\n';
    expect(extractExperience(text)).toEqual([
      {
        company: 'Beta Corp',
        title: 'Developer',
        startDate: 'Mar 2018',
        endDate: 'Apr 2019'
      },
      {
        company: 'Gamma LLC',
        title: 'Manager',
        startDate: 'May 2019',
        endDate: 'Jun 2020'
      },
      {
        company: 'Delta Inc',
        title: 'Analyst',
        startDate: 'Jul 2020',
        endDate: 'Present'
      }
    ]);
  });

  test('ignores technology bullet lines following a role', () => {
    const text =
      'Experience\n' +
      '- Developer at Beta Corp (Mar 2018 - Apr 2019)\n' +
      '- React, Node, AWS\n';
    expect(extractExperience(text)).toEqual([
      {
        company: 'Beta Corp',
        title: 'Developer',
        startDate: 'Mar 2018',
        endDate: 'Apr 2019'
      }
    ]);
  });
});

describe('fetchLinkedInProfile', () => {
  test('extracts structured experience details', async () => {
    const profile = await fetchLinkedInProfile('http://example.com');
    expect(profile.experience).toEqual([
      {
        company: 'Acme Corp',
        title: 'Engineer',
        startDate: 'Jan 2020',
        endDate: 'Feb 2021'
      }
    ]);
  });
});
