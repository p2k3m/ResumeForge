import { parseContent } from '../server.js';

describe('parseContent placeholders', () => {
  test('inserts placeholder when Work Experience and Education missing in markdown', () => {
    const data = parseContent('Jane Doe\n# Skills\n- JavaScript');
    const work = data.sections.find((s) => s.heading === 'Work Experience');
    const edu = data.sections.find((s) => s.heading === 'Education');
    expect(work.items).toHaveLength(1);
    expect(work.items[0].map((t) => t.text).join('')).toBe(
      'Information not provided'
    );
    expect(edu.items).toHaveLength(1);
    expect(edu.items[0].map((t) => t.text).join('')).toBe(
      'Information not provided'
    );
  });

  test('inserts placeholder when Work Experience and Education missing in JSON', () => {
    const json = { name: 'Jane', sections: [{ heading: 'Skills', items: ['JS'] }] };
    const data = parseContent(JSON.stringify(json));
    const work = data.sections.find((s) => s.heading === 'Work Experience');
    const edu = data.sections.find((s) => s.heading === 'Education');
    expect(work.items).toHaveLength(1);
    expect(work.items[0].map((t) => t.text).join('')).toBe(
      'Information not provided'
    );
    expect(edu.items).toHaveLength(1);
    expect(edu.items[0].map((t) => t.text).join('')).toBe(
      'Information not provided'
    );
  });

  test('omits required sections when skipRequiredSections is true', () => {
    const data = parseContent('Jane Doe\n# Skills\n- JavaScript', {
      skipRequiredSections: true
    });
    const headings = data.sections.map((s) => s.heading);
    expect(headings).not.toContain('Work Experience');
    expect(headings).not.toContain('Education');
    data.sections.forEach((s) =>
      s.items.forEach((tokens) => {
        expect(tokens.map((t) => t.text).join('')).not.toBe(
          'Information not provided'
        );
      })
    );
  });
});

describe('parseContent summary reclassification', () => {
  test('moves job-like lines from Summary to Work Experience', () => {
    const input = [
      'John Doe',
      'Acme Corp | Developer | Jan 2020 - Present',
      'Passionate engineer',
      '# Skills',
      '- JS'
    ].join('\n');
    const data = parseContent(input);
    const summary = data.sections.find((s) => s.heading === 'Summary');
    const work = data.sections.find((s) => s.heading === 'Work Experience');
    expect(summary.items).toHaveLength(1);
    expect(summary.items[0].map((t) => t.text).join('')).toBe(
      'Passionate engineer'
    );
    expect(work.items).toHaveLength(1);
    expect(work.items[0].map((t) => t.text).join('')).toBe(
      'Acme Corp Developer Jan 2020 - Present'
    );
  });

  test('keeps contact details in Summary and out of Work Experience', () => {
    const input = [
      'John Doe',
      'john@example.com | 555-123-4567 | https://github.com/jdoe',
      'Acme Corp | Developer | Jan 2020 - Present',
      '# Skills',
      '- JS'
    ].join('\n');
    const data = parseContent(input);
    const summary = data.sections.find((s) => s.heading === 'Summary');
    const work = data.sections.find((s) => s.heading === 'Work Experience');
    const summaryText = summary.items
      .map((tokens) => tokens.map((t) => t.text || t.href || '').join(''))
      .join(' ');
    expect(summaryText).toMatch(/john@example.com/);
    expect(summaryText).toMatch(/555-123-4567/);
    expect(summaryText).toMatch(/github/i);
    const workText = work.items
      .map((tokens) => tokens.map((t) => t.text || '').join(''))
      .join(' ');
    expect(workText).not.toMatch(/john@example.com/);
    expect(workText).not.toMatch(/555-123-4567/);
    expect(workText).not.toMatch(/github/);
  });

  test('drops contact details from job lines before moving to Work Experience', () => {
    const input = [
      'John Doe',
      'Acme Corp | Developer | Jan 2020 - Present | john@example.com',
      '# Skills',
      '- JS'
    ].join('\n');
    const data = parseContent(input);
    const summary = data.sections.find((s) => s.heading === 'Summary');
    const work = data.sections.find((s) => s.heading === 'Work Experience');
    expect(summary).toBeUndefined();
    const workText = work.items
      .map((tokens) => tokens.map((t) => t.text || '').join(''))
      .join(' ');
    expect(workText).toBe('Acme Corp Developer Jan 2020 - Present');
    expect(workText).not.toMatch(/john@example.com/);
  });
});

describe('parseContent skills list handling', () => {
  test('splits comma or semicolon separated skills into bullets', () => {
    const input = 'Jane Doe\n# Skills\nJavaScript, Python; Go';
    const data = parseContent(input);
    const skills = data.sections.find((s) => s.heading === 'Skills');
    const items = skills.items.map((tokens) =>
      tokens.filter((t) => t.text).map((t) => t.text).join('')
    );
    expect(items).toEqual(['JavaScript', 'Python', 'Go']);
  });
});

describe('parseContent experience fallbacks', () => {
  test('uses resume experience when AI output lacks it', () => {
    const data = parseContent('Jane Doe\n# Skills\n- JS', {
      resumeExperience: [
        { title: 'Did something', company: '', startDate: '', endDate: '' }
      ]
    });
    const work = data.sections.find((s) => s.heading === 'Work Experience');
    expect(work.items).toHaveLength(1);
    expect(work.items[0].map((t) => t.text).join('')).toBe('Did something');
  });

  test('uses linkedin experience when resume lacks it', () => {
    const data = parseContent('Jane Doe\n# Skills\n- JS', {
      linkedinExperience: [
        { title: 'LinkedIn item', company: '', startDate: '', endDate: '' }
      ]
    });
    const work = data.sections.find((s) => s.heading === 'Work Experience');
    expect(work.items).toHaveLength(1);
    expect(work.items[0].map((t) => t.text).join('')).toBe('LinkedIn item');
  });
  test('merges resume and LinkedIn experiences with dates and descriptions', () => {
    const data = parseContent('Jane Doe\n# Skills\n- JS', {
      resumeExperience: [
        {
          title: 'Developer',
          company: 'Beta Corp',
          startDate: 'Mar 2018',
          endDate: 'Apr 2019',
          responsibilities: ['Built things']
        }
      ],
      linkedinExperience: [
        {
          title: 'Engineer',
          company: 'Acme',
          startDate: 'Jan 2020',
          endDate: 'Feb 2021'
        }
      ],
      jobTitle: 'Senior Engineer'
    });
    const work = data.sections.find((s) => s.heading === 'Work Experience');
    expect(work.items).toHaveLength(2);
    expect(work.items[0].map((t) => t.text).join('')).toBe('Senior Engineer at Acme (Jan 2020 – Feb 2021)');
    expect(work.items[1].map((t) => t.text).join('')).toBe('Developer at Beta Corp (Mar 2018 – Apr 2019)Built things');
  });
});

describe('parseContent education fallbacks', () => {
  test('uses resume education when AI output lacks it', () => {
    const data = parseContent('Jane Doe\n# Skills\n- JS', {
      resumeEducation: ['B.S. in CS - MIT']
    });
    const edu = data.sections.find((s) => s.heading === 'Education');
    expect(edu.items).toHaveLength(1);
    expect(edu.items[0].map((t) => t.text).join('')).toBe('B.S. in CS - MIT');
  });

  test('uses linkedin education when resume lacks it', () => {
    const data = parseContent('Jane Doe\n# Skills\n- JS', {
      linkedinEducation: ['Stanford University, BSc']
    });
    const edu = data.sections.find((s) => s.heading === 'Education');
    expect(edu.items).toHaveLength(1);
    expect(edu.items[0].map((t) => t.text).join('')).toBe(
      'Stanford University, BSc'
    );
  });
});

describe('parseContent empty section removal', () => {
  test('omits sections with only whitespace items', () => {
    const input = [
      'Jane Doe',
      '# Work Experience',
      '-   ',
      '# Skills',
      '- JavaScript',
      '# Empty',
      '-   '
    ].join('\n');
    const data = parseContent(input, { skipRequiredSections: true });
    const headings = data.sections.map((s) => s.heading);
    expect(headings).toEqual(['Skills']);
  });
});

describe('parseContent duplicate section merging', () => {
  test('merges markdown sections with same heading case-insensitively', () => {
    const input = [
      'Jane Doe',
      '# Education',
      '- B.S. in CS',
      '# education',
      '- M.S. in CS'
    ].join('\n');
    const data = parseContent(input, { skipRequiredSections: true });
    const educationSections = data.sections.filter(
      (s) => s.heading.toLowerCase() === 'education'
    );
    expect(educationSections).toHaveLength(1);
    const items = educationSections[0].items.map((tokens) =>
      tokens.filter((t) => t.text).map((t) => t.text).join('')
    );
    expect(items).toEqual(['B.S. in CS', 'M.S. in CS']);
  });

  test('merges JSON sections with same heading case-insensitively', () => {
    const json = {
      name: 'Jane',
      sections: [
        { heading: 'Education', items: ['B.S. in CS'] },
        { heading: 'education', items: ['M.S. in CS'] }
      ]
    };
    const data = parseContent(JSON.stringify(json), { skipRequiredSections: true });
    const educationSections = data.sections.filter(
      (s) => s.heading.toLowerCase() === 'education'
    );
    expect(educationSections).toHaveLength(1);
    const items = educationSections[0].items.map((tokens) =>
      tokens.filter((t) => t.text).map((t) => t.text).join('')
    );
    expect(items).toEqual(['B.S. in CS', 'M.S. in CS']);
  });

  test('merges headings with trailing punctuation or whitespace', () => {
    const input = [
      'Jane Doe',
      '# Education:',
      '- B.S. in CS',
      '# Education ',
      '- M.S. in CS'
    ].join('\n');
    const data = parseContent(input, { skipRequiredSections: true });
    const educationSections = data.sections.filter(
      (s) => s.heading.toLowerCase() === 'education'
    );
    expect(educationSections).toHaveLength(1);
    const items = educationSections[0].items.map((tokens) =>
      tokens.filter((t) => t.text).map((t) => t.text).join('')
    );
    expect(items).toEqual(['B.S. in CS', 'M.S. in CS']);
    expect(educationSections[0].heading).toBe('Education');
  });

  test('avoids duplicating education section when heading has punctuation', () => {
    const json = {
      name: 'Jane',
      sections: [{ heading: 'Education:', items: ['B.S. in CS'] }]
    };
    const data = parseContent(JSON.stringify(json));
    const educationSections = data.sections.filter(
      (s) => s.heading.toLowerCase() === 'education'
    );
    expect(educationSections).toHaveLength(1);
    const items = educationSections[0].items.map((tokens) =>
      tokens.filter((t) => t.text).map((t) => t.text).join('')
    );
    expect(items).toEqual(['B.S. in CS']);
    expect(educationSections[0].heading).toBe('Education');
  });

  test('drops empty education section in favor of later populated markdown section', () => {
    const input = [
      'Jane Doe',
      '# Education',
      '# Skills',
      '- JS',
      '# Education',
      '- B.S. in CS'
    ].join('\n');
    const data = parseContent(input, { skipRequiredSections: true });
    const headings = data.sections.map((s) => s.heading);
    expect(headings).toEqual(['Skills', 'Education']);
    const educationSections = data.sections.filter(
      (s) => s.heading.toLowerCase() === 'education'
    );
    expect(educationSections).toHaveLength(1);
    const items = educationSections[0].items.map((tokens) =>
      tokens.filter((t) => t.text).map((t) => t.text).join('')
    );
    expect(items).toEqual(['B.S. in CS']);
  });

  test('drops empty education section in favor of later populated JSON section', () => {
    const json = {
      name: 'Jane',
      sections: [
        { heading: 'Education', items: [] },
        { heading: 'Skills', items: ['JS'] },
        { heading: 'Education', items: ['B.S. in CS'] }
      ]
    };
    const data = parseContent(JSON.stringify(json), { skipRequiredSections: true });
    const headings = data.sections.map((s) => s.heading);
    expect(headings).toEqual(['Skills', 'Education']);
    const educationSections = data.sections.filter(
      (s) => s.heading.toLowerCase() === 'education'
    );
    expect(educationSections).toHaveLength(1);
    const items = educationSections[0].items.map((tokens) =>
      tokens.filter((t) => t.text).map((t) => t.text).join('')
    );
    expect(items).toEqual(['B.S. in CS']);
  });
});

describe('parseContent certification normalization and pruning', () => {
  test('standardizes certification headings and merges duplicates', () => {
    const input = [
      'Jane Doe',
      '# Trainings',
      '- AWS',
      '# Certifications',
      '- GCP',
      '# TRAININGS/ CERTIFICATION',
      '- Azure'
    ].join('\n');
    const data = parseContent(input, { skipRequiredSections: true });
    const cert = data.sections.find((s) => s.heading === 'Certification');
    expect(cert).toBeTruthy();
    const items = cert.items.map((tokens) =>
      tokens.filter((t) => t.text).map((t) => t.text).join('')
    );
    expect(items).toEqual(['AWS', 'GCP', 'Azure']);
    const headings = data.sections.map((s) => s.heading);
    expect(headings.filter((h) => h === 'Certification')).toHaveLength(1);
  });

  test('prunes empty certification sections', () => {
    const input = ['Jane Doe', '# Certifications', '-   ', '# Skills', '- JS'].join('\n');
    const data = parseContent(input, { skipRequiredSections: true });
    const cert = data.sections.find((s) => s.heading === 'Certification');
    expect(cert).toBeUndefined();
  });
});

describe('parseContent defaultHeading option', () => {
  test('omits summary heading when defaultHeading is empty', () => {
    const input = 'Jane Doe\nThis is a cover letter paragraph.';
    const data = parseContent(input, { defaultHeading: '', skipRequiredSections: true });
    expect(data.sections).toHaveLength(1);
    expect(data.sections[0].heading).toBe('');
  });
});

