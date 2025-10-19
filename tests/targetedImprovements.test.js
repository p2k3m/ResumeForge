import { enforceTargetedUpdate } from '../server.js';

const baseResume = [
  'Alex Roe',
  '# Summary',
  'Original summary line.',
  '# Skills',
  '- JavaScript',
  '- Node.js',
  '# Projects',
  '- Built analytics dashboard for leadership reviews.',
  '# Highlights',
  '- Recognised for improving deployment reliability.',
  '# Experience',
  '- Built features for enterprise clients.',
  '# Certifications',
  '- AWS Certified Developer – Associate',
].join('\n');

describe('enforceTargetedUpdate', () => {
  test('limits improve-summary updates to the Summary section', () => {
    const updatedResume = `Alex Roe\n# Summary\nRevamped summary that highlights leadership.\n# Skills\n- JavaScript\n- Node.js\n- React\n# Experience\n- Built features for enterprise clients.\n- Increased adoption by 20%.`;

    const result = enforceTargetedUpdate(
      'improve-summary',
      baseResume,
      { updatedResume },
      {}
    );

    expect(result.updatedResume).toContain('Revamped summary that highlights leadership.');
    expect(result.updatedResume).not.toContain('Increased adoption by 20%.');
    expect(result.updatedResume).not.toContain('- React');
    expect(result.updatedResume).toContain('- Built features for enterprise clients.');
  });

  test('applies afterExcerpt when summary output omits section headings', () => {
    const snippet = 'Revamped summary that highlights leadership with measurable outcomes.';

    const result = enforceTargetedUpdate(
      'improve-summary',
      baseResume,
      {
        updatedResume: snippet,
        beforeExcerpt: 'Original summary line.',
        afterExcerpt: snippet,
      },
      {}
    );

    expect(result.updatedResume).toContain(snippet);
    expect(result.updatedResume).not.toContain('Original summary line.');
    expect(result.updatedResume).toContain('# Skills\n- JavaScript\n- Node.js');
    expect(result.updatedResume).toContain('# Highlights\n- Recognised for improving deployment reliability.');
  });

  test('limits add-missing-skills updates to the Skills section', () => {
    const updatedResume = `Alex Roe\n# Summary\nAltered summary should not persist.\n# Skills\n- JavaScript\n- Node.js\n- React\n# Experience\n- Built features for enterprise clients.`;

    const result = enforceTargetedUpdate(
      'add-missing-skills',
      baseResume,
      { updatedResume },
      {}
    );

    expect(result.updatedResume).toContain('Original summary line.');
    expect(result.updatedResume).toContain('- React');
    expect(result.updatedResume).not.toContain('Altered summary should not persist.');
  });

  test('limits align-experience updates to the Experience section', () => {
    const updatedResume = `Alex Roe\n# Summary\nOriginal summary line.\n# Skills\n- JavaScript\n- Node.js\n# Experience\n- Built features for enterprise clients.\n- Added new responsibilities from JD.`;

    const result = enforceTargetedUpdate(
      'align-experience',
      baseResume,
      { updatedResume },
      {}
    );

    expect(result.updatedResume).toContain('Added new responsibilities from JD.');
    expect(result.updatedResume).toContain('Original summary line.');
    expect(result.updatedResume).toContain('# Skills\n- JavaScript\n- Node.js');
  });

  test('limits change-designation updates to the designation line', () => {
    const designationResume = `Alex Roe\nSenior Software Engineer\n# Summary\nOriginal summary line.\n# Skills\n- JavaScript\n# Experience\n- Built features for enterprise clients.`;

    const updatedResume = `Alex Roe\nPrincipal Software Engineer\n# Summary\nUpdated summary that should not persist.\n# Skills\n- JavaScript\n# Experience\n- Built features for enterprise clients.`;

    const result = enforceTargetedUpdate(
      'change-designation',
      designationResume,
      { updatedResume },
      { jobTitle: 'Principal Software Engineer', currentTitle: 'Senior Software Engineer' }
    );

    expect(result.updatedResume).toContain('Principal Software Engineer');
    expect(result.updatedResume).not.toContain('Updated summary that should not persist.');
    expect(result.updatedResume).toContain('Original summary line.');
  });

  test('limits improve-certifications updates to the Certifications section', () => {
    const updatedResume = baseResume.replace(
      '# Certifications\n- AWS Certified Developer – Associate',
      '# Certifications\n- AWS Certified Developer – Associate\n- Azure Administrator Associate\n# Summary\nInjected summary change.'
    );

    const result = enforceTargetedUpdate(
      'improve-certifications',
      baseResume,
      { updatedResume },
      {}
    );

    expect(result.updatedResume).toContain('AWS Certified Developer – Associate');
    expect(result.updatedResume).toContain('Azure Administrator Associate');
    expect(result.updatedResume).toContain('Original summary line.');
    expect(result.updatedResume).not.toContain('Injected summary change.');
  });

  test('limits improve-projects updates to the Projects section', () => {
    const updatedResume = baseResume.replace(
      '# Projects\n- Built analytics dashboard for leadership reviews.',
      '# Projects\n- Built analytics dashboard for leadership reviews.\n- Added cloud migration case study.\n# Skills\n- Injected skill'
    );

    const result = enforceTargetedUpdate(
      'improve-projects',
      baseResume,
      { updatedResume },
      {}
    );

    expect(result.updatedResume).toContain('Added cloud migration case study.');
    expect(result.updatedResume).toContain('- JavaScript');
    expect(result.updatedResume).not.toContain('Injected skill');
  });

  test('limits improve-highlights updates to the Highlights section', () => {
    const updatedResume = baseResume.replace(
      '# Highlights\n- Recognised for improving deployment reliability.',
      '# Highlights\n- Recognised for improving deployment reliability.\n- Spotlighted quantified wins for JD success metrics.\n# Experience\n- Altered experience line.'
    );

    const result = enforceTargetedUpdate(
      'improve-highlights',
      baseResume,
      { updatedResume },
      {}
    );

    expect(result.updatedResume).toContain('Spotlighted quantified wins for JD success metrics.');
    expect(result.updatedResume).toContain('- Built features for enterprise clients.');
    expect(result.updatedResume).not.toContain('Altered experience line.');
  });
});
