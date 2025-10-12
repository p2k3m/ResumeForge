import { parseContent } from '../lib/resume/content.js';
import {
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

    const canonicalOrder = [];
    context.sections.forEach((sec) => {
      if (!canonicalOrder.includes(sec.key)) {
        canonicalOrder.push(sec.key);
      }
    });

    expect(canonicalOrder.slice(0, 6)).toEqual([
      'contact',
      'summary',
      'experience',
      'education',
      'skills',
      'certifications'
    ]);

    const summarySection = context.sections.find((sec) => sec.key === 'summary');
    expect(summarySection).toBeDefined();
    expect(summarySection.htmlItems[0]).not.toContain('class="bullet"');
    expect(summarySection.showMarkers).toBe(false);
    expect(summarySection.sectionClass).toContain('section--summary');
    expect(summarySection.markerClass).toContain('marker');

    const contactSection = context.sections.find((sec) => sec.key === 'contact');
    expect(contactSection).toBeDefined();
    expect(contactSection.sectionClass).toContain('section--contact');
    expect(contactSection.headingClass).toContain('section-heading--contact');
    expect(contactSection.listClass).toContain('section-list--contact');
    expect(contactSection.htmlItems[0]).not.toContain('class="bullet"');
    expect(contactSection.showMarkers).toBe(false);

    const experienceSection = context.sections.find((sec) => sec.key === 'experience');
    expect(experienceSection.htmlItems[0]).toContain('class="bullet');
    expect(experienceSection.htmlItems[0]).toContain('marker--experience');
    expect(experienceSection.showMarkers).toBe(true);
    expect(experienceSection.markerClass).toContain('marker--experience');

    const educationSection = context.sections.find((sec) => sec.key === 'education');
    expect(educationSection.htmlItems[0]).toContain('class="edu-bullet');
    expect(educationSection.htmlItems[0]).toContain('marker--education');
    expect(educationSection.markerClass).toContain('marker--education');

    const skillsSection = context.sections.find((sec) => sec.key === 'skills');
    expect(skillsSection).toBeDefined();
    expect(skillsSection.sectionClass).toContain('section--skills');
    expect(skillsSection.textClass).toContain('section-text--skills');
    expect(skillsSection.htmlItems[0]).not.toContain('class="bullet"');
    expect(skillsSection.showMarkers).toBe(false);

    const certificationsSection = context.sections.find((sec) => sec.key === 'certifications');
    expect(certificationsSection).toBeDefined();
    expect(certificationsSection.sectionClass).toContain('section--certifications');
    expect(certificationsSection.textClass).toContain('section-text--certifications');
    expect(certificationsSection.htmlItems[0]).not.toContain('class="bullet"');
    expect(certificationsSection.showMarkers).toBe(false);

    expect(context.buckets.skills).toHaveLength(1);
    expect(context.buckets.certifications).toHaveLength(1);
  });

  test('recognizes canonical synonyms and applies consistent presentation', () => {
    const input = [
      'Jane Doe',
      '# Professional Summary',
      'Strategic operator with cross-functional leadership.',
      '# Contact Information',
      'Phone: 555-867-5309',
      '# Work History',
      '- Director of Ops at Globex (2018 - Present)',
      '# Education & Training',
      '- MBA, Stanford',
      '# Technical Proficiencies',
      '- Python, SQL, Tableau',
      '# Licenses and Certifications',
      '- Six Sigma Black Belt'
    ].join('\n');

    const data = parseContent(input);
    const context = buildTemplateSectionContext(data.sections);

    const canonicalOrder = [];
    context.sections.forEach((sec) => {
      if (!canonicalOrder.includes(sec.key)) {
        canonicalOrder.push(sec.key);
      }
    });

    expect(canonicalOrder.slice(0, 6)).toEqual([
      'contact',
      'summary',
      'experience',
      'education',
      'skills',
      'certifications'
    ]);

    const lookup = (key) => context.sections.find((sec) => sec.key === key);

    expect(lookup('contact').sectionClass).toContain('section--contact');
    expect(lookup('summary').headingClass).toContain('section-heading--summary');
    expect(lookup('experience').listClass).toContain('section-list--experience');
    expect(lookup('education').sectionClass).toContain('section--education');
    expect(lookup('skills').textClass).toContain('section-text--skills');
    expect(lookup('certifications').textClass).toContain(
      'section-text--certifications'
    );

    expect(lookup('summary').showMarkers).toBe(false);
    expect(lookup('experience').showMarkers).toBe(true);
  });

  test('sanitizes css classes for non-canonical headings', () => {
    const input = [
      'Jane Doe',
      '# Volunteer Experience',
      '- Coordinated community outreach'
    ].join('\n');

    const data = parseContent(input);
    const context = buildTemplateSectionContext(data.sections);

    const volunteerSection = context.sections.find((sec) =>
      /Volunteer Experience/i.test(sec.heading)
    );

    expect(volunteerSection).toBeDefined();
    expect(volunteerSection.sectionClass).toContain('section--volunteer-experience');
    expect(volunteerSection.headingClass).toContain(
      'section-heading--volunteer-experience'
    );
    expect(volunteerSection.listClass).toContain('section-list--volunteer-experience');
    expect(volunteerSection.markerClass).toContain('marker--volunteer-experience');
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
