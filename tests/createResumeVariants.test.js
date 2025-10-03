import { createResumeVariants } from '../server.js';

describe('createResumeVariants', () => {
  test('enhancements rely on tokens mapped to placeholders', () => {
    const baseText = [
      'Jane Doe',
      '# Summary',
      '- Delivered award-winning platforms.',
      '# Work Experience',
      '- Senior Engineer at Acme Corp: Increased uptime by 20%.',
      '# Skills',
      '- JavaScript'
    ].join('\n');

    const { version1, version2, placeholders } = createResumeVariants({
      baseText,
      projectText: 'Built a scalable AI matching engine with AWS Lambda and DynamoDB.',
      modifiedTitle: 'Principal Engineer',
      skillsToInclude: ['GraphQL'],
      baseSkills: ['Leadership'],
      sanitizeOptions: { skipRequiredSections: true }
    });

    const tokenPattern = /\{\{RF_ENH_[A-Z0-9_]+\}\}/g;
    const version1Tokens = version1.match(tokenPattern) || [];
    const version2Tokens = version2.match(tokenPattern) || [];
    const allTokens = Array.from(new Set([...version1Tokens, ...version2Tokens]));

    expect(version1Tokens.length).toBeGreaterThanOrEqual(3);
    allTokens.forEach((token) => {
      expect(placeholders[token]).toBeDefined();
    });

    const workToken = version1Tokens.find((token) => token.includes('WORK_EXPERIENCE'));
    expect(workToken).toBeDefined();
    expect(placeholders[workToken]).toBe(
      'Principal Engineer at Acme Corp: Increased uptime by 20%.'
    );

    const projectToken = version1Tokens.find((token) => token.includes('PROJECTS'));
    expect(projectToken).toBeDefined();
    expect(placeholders[projectToken]).toBe(
      'Built a scalable AI matching engine with AWS Lambda and DynamoDB.'
    );

    const skillTokens = allTokens.filter((token) => token.includes('SKILLS'));
    const skillValues = skillTokens.map((token) => placeholders[token]);
    expect(skillValues).toEqual(
      expect.arrayContaining(['Leadership', 'GraphQL'])
    );

    const graphQlToken = version2Tokens.find((token) => placeholders[token] === 'GraphQL');
    expect(graphQlToken).toBeDefined();
  });
});
