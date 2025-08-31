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

  test('strips leading bullet before tokenization', () => {
    const tokens = parseLine('* bullet *italic*');
    const shapes = tokens.map(({ text, style }) => ({ text, style }));
    expect(shapes).toEqual([
      { text: 'bullet ', style: undefined },
      { text: 'italic', style: 'italic' }
    ]);
  });
});
