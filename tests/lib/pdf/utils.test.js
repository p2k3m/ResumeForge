import { resolveTemplateParams } from '../../../lib/pdf/utils.js';

describe('resolveTemplateParams', () => {
  const templateFontMap = {
    modern: 'Inter',
    professional: 'Garamond',
    classic: 'Times New Roman',
    ats: 'Arial',
    '2025': 'Sora'
  };

  const baseConfig = {
    default: { baseMargin: 44, accentColor: 'default-accent' },
    all: { baseFont: 'BaseSans', accentColor: 'all-accent' },
    templates: {
      default: { templateHeading: 'HeadingDefault', accentColor: 'template-default-accent' },
      all: { templateBullet: '•', accentColor: 'template-all-accent' }
    },
    resume: { outputBase: 'resume-base', accentColor: 'resume-top-accent' },
    outputs: {
      resume: {
        outputShared: 'resume-shared',
        accentColor: 'resume-output-accent',
        modern: { accentColor: 'resume-modern-accent', spacing: 22 },
        professional: { accentColor: 'resume-professional-accent', spacing: 24 }
      }
    },
    'resume:modern': { compositeOnly: 'resume-modern-composite', accentColor: 'resume-composite-accent' },
    'resume:professional': {
      compositeOnly: 'resume-professional-composite',
      accentColor: 'resume-professional-composite-accent'
    }
  };

  for (const [templateId, font] of Object.entries(templateFontMap)) {
    baseConfig[templateId] = { fontFamily: font, accentColor: `${templateId}-top-accent` };
    baseConfig.templates[templateId] = {
      accentColor: `${templateId}-template-accent`,
      themeName: `${templateId}-theme`
    };
  }

  test.each(Object.keys(templateFontMap))(
    'merges defaults with template overrides for %s',
    (templateId) => {
      const result = resolveTemplateParams(baseConfig, templateId);
      expect(result).toMatchObject({
        baseMargin: 44,
        baseFont: 'BaseSans',
        templateHeading: 'HeadingDefault',
        templateBullet: '•',
        fontFamily: templateFontMap[templateId],
        themeName: `${templateId}-theme`
      });
      expect(result.accentColor).toBe(`${templateId}-template-accent`);
    }
  );

  test('applies output-specific overrides for resume layouts', () => {
    const modern = resolveTemplateParams(baseConfig, 'modern', 'resume');
    expect(modern).toMatchObject({
      baseMargin: 44,
      baseFont: 'BaseSans',
      fontFamily: 'Inter',
      themeName: 'modern-theme',
      outputBase: 'resume-base',
      outputShared: 'resume-shared',
      compositeOnly: 'resume-modern-composite',
      spacing: 22
    });
    expect(modern.accentColor).toBe('resume-modern-accent');

    const professional = resolveTemplateParams(baseConfig, 'professional', 'resume');
    expect(professional).toMatchObject({
      baseMargin: 44,
      baseFont: 'BaseSans',
      fontFamily: 'Garamond',
      themeName: 'professional-theme',
      outputBase: 'resume-base',
      outputShared: 'resume-shared',
      compositeOnly: 'resume-professional-composite',
      spacing: 24
    });
    expect(professional.accentColor).toBe('resume-professional-accent');
  });
});
