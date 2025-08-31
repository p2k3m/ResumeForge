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
});
