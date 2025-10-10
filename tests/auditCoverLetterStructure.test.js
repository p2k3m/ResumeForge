import { auditCoverLetterStructure } from '../server.js';

describe('auditCoverLetterStructure best practices enforcement', () => {
  it('flags cover letters that exceed the 500 word maximum', () => {
    const body = Array.from({ length: 510 }, (_, index) => `word${index + 1}`).join(' ');
    const letter = `Dear Hiring Manager,\n\n${body}\n\nSincerely,\nAlex Candidate`;

    const result = auditCoverLetterStructure(letter);

    expect(result.valid).toBe(false);
    expect(result.issues).toContain('exceeds_word_limit');
  });

  it('identifies weak closings that lack a confident call to action', () => {
    const letter = [
      'Dear Hiring Manager,',
      '',
      'My experience spans product delivery and operations, and I am eager to contribute.',
      '',
      'Thank you for your time and consideration.',
      '',
      'Sincerely,',
      'Jordan Rivera',
    ].join('\n');

    const result = auditCoverLetterStructure(letter, { applicantName: 'Jordan Rivera' });

    expect(result.valid).toBe(false);
    expect(result.issues).toContain('weak_closing');
  });

  it('allows confident closings that pair gratitude with next steps', () => {
    const letter = [
      'Dear Hiring Manager,',
      '',
      'I am excited about this opportunity and the chance to apply my product leadership experience.',
      '',
      'Thank you for your consideration. I look forward to discussing how I can drive impact for your team.',
      '',
      'Sincerely,',
      'Jordan Rivera',
    ].join('\n');

    const result = auditCoverLetterStructure(letter, { applicantName: 'Jordan Rivera' });

    expect(result.valid).toBe(true);
    expect(result.issues).not.toContain('weak_closing');
  });
});
