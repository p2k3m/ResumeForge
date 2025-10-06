import { renderTemplatePdf } from '../lib/pdf/index.js';

const TEMPLATE_VARIANTS = ['2025', '2025:midnight', '2025:sunrise', '2025:emerald'];

function createTextTokens(lines) {
  if (!Array.isArray(lines)) {
    return [{ type: 'text', text: String(lines ?? '') }];
  }
  const tokens = [];
  lines.forEach((line, index) => {
    if (line == null) return;
    const value = String(line);
    if (!value.trim()) return;
    tokens.push({ type: 'text', text: value });
    if (index < lines.length - 1) {
      tokens.push({ type: 'newline' });
    }
  });
  return tokens.length > 0 ? tokens : [{ type: 'text', text: '' }];
}

function createSection(heading, entries) {
  const items = Array.isArray(entries)
    ? entries
        .map((entry) => {
          if (!entry) return null;
          const tokens = createTextTokens(entry);
          const hasContent = tokens.some(
            (token) => token && typeof token.text === 'string' && token.text.trim()
          );
          return hasContent ? tokens : null;
        })
        .filter(Boolean)
    : [];
  return { heading, items };
}

function createMockResumeSections() {
  return [
    createSection('Professional Summary', [
      [
        'Product leader with 8+ years delivering AI-assisted workflows,',
        'growing ARR and leading globally distributed teams.'
      ]
    ]),
    createSection('Experience', [
      [
        'ResumeForge Labs — Senior Product Manager',
        '2019 – Present | Remote',
        'Own roadmap for resume intelligence platform increasing conversion by 35%.'
      ],
      [
        'Launch Labs — Product Manager',
        '2016 – 2019 | San Francisco, CA',
        'Shipped analytics suite adopted by 200+ enterprise customers.'
      ]
    ]),
    createSection('Education', [
      [
        'B.S. Computer Science',
        'University of Innovation',
        '2012 – 2016'
      ]
    ]),
    createSection('Projects', [
      [
        'Resume Personalization Engine',
        'Built experimentation system recommending tailored bullet improvements.'
      ]
    ]),
    createSection('Skills', [
      ['Product Strategy, Experimentation, SQL, Tableau, Cross-functional Leadership']
    ]),
    createSection('Languages', [['English (Native)', 'Spanish (Professional Working Proficiency)']]),
    createSection('Certifications', [['Certified Scrum Product Owner (CSPO)']]),
    createSection('Contact', [
      ['jane.product@example.com'],
      ['(555) 123-4567'],
      ['https://www.linkedin.com/in/janeproduct'],
      ['San Francisco, CA']
    ])
  ];
}

function createMockOptions() {
  return {
    name: 'Jane Product',
    jobTitle: 'Senior Product Manager',
    email: 'jane.product@example.com',
    phone: '(555) 123-4567',
    linkedinProfileUrl: 'https://www.linkedin.com/in/janeproduct',
    contactLines: [
      'jane.product@example.com',
      '(555) 123-4567',
      'linkedin.com/in/janeproduct',
      'San Francisco, CA'
    ],
    jobSkills: ['Product Strategy', 'Experimentation', 'Leadership', 'SQL', 'Tableau'],
    project:
      'Resume Personalization Engine — automation that drafts 2025-ready bullet points.'
  };
}

function createMockPayload() {
  const sections = createMockResumeSections();
  const rawLines = [
    'Jane Product',
    'Senior Product Manager',
    'jane.product@example.com | (555) 123-4567 | linkedin.com/in/janeproduct',
    'Professional Summary',
    'Product leader with 8+ years delivering AI-assisted workflows.',
    'Experience',
    'ResumeForge Labs — Senior Product Manager (2019 – Present)',
    'Launch Labs — Product Manager (2016 – 2019)',
    'Education',
    'University of Innovation — B.S. Computer Science',
    'Skills: Product Strategy, Experimentation, SQL, Tableau'
  ];
  return {
    data: {
      name: 'Jane Product',
      sections
    },
    options: createMockOptions(),
    rawText: rawLines.join('\n'),
    templateParams: {}
  };
}

export async function backstopPdfTemplates({
  templates = TEMPLATE_VARIANTS,
  logger = console
} = {}) {
  const results = [];
  for (const templateId of templates) {
    try {
      const payload = createMockPayload();
      const buffer = await renderTemplatePdf(templateId, payload);
      if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new Error('Renderer did not return PDF output');
      }
      if (logger && typeof logger.info === 'function') {
        logger.info(`Rendered mock resume for ${templateId} (${buffer.length} bytes)`);
      } else if (logger && typeof logger.log === 'function') {
        logger.log(`Rendered mock resume for ${templateId} (${buffer.length} bytes)`);
      }
      results.push({ templateId, bytes: buffer.length });
    } catch (error) {
      const message = `PDF template ${templateId} failed to render mock content`;
      const failure = new Error(`${message}: ${error?.message || error}`);
      failure.cause = error;
      failure.templateId = templateId;
      throw failure;
    }
  }
  return results;
}
