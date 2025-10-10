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

  it('flags section headings that are not followed by meaningful content', () => {
    const letter = [
      'Jordan Rivera',
      'Email: jordan@example.com',
      '',
      'Dear Hiring Manager,',
      '',
      'Professional Summary',
      '',
      'Sincerely,',
      'Jordan Rivera',
    ].join('\n');

    const result = auditCoverLetterStructure(letter, { applicantName: 'Jordan Rivera' });

    expect(result.valid).toBe(false);
    expect(result.issues).toContain('section_heading_without_content');
  });

  it('does not flag headings when substantive paragraphs follow them', () => {
    const letter = [
      'Jordan Rivera',
      'Email: jordan@example.com',
      '',
      'Dear Hiring Manager,',
      '',
      'Key Achievements',
      '',
      '- Led a cross-functional team to launch a new platform that increased ARR by 18%.',
      '',
      'Sincerely,',
      'Jordan Rivera',
    ].join('\n');

    const result = auditCoverLetterStructure(letter, { applicantName: 'Jordan Rivera' });

    expect(result.issues).not.toContain('section_heading_without_content');
  });

  it('flags placeholder contact details that slip through parsing', () => {
    const letter = [
      'Jordan Rivera',
      'Email: [Your Email]',
      'Phone: (555) 867-5309',
      '',
      'Dear Hiring Manager,',
      '',
      'I am excited about the Senior Product Manager role and the chance to bring my roadmap leadership to your team.',
      '',
      'Sincerely,',
      'Jordan Rivera',
    ].join('\n');

    const result = auditCoverLetterStructure(letter, { applicantName: 'Jordan Rivera' });

    expect(result.valid).toBe(false);
    expect(result.issues).toContain('placeholder_detected');
  });

  it('rejects cover letters with bracketed placeholder recipients or signatures', () => {
    const letter = [
      'Jordan Rivera',
      'Austin, TX',
      '',
      'Dear [Hiring Manager],',
      '',
      'My experience leading customer-obsessed product launches aligns strongly with this opportunity.',
      '',
      'Sincerely,',
      '[Your Name]',
    ].join('\n');

    const result = auditCoverLetterStructure(letter, { applicantName: 'Jordan Rivera' });

    expect(result.valid).toBe(false);
    expect(result.issues).toContain('placeholder_detected');
  });
});
