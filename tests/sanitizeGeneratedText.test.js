import {
  sanitizeGeneratedText,
  parseContent,
  ensureRequiredSections
} from '../server.js';

describe('sanitizeGeneratedText', () => {
  test('removes bracketed guidance lines', () => {
    const input = [
      'John Doe',
      '[Optional note]',
      '# Experience',
      '- Did things'
    ].join('\n');

    const output = sanitizeGeneratedText(input, { skipRequiredSections: true });
    expect(output).toBe(['John Doe', '# Work Experience', '- Did things'].join('\n'));
  });

  test('removes guidance bullets with notes', () => {
    const input = [
      'John Doe',
      '# Experience',
      '- (Note: Remove this line)',
      '- Kept bullet'
    ].join('\n');

    const output = sanitizeGeneratedText(input, { skipRequiredSections: true });
    expect(output).toBe(
      ['John Doe', '# Work Experience', '- Kept bullet'].join('\n')
    );
  });

  test('removes bracketed placeholders within cover letters', () => {
    const input = [
      'Dear [Hiring Manager],',
      'I am excited about the [Position Title] role.',
      'Sincerely,',
      'John Doe'
    ].join('\n');

    const output = sanitizeGeneratedText(input, {
      skipRequiredSections: true,
      defaultHeading: ''
    });
    expect(output).toBe(
      ['Dear ,', 'I am excited about the role.', 'Sincerely,', 'John Doe'].join('\n')
    );
  });

  test('removes empty certification heading and merges duplicate education', () => {
    const input = [
      'John Doe',
      '# Education',
      '- High School',
      '# TRAININGS/ CERTIFICATION',
      '# EDUCATION',
      '- College'
    ].join('\n');

    const output = sanitizeGeneratedText(input, { skipRequiredSections: true });
    expect(output).toBe(
      ['John Doe', '# Education', '- High School', '- College'].join('\n')
    );
  });

  test('ensureRequiredSections does not reintroduce empty sections', () => {
    const input = [
      'John Doe',
      '# Education',
      '- High School',
      '# TRAININGS/ CERTIFICATION',
      '# EDUCATION',
      '- College'
    ].join('\n');

    const sanitized = sanitizeGeneratedText(input, { skipRequiredSections: true });
    const data = parseContent(sanitized, { skipRequiredSections: true });
    const ensured = ensureRequiredSections(data, { skipRequiredSections: true });

    expect(ensured.sections).toHaveLength(1);
    expect(ensured.sections[0].heading).toBe('Education');
    expect(ensured.sections[0].items).toHaveLength(2);
  });

  test('restores missing sections and preserves original order', () => {
    const original = [
      'Alex Doe',
      '# Summary',
      '- Original summary bullet',
      '# Skills',
      '- JavaScript',
      '# Work Experience',
      '- Original work bullet'
    ].join('\n');

    const fallback = parseContent(original, { skipRequiredSections: true });
    const sectionOrder = fallback.sections.map((sec) => sec.heading);
    const sectionFallbacks = fallback.sections.map((sec) => ({
      heading: sec.heading,
      items: sec.items.map((tokens) => tokens.map((token) => ({ ...token })))
    }));

    const aiOutput = [
      'Alex Doe',
      '# Work Experience',
      '- Updated work bullet',
      '# Summary',
      '- New summary bullet'
    ].join('\n');

    const sanitized = sanitizeGeneratedText(aiOutput, {
      skipRequiredSections: true,
      sectionOrder,
      sectionFallbacks
    });

    expect(sanitized).toBe(
      [
        'Alex Doe',
        '# Summary',
        '- New summary bullet',
        '# Skills',
        '- JavaScript',
        '# Work Experience',
        '- Updated work bullet'
      ].join('\n')
    );
  });

  test('preserves multiline bullets and job separators', () => {
    const input = [
      'Taylor Doe',
      '# Work Experience',
      '- Senior Engineer | Big Co | 2022 - Present',
      '  Led cross-functional initiatives across 5 teams',
      '- Built analytics platform',
      '  Increased NPS by 20%',
      '# Skills',
      '- JavaScript',
      '- Python'
    ].join('\n');

    const sanitized = sanitizeGeneratedText(input, { skipRequiredSections: true });

    expect(sanitized).toMatch(
      /Senior Engineer \| Big Co \| 2022 - Present/
    );
    expect(sanitized).toMatch(
      /Built analytics platform\nIncreased NPS by 20%/
    );
  });
});
