import { parseLine } from '../server.js';

describe('parseLine emphasis handling', () => {
  test('handles nested emphasis markers', () => {
    const tokens = parseLine('*italic **bold** more*');
    const shapes = tokens.map(({ text, style }) => ({ text, style }));
    expect(shapes).toEqual([
      { text: 'italic ', style: 'italic' },
      { text: 'bold', style: 'bolditalic' },
      { text: ' more', style: 'italic' }
    ]);
  });

  test('drops unbalanced emphasis markers', () => {
    const tokens = parseLine('This _text *is not closed');
    expect(tokens.map((t) => t.text).join('')).toBe('This text is not closed');
    tokens.forEach((t) => expect(t.style).toBeUndefined());
  });

  test.each(['- dash bullet', '– en dash bullet'])('emits bullet token for %s', (input) => {
    const tokens = parseLine(input);
    expect(tokens[0]).toMatchObject({ type: 'bullet' });
    const text = tokens.slice(1).map((t) => t.text).join('');
    const expected = input.replace(/^[\-*–]\s+/, '');
    expect(text).toBe(expected);
    expect(text).not.toMatch(/[-–]/);
  });

  test('handles combined bold and italic markers', () => {
    const tokens = parseLine('***both***');
    const shapes = tokens.map(({ text, style }) => ({ text, style }));
    expect(shapes).toEqual([{ text: 'both', style: 'bolditalic' }]);
  });

  test('normalizes malformed emphasis strings', () => {
    const tokens = parseLine('Text with *mismatched _markers* inside_');
    expect(tokens.map((t) => t.text).join('')).toBe('Text with mismatched markers inside');
    tokens.forEach((t) => expect(t.style).toBeUndefined());
  });

  test('bolds job title and company before pipe', () => {
    const tokens = parseLine('Software Engineer, Acme Corp | Jan 2020 - Present');
    const text = tokens.map((t) => t.text || '').join('');
    expect(text).toBe('Software Engineer, Acme Corp Jan 2020 - Present');
    const bold = tokens.filter((t) => t.style === 'bold' || t.style === 'bolditalic');
    expect(bold.map((t) => t.text).join('')).toBe('Software Engineer, Acme Corp');
    expect(tokens.some((t) => t.type === 'jobsep')).toBe(true);
  });

  test('strips surrounding parentheses from links', () => {
    const tokens = parseLine('Check (https://github.com/user) for code');
    const link = tokens.find((t) => t.type === 'link');
    expect(link.href).toBe('https://github.com/user');
    const texts = tokens.map((t) => t.text).join('');
    expect(texts).not.toContain('(');
    expect(texts).not.toContain(')');
  });

  test('preserves raw link text when requested', () => {
    const tokens = parseLine('LinkedIn: https://linkedin.com/in/example', {
      preserveLinkText: true
    });
    const link = tokens.find((t) => t.type === 'link');
    expect(link.text).toBe('https://linkedin.com/in/example');
    expect(link.href).toBe('https://linkedin.com/in/example');
    const combined = tokens.map((t) => t.text || '').join('');
    expect(combined).toContain('LinkedIn: https://linkedin.com/in/example');
  });
});
