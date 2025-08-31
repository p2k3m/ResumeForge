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
  test('parses company, dates, and responsibilities from resume text', () => {
    const text =
      'Experience\n- Developer at Beta Corp (Mar 2018 - Apr 2019)\n  - Built API\n';
    expect(extractExperience(text)).toEqual([
      {
        company: 'Beta Corp',
        title: 'Developer',
        startDate: 'Mar 2018',
        endDate: 'Apr 2019',
        responsibilities: ['Built API']
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
