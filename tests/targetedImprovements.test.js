import { enforceTargetedUpdate } from '../server.js';

const baseResume = `Alex Roe\n# Summary\nOriginal summary line.\n# Skills\n- JavaScript\n- Node.js\n# Experience\n- Built features for enterprise clients.`;

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
});
