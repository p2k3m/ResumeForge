import { enforceTargetedUpdate } from '../server.js';

describe('enforceTargetedUpdate', () => {
  test('enhance-all preserves original layout and sections', () => {
    const original = [
      'Jane Doe',
      'Austin, TX | jane@example.com | (555) 555-1212',
      '# Summary',
      'Original summary statement highlighting strengths.',
      '# Skills',
      '- JavaScript',
      '# Projects',
      '- Data Dashboard – Delivered analytics portal for leadership.',
      '# Work Experience',
      '- Frontend Engineer at StartCo (2020 – Present)',
      '# Education',
      '- B.S. Computer Science, University of Somewhere'
    ].join('\n');

    const enhanced = [
      'Jane Doe',
      '# Summary',
      'New summary with metrics that aligns to the target role.',
      '# Skills',
      '- JavaScript',
      '- TypeScript',
      '# Work Experience',
      '- Led feature delivery at StartCo with a 20% conversion lift.'
    ].join('\n');

    const result = enforceTargetedUpdate(
      'enhance-all',
      original,
      {
        updatedResume: enhanced,
        beforeExcerpt: 'Original summary statement highlighting strengths.',
        afterExcerpt: 'New summary with metrics that aligns to the target role.'
      },
      {
        jobTitle: 'Senior Frontend Engineer',
        currentTitle: 'Frontend Engineer',
        originalTitle: 'Frontend Engineer'
      }
    );

    const lines = result.updatedResume.split('\n');
    expect(lines[0]).toBe('Jane Doe');
    expect(lines[1]).toBe('Austin, TX | jane@example.com | (555) 555-1212');
    expect(result.updatedResume).toContain('New summary with metrics that aligns to the target role.');
    expect(result.updatedResume).toContain('- TypeScript');
    expect(result.updatedResume).toContain('Led feature delivery at StartCo with a 20% conversion lift.');
    expect(result.updatedResume).toContain('# Projects');
    expect(result.updatedResume).toContain('- Data Dashboard – Delivered analytics portal for leadership.');
    expect(result.updatedResume).toContain('# Education');
    expect(result.updatedResume).toContain('- B.S. Computer Science, University of Somewhere');

    const projectsIndex = result.updatedResume.indexOf('# Projects');
    const experienceIndex = result.updatedResume.indexOf('# Work Experience');
    const educationIndex = result.updatedResume.indexOf('# Education');
    expect(projectsIndex).toBeGreaterThan(-1);
    expect(experienceIndex).toBeGreaterThan(-1);
    expect(educationIndex).toBeGreaterThan(-1);
    expect(projectsIndex).toBeLessThan(experienceIndex);
    expect(experienceIndex).toBeLessThan(educationIndex);

    expect(Array.isArray(result.changeDetails)).toBe(true);
    const sections = result.changeDetails.map((detail) => detail.section || detail.label);
    expect(sections).toEqual(
      expect.arrayContaining([
        'Summary',
        'Skills',
        'Work Experience',
        'Certifications',
        'Projects',
        'Highlights',
        'Headline',
      ])
    );
    result.changeDetails.forEach((detail) => {
      expect(Array.isArray(detail.reasons)).toBe(true);
      expect(detail.reasons.length).toBeGreaterThan(0);
    });
  });
});
