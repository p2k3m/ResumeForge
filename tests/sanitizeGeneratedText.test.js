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
    expect(output).toBe(['John Doe', '# Experience', '- Did things'].join('\n'));
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
      ['John Doe', '# Experience', '- Kept bullet'].join('\n')
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
});
