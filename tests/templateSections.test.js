import {
  parseContent,
  buildTemplateSectionContext,
  buildTemplateContactEntries
} from '../server.js';

describe('buildTemplateSectionContext', () => {
  test('groups canonical sections and preserves styling cues', () => {
    const input = [
      'Jane Doe',
      '# Summary',
      'Seasoned product leader elevating growth and retention.',
      '# Contact',
      'Email: jane@example.com',
      '# Work Experience',
      '- Senior PM at Acme Corp (Jan 2020 - Present)',
      '# Education',
      '- MIT',
      '# Skills',
      '- JavaScript, Leadership',
      '# Certifications',
      '- PMP Certification'
    ].join('\n');

    const data = parseContent(input);
    const context = buildTemplateSectionContext(data.sections);

    const summarySection = context.sections.find((sec) => sec.key === 'summary');
    expect(summarySection).toBeDefined();
    expect(summarySection.htmlItems[0]).not.toContain('class="bullet"');

    const experienceSection = context.sections.find((sec) => sec.key === 'experience');
    expect(experienceSection.htmlItems[0]).toContain('class="bullet"');

    const educationSection = context.sections.find((sec) => sec.key === 'education');
    expect(educationSection.htmlItems[0]).toContain('class="edu-bullet"');

    expect(context.buckets.skills).toHaveLength(1);
    expect(context.buckets.certifications).toHaveLength(1);
  });
});

describe('buildTemplateContactEntries', () => {
  test('formats contact lines with label/value spans', () => {
    const entries = buildTemplateContactEntries([
      'Email: jane@example.com',
      'Phone: 555-123-4567',
      'Remote, USA'
    ]);

    expect(entries).toHaveLength(3);
    expect(entries[0]).toEqual(
      expect.objectContaining({ label: 'Email', value: 'jane@example.com' })
    );
    expect(entries[0].html).toContain('contact-label');
    expect(entries[0].html).toContain('contact-value');

    expect(entries[2]).toEqual(
      expect.objectContaining({ label: '', value: 'Remote, USA' })
    );
    expect(entries[2].html).toContain('contact-value');
    expect(entries[2].html).not.toContain('contact-label');
  });
});
