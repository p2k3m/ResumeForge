function parseLine(text) {
  let bullet = false;
  text = text.replace(/^[\-*–]\s+/, () => {
    bullet = true;
    return '';
  });
  const tokens = [];
  if (bullet) tokens.push({ type: 'bullet' });

  function processPart(part, forceBold = false) {
    const pieces = part.split(/(\n|\t)/);
    for (const piece of pieces) {
      if (piece === '\n') {
        tokens.push({ type: 'newline' });
        continue;
      }
      if (piece === '\t') {
        tokens.push({ type: 'tab' });
        continue;
      }
      const linkRegex = /\[([^\]]+)\]\((https?:\/\/\S+?)\)|(https?:\/\/\S+)/g;
      let lastIndex = 0;
      let match;

      function flushSegment(segment) {
        if (!segment) return;
        const segTokens = parseEmphasis(segment);
        if (forceBold) {
          segTokens.forEach((t) => {
            if (t.style === 'italic') t.style = 'bolditalic';
            else t.style = t.style && t.style.includes('bold') ? t.style : 'bold';
          });
        }
        tokens.push(...segTokens);
      }

      while ((match = linkRegex.exec(piece)) !== null) {
        if (match.index > lastIndex) {
          let segment = piece.slice(lastIndex, match.index);
          if (segment.endsWith('(')) segment = segment.slice(0, -1);
          flushSegment(segment);
        }
        if (match[1] && match[2]) {
          let href = match[2];
          if (href.endsWith(')')) href = href.slice(0, -1);
          tokens.push({
            type: 'link',
            text: match[1].replace(/[*_]/g, ''),
            href,
            continued: true,
            ...(forceBold ? { style: 'bold' } : {})
          });
        } else if (match[3]) {
          let href = match[3];
          if (href.endsWith(')')) href = href.slice(0, -1);
          const domainMap = { 'linkedin.com': 'LinkedIn', 'github.com': 'GitHub' };
          let label = href;
          try {
            const hostname = new URL(href).hostname.replace(/^www\./, '');
            label = domainMap[hostname] || href;
          } catch {
            label = href;
          }
          tokens.push({
            type: 'link',
            text: label.replace(/[*_]/g, ''),
            href,
            continued: true,
            ...(forceBold ? { style: 'bold' } : {})
          });
        }
        if (piece[linkRegex.lastIndex] === ')') linkRegex.lastIndex++;
        lastIndex = linkRegex.lastIndex;
      }
      if (lastIndex < piece.length) {
        flushSegment(piece.slice(lastIndex));
      }
    }
  }

  const pipeIdx = text.indexOf('|');
  if (pipeIdx !== -1) {
    const before = text.slice(0, pipeIdx).trim();
    const after = text.slice(pipeIdx + 1);
    processPart(before, true);
    tokens.push({ type: 'jobsep' });
    const segments = after.split('|');
    segments.forEach((seg) => {
      const trimmed = seg.trim();
      if (!trimmed) return;
      tokens.push({ type: 'paragraph', text: ' ' });
      processPart(trimmed, false);
    });
  } else {
    processPart(text, false);
  }

  if (tokens.length === 0) {
    return [{ type: 'paragraph', text: text.replace(/[*_]/g, '') }];
  }
  const filtered = tokens.filter((t) => t.type !== 'paragraph' || t.text);
  filtered.forEach((t, i) => {
    if (t.type === 'newline' || t.type === 'tab' || t.type === 'jobsep') return;
    t.continued = i < filtered.length - 1;
  });
  return filtered;
}

function parseEmphasis(segment) {
  const tokens = [];
  let i = 0;
  let buffer = '';
  const stack = [];

  const pushBuffer = () => {
    if (!buffer) return;
    tokens.push({ type: 'paragraph', text: buffer, style: styleFromStack(), continued: true });
    buffer = '';
  };

  const styleFromStack = () => {
    const hasBold = stack.some((s) => s.type === 'bold' || s.type === 'bolditalic');
    const hasItalic = stack.some((s) => s.type === 'italic' || s.type === 'bolditalic');
    if (hasBold && hasItalic) return 'bolditalic';
    if (hasBold) return 'bold';
    if (hasItalic) return 'italic';
    return undefined;
  };

  while (i < segment.length) {
    const ch = segment[i];
    if (ch === '*' || ch === '_') {
      let count = 1;
      while (segment[i + count] === ch) count++;
      let remaining = count;
      while (remaining > 0) {
        const markerLen = remaining >= 3 ? 3 : remaining >= 2 ? 2 : 1;
        const type = markerLen === 3 ? 'bolditalic' : markerLen === 2 ? 'bold' : 'italic';
        const ahead = segment.indexOf(ch.repeat(markerLen), i + markerLen);
        if (
          stack.length &&
          stack[stack.length - 1].char === ch &&
          stack[stack.length - 1].type === type
        ) {
          pushBuffer();
          stack.pop();
        } else if (ahead !== -1) {
          pushBuffer();
          stack.push({ char: ch, type });
        }
        i += markerLen;
        remaining -= markerLen;
      }
    } else {
      buffer += ch;
      i++;
    }
  }

  pushBuffer();
  if (stack.length) {
    tokens.forEach((t) => {
      t.style = undefined;
    });
  }
  tokens.forEach((t) => {
    if (t.text) t.text = t.text.replace(/[*_]/g, '');
  });
  return tokens.filter((t) => t.text);
}


function normalizeHeading(heading = '') {
  const base = String(heading)
    .trim()
    .replace(/[-–—:.;,!?]+$/g, '')
    .trim();
  const normalized = base
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const lower = normalized.toLowerCase().replace(/\s+/g, ' ');
  if (lower === 'experience') {
    return 'Work Experience';
  }
  if (lower.includes('training') || lower.includes('certification')) {
    return 'Certification';
  }
  return normalized;
}

function normalizeUrl(url = '') {
  let result = String(url).trim();
  while (result.endsWith('/')) result = result.slice(0, -1);
  return result;
}


function ensureRequiredSections(
  data,
  {
    resumeExperience = [],
    linkedinExperience = [],
    resumeEducation = [],
    linkedinEducation = [],
    resumeCertifications = [],
    linkedinCertifications = [],
    credlyCertifications = [],
    credlyProfileUrl,
    linkedinProfileUrl,
    jobTitle,
    project,
    skipRequiredSections = false
  } = {},
) {
  if (skipRequiredSections) {
    data.sections = pruneEmptySections(data.sections || []);
    data.sections = mergeDuplicateSections(data.sections);
    return data;
  }
  // Assemble contact tokens for the summary/header
  let summarySection = data.sections.find(
    (s) => normalizeHeading(s.heading).toLowerCase() === 'summary'
  );
  let contactTokens;
  if (summarySection?.items?.length) {
    const first = summarySection.items[0];
    const text = first
      .map((t) => `${t.text || ''} ${t.href || ''}`)
      .join(' ');
    if (containsContactInfo(text)) contactTokens = [...first];
  }

  if (credlyProfileUrl) {
    contactTokens = contactTokens || [];
    const normalizedCredly = normalizeUrl(credlyProfileUrl);
    const hasCredly = contactTokens.some(
      (t) => t.type === 'link' && normalizeUrl(t.href) === normalizedCredly
    );
    if (!hasCredly) {
      if (contactTokens.length)
        contactTokens.push({ type: 'paragraph', text: ' | ' });
      contactTokens.push({
        type: 'link',
        text: 'Credly Profile',
        href: credlyProfileUrl,
      });
    }
  }

  if (linkedinProfileUrl) {
    contactTokens = contactTokens || [];
    const hasLinkedIn = contactTokens.some(
      (t) =>
        t.type === 'link' &&
        /linkedin\.com/i.test(normalizeUrl(t.href || ''))
    );
    if (!hasLinkedIn) {
      if (contactTokens.length)
        contactTokens.push({ type: 'paragraph', text: ' | ' });
      contactTokens.push({
        type: 'link',
        text: 'LinkedIn Profile',
        href: linkedinProfileUrl,
      });
    }
  }

  if (contactTokens && contactTokens.length) {
    if (!summarySection) {
      summarySection = { heading: 'Summary', items: [] };
      data.sections.unshift(summarySection);
    }
    summarySection.items = summarySection.items || [];
    const first = summarySection.items[0];
    const firstText = first
      ? first.map((t) => `${t.text || ''} ${t.href || ''}`).join(' ')
      : '';
    if (first && containsContactInfo(firstText))
      summarySection.items[0] = contactTokens;
    else summarySection.items.unshift(contactTokens);
    data.contactTokens = contactTokens;
  }

  const required = ['Work Experience', 'Education'];
  required.forEach((heading) => {
    const normalized = normalizeHeading(heading);
    const key = normalized.toLowerCase();
    let section = data.sections.find(
      (s) => normalizeHeading(s.heading).toLowerCase() === key
    );
    if (!section) {
      section = { heading: normalized, items: [] };
      data.sections.push(section);
    } else {
      section.heading = normalizeHeading(section.heading);
    }
    if (normalized.toLowerCase() === 'work experience') {
      section.items = section.items || [];
      const unparsedItems = [];
      const existing = section.items
        .map((tokens) => {
          const parts = [];
          for (const t of tokens) {
            if (t.type === 'newline') break;
            if (t.text) parts.push(t.text);
          }
          const line = parts.join('').trim();
          if (!line) {
            unparsedItems.push(tokens);
            return null;
          }
          const parsed = extractExperience([line])[0];
          if (!parsed) {
            unparsedItems.push(tokens);
            return null;
          }
          const key = [
            parsed.company || '',
            parsed.title || '',
            parsed.startDate || '',
            parsed.endDate || ''
          ]
            .map((s) => s.toLowerCase())
            .join('|');
          return { key, exp: parsed };
        })
        .filter(Boolean);

      const seen = new Set(existing.map((e) => e.key));
      const flatten = (arr = []) =>
        arr.flatMap((exp) => {
          if (Array.isArray(exp.roles) && exp.roles.length) {
            return exp.roles.map((role) => {
              const { roles, ...base } = exp;
              return {
                ...base,
                ...role,
                company: role.company || base.company || '',
                responsibilities:
                  role.responsibilities || base.responsibilities || [],
              };
            });
          }
          return exp;
        });
      const combined = [
        ...flatten(resumeExperience),
        ...flatten(linkedinExperience),
      ];
      const additions = [];
      combined.forEach((exp) => {
        const key = [
          exp.company || '',
          exp.title || '',
          exp.startDate || '',
          exp.endDate || ''
        ]
          .map((s) => s.toLowerCase())
          .join('|');
        if (!seen.has(key)) {
          seen.add(key);
          additions.push({ ...exp, key });
        }
      });

      additions.sort((a, b) => {
        const aDate = Date.parse(a.endDate || a.startDate || '');
        const bDate = Date.parse(b.endDate || b.startDate || '');
        return (isNaN(bDate) ? 0 : bDate) - (isNaN(aDate) ? 0 : aDate);
      });

      const format = (exp) => {
        const datePart =
          exp.startDate || exp.endDate
            ? ` (${exp.startDate || ''} – ${exp.endDate || ''})`
            : '';
        const base = [exp.title, exp.company].filter(Boolean).join(' at ');
        return `${base}${datePart}`.trim();
      };

      const toTokens = (exp, key) => {
        const tokens = parseLine(format(exp));
        if (!tokens.some((t) => t.type === 'bullet')) {
          tokens.unshift({ type: 'bullet' });
        }
        return { key, exp, tokens };
      };

      const formattedExisting = existing.map((e) => toTokens(e.exp, e.key));
      const formattedAdditions = additions.map((exp) =>
        toTokens(exp, exp.key)
      );

      const all = [...formattedExisting, ...formattedAdditions];
      all.sort((a, b) => {
        const aDate = Date.parse(a.exp.endDate || a.exp.startDate || '');
        const bDate = Date.parse(b.exp.endDate || b.exp.startDate || '');
        return (isNaN(bDate) ? 0 : bDate) - (isNaN(aDate) ? 0 : aDate);
      });

      if (jobTitle && all.length) {
        all[0].exp.title = jobTitle;
        const key = [
          all[0].exp.company || '',
          all[0].exp.title || '',
          all[0].exp.startDate || '',
          all[0].exp.endDate || ''
        ]
          .map((s) => s.toLowerCase())
          .join('|');
        all[0] = toTokens(all[0].exp, key);
      }

      if (all.length || unparsedItems.length) {
        section.items = [
          ...all.map((e) => e.tokens),
          ...unparsedItems
        ];
      } else {
        const otherExperienceHasItems = data.sections.some((s) => {
          if (s === section) return false;
          const heading = normalizeHeading(s.heading).toLowerCase();
          return (
            heading.includes('experience') &&
            Array.isArray(s.items) &&
            s.items.length > 0
          );
        });
        section.items = otherExperienceHasItems
          ? []
          : [parseLine('Information not provided')];
      }
    } else if (!section.items || section.items.length === 0) {
      if (normalized.toLowerCase() === 'education') {
        const bullets = resumeEducation.length
          ? resumeEducation
          : linkedinEducation;
        if (bullets.length) {
          section.items = bullets.map((b) => parseLine(String(b)));
        } else {
          section.items = [parseLine('Information not provided')];
        }
      } else {
        section.items = [parseLine('Information not provided')];
      }
    }
  });

  const hasProjects = data.sections.some(
    (s) => normalizeHeading(s.heading).toLowerCase() === 'projects'
  );
  if (!hasProjects && project) {
    const sentences = String(project)
      .replace(/\s+/g, ' ')
      .split(/[.!?]\s+/)
      .filter(Boolean)
      .slice(0, 2);
    if (sentences.length) {
      const section = { heading: 'Projects', items: [] };
      sentences.forEach((s) => {
        const tokens = parseLine(s.trim());
        if (!tokens.some((t) => t.type === 'bullet'))
          tokens.unshift({ type: 'bullet' });
        section.items.push(tokens);
      });
      data.sections.push(section);
    }
  }

  // Certifications section
  const certHeading = 'Certification';
  let certSection = data.sections.find(
    (s) => normalizeHeading(s.heading).toLowerCase() === certHeading.toLowerCase()
  );

  const existingCerts = certSection
    ? certSection.items.map((tokens) => {
        const text = tokens
          .map((t) => t.text || t.href || '')
          .join(' ')
          .trim();
        return extractCertifications([text])[0] || {};
      })
    : [];

  const allCerts = [
    ...credlyCertifications,
    ...existingCerts,
    ...resumeCertifications,
    ...linkedinCertifications,
  ];

  const deduped = [];
  const seenCerts = new Set();
  allCerts.forEach((cert) => {
    const key = [cert.name || '', cert.provider || '']
      .map((s) => s.toLowerCase())
      .join('|');
    if (!(cert.name || cert.provider) || seenCerts.has(key)) return;
    seenCerts.add(key);
    deduped.push(cert);
  });

  const getCertDate = (cert = {}) =>
    new Date(
      cert.date ||
        cert.issueDate ||
        cert.issued ||
        cert.startDate ||
        cert.endDate ||
        0
    ).getTime();

  const limitedCerts = deduped
    .sort((a, b) => getCertDate(b) - getCertDate(a))
    .slice(0, 5);

  const certItems = limitedCerts.map((cert) => {
    const tokens = [{ type: 'bullet' }];
    const text = cert.provider
      ? `${cert.name} - ${cert.provider}`
      : cert.name;
    if (cert.url) {
      tokens.push({ type: 'link', text, href: cert.url });
    } else {
      tokens.push({ type: 'paragraph', text });
    }
    return tokens;
  });

  if (credlyProfileUrl) {
    const normalizedProfile = normalizeUrl(credlyProfileUrl);
    let alreadyHasProfile = false;
    certItems.forEach((item) => {
      item.forEach((t, idx) => {
        const textMatch = (t.text || '').trim().toLowerCase() === 'credly profile';
        const hrefMatch =
          t.type === 'link' && normalizeUrl(t.href || '') === normalizedProfile;
        if (hrefMatch || textMatch) {
          alreadyHasProfile = true;
          if (t.type === 'link') {
            t.href = credlyProfileUrl;
            t.text = 'Credly Profile';
          } else {
            item[idx] = {
              type: 'link',
              text: 'Credly Profile',
              href: credlyProfileUrl,
            };
          }
        }
      });
    });
    if (!alreadyHasProfile) {
      certItems.push([
        { type: 'bullet' },
        { type: 'link', text: 'Credly Profile', href: credlyProfileUrl },
      ]);
    }
  }

  if (certItems.length) {
    if (!certSection) {
      certSection = { heading: certHeading, items: [] };
      data.sections.push(certSection);
    }
    certSection.heading = certHeading;
    certSection.items = certItems;
  } else if (certSection) {
    data.sections = data.sections.filter((s) => s !== certSection);
  }

  data.sections = pruneEmptySections(data.sections);
  data.sections = mergeDuplicateSections(data.sections);

  return data;
}


function normalizeName(name = 'Resume') {
  return String(name).replace(/[*_]/g, '');
}

function containsContactInfo(str = '') {
  const text = String(str).toLowerCase();
  return (
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text) ||
    /\b(?:\+?\d[\d\-\s().]{7,}\d)\b/.test(text) ||
    /\bhttps?:\/\/\S+/i.test(text) ||
    /linkedin|github/.test(text)
  );
}

function isJobEntry(tokens = []) {
  const text = tokens
    .map((t) => `${t.text || ''} ${t.href || ''}`)
    .join(' ');
  if (containsContactInfo(text)) return false;
  if (tokens.some((t) => t.type === 'jobsep')) return true;
  const lower = text.toLowerCase();
  const monthRange = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}.*?(present|\d{4})/;
  const yearRange = /\b\d{4}\b\s*[-–to]+\s*(present|\d{4})/;
  return monthRange.test(lower) || yearRange.test(lower);
}

const SKILL_CATEGORY_MAP = {
  database: [
    'mysql',
    'postgres',
    'postgresql',
    'oracle',
    'sqlite',
    'mongodb',
    'sql'
  ]
};

function splitSkills(sections = [], jobSkills = []) {
  const jobSet = new Set((jobSkills || []).map((s) => s.toLowerCase()));
  sections.forEach((sec) => {
    const heading = (sec.heading || '').toLowerCase();
    if (!heading.includes('skill')) return;
    if (jobSet.size === 0) {
      const expanded = [];
      sec.items.forEach((tokens) => {
        const text = tokens
          .filter((t) => t.text)
          .map((t) => t.text)
          .join('')
          .trim();
        if (/[;,]/.test(text)) {
          const skills = text.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
          skills.forEach((skill) => {
            const skillTokens = parseLine(skill);
            if (skillTokens[0]?.type !== 'bullet') {
              skillTokens.unshift({ type: 'bullet' });
            }
            expanded.push(skillTokens);
          });
        } else {
          if (tokens[0]?.type !== 'bullet') {
            const idx = tokens.findIndex((t) => t.type === 'bullet');
            if (idx > -1) {
              const [bullet] = tokens.splice(idx, 1);
              tokens.unshift(bullet);
            } else {
              tokens.unshift({ type: 'bullet' });
            }
          }
          expanded.push(tokens);
        }
      });
      sec.items = expanded;
      return;
    }
    const collected = [];
    sec.items.forEach((tokens) => {
      const text = tokens
        .filter((t) => t.text)
        .map((t) => t.text)
        .join('')
        .trim();
      if (!text) return;
      const parts = /[;,]/.test(text) ? text.split(/[;,]/) : [text];
      parts
        .map((p) => p.trim())
        .filter(Boolean)
        .forEach((skill) => {
          collected.push(skill);
        });
    });
    const uniqMap = new Map();
    collected.forEach((skill) => {
      const lower = skill.toLowerCase();
      if (!uniqMap.has(lower)) uniqMap.set(lower, skill);
    });
    let filtered = Array.from(uniqMap.entries());
    if (jobSet.size) {
      filtered = filtered.filter(([lower]) => jobSet.has(lower));
    }
    const groupMap = new Map();
    filtered.forEach(([lower, display]) => {
      let label = null;
      for (const [cat, members] of Object.entries(SKILL_CATEGORY_MAP)) {
        const all = [cat, ...members];
        if (all.includes(lower)) {
          label = cat;
          break;
        }
      }
      if (label) {
        if (!groupMap.has(label)) groupMap.set(label, new Set([label]));
        if (lower !== label) groupMap.get(label).add(display);
      } else {
        groupMap.set(display.toLowerCase(), new Set([display]));
      }
    });
    const grouped = Array.from(groupMap.values()).map((set) =>
      Array.from(set)
        .slice(0, 4)
        .join(', ')
    );
    const top = grouped.slice(0, 5);
    sec.items = top.map((text) => {
      const tokens = parseLine(text);
      if (tokens[0]?.type !== 'bullet') tokens.unshift({ type: 'bullet' });
      return tokens;
    });
  });
}

function moveSummaryJobEntries(sections = []) {
  const summary = sections.find(
    (s) => normalizeHeading(s.heading || '').toLowerCase() === 'summary'
  );
  if (!summary) return;
  let work = sections.find(
    (s) => normalizeHeading(s.heading || '').toLowerCase() ===
      'work experience'
  );
  if (!work) {
    work = { heading: normalizeHeading('Work Experience'), items: [] };
    sections.push(work);
  }
  const sanitizeTokens = (tokens = []) => {
    const filtered = tokens.filter((t) => {
      const raw = `${t.text || ''} ${t.href || ''}`.toLowerCase();
      if (t.type === 'jobsep') return false;
      return !containsContactInfo(raw);
    });
    while (filtered[0] && !(filtered[0].text || '').trim()) filtered.shift();
    while (
      filtered[filtered.length - 1] &&
      !(filtered[filtered.length - 1].text || '').trim()
    )
      filtered.pop();
    return filtered;
  };

  summary.items = summary.items.filter((tokens) => {
    const sanitized = sanitizeTokens(tokens);
    if (isJobEntry(sanitized)) {
      if (sanitized.length) work.items.push(sanitized);
      return false;
    }
    return true;
  });
  if (summary.items.length === 0) {
    const idx = sections.indexOf(summary);
    if (idx !== -1) sections.splice(idx, 1);
  }
}

function mergeDuplicateSections(sections = []) {
  const seen = new Map();
  const result = [];
  sections.forEach((sec) => {
    const heading = normalizeHeading(sec.heading || '');
    const key = heading.toLowerCase();
    const items = [...(sec.items || [])];
    if (seen.has(key)) {
      const existing = seen.get(key);
      existing.heading = normalizeHeading(existing.heading || '');
      if ((existing.items || []).length === 0 && items.length > 0) {
        const copy = { ...sec, heading, items };
        const idx = result.indexOf(existing);
        if (idx !== -1) result.splice(idx, 1);
        seen.set(key, copy);
        result.push(copy);
      } else {
        existing.items = existing.items.concat(items);
      }
    } else if (items.length > 0) {
      const copy = { ...sec, heading, items };
      seen.set(key, copy);
      result.push(copy);
    }
  });
  return result.filter((sec) => (sec.items || []).length > 0);
}

function pruneEmptySections(sections = []) {
  const hasVisibleText = (t) =>
    typeof t.text === 'string' && /[^\s\u2022·\-–—]/.test(t.text);
  return sections.filter((sec) => {
    sec.items = (sec.items || []).filter((tokens) =>
      tokens.some(hasVisibleText)
    );
    return sec.items.length > 0;
  });
}

function parseContent(text, options = {}) {
  const { defaultHeading = 'Summary', ...rest } = options;
  try {
    const data = JSON.parse(text);
    const name = normalizeName(data.name || 'Resume');
    const rawSections = Array.isArray(data.sections)
      ? data.sections
      : Object.entries(data).map(([heading, content]) => ({ heading, content }));
    const sections = rawSections.map((sec) => {
      const heading = sec.heading || '';
      const items = [];
      const src = sec.items || sec.content;
      if (Array.isArray(src)) {
        src.forEach((i) => {
          const tokens = parseLine(String(i));
          if (!tokens.some((t) => t.type === 'bullet')) tokens.unshift({ type: 'bullet' });
          items.push(tokens);
        });
      } else if (src) {
        const tokens = parseLine(String(src));
        if (!tokens.some((t) => t.type === 'bullet')) tokens.unshift({ type: 'bullet' });
        items.push(tokens);
      }
      return {
        heading,
        items: items.map((tokens) =>
          tokens.reduce((acc, t, i) => {
            acc.push(t);
            const next = tokens[i + 1];
            if (
              next &&
              t.text &&
              next.text &&
              !/\s$/.test(t.text) &&
              !/^\s/.test(next.text)
            ) {
              acc.push({ type: 'paragraph', text: ' ' });
            }
            return acc;
          }, [])
        )
      };
    });
    splitSkills(sections, options.jobSkills);
    moveSummaryJobEntries(sections);
    sections.forEach((sec) => {
      sec.heading = normalizeHeading(sec.heading);
    });
    const mergedSections = mergeDuplicateSections(sections);
    const prunedSections = pruneEmptySections(mergedSections);
    const ensured = ensureRequiredSections(
      { name, sections: prunedSections },
      rest
    );
    ensured.sections.forEach((sec) => {
      sec.heading = normalizeHeading(sec.heading);
    });
    ensured.sections = mergeDuplicateSections(ensured.sections);
    ensured.sections = pruneEmptySections(ensured.sections);
    return ensured;
  } catch {
    const lines = text.split(/\r?\n/);
    const name = normalizeName((lines.shift() || 'Resume').trim());
    const sections = [];
    let currentSection = { heading: defaultHeading, items: [] };
    sections.push(currentSection);
    let current = [];
    for (const raw of lines) {
      const line = raw.replace(/\t/g, '\u0009');
      const trimmed = line.trim();
      if (!trimmed) {
        if (current.length) current.push({ type: 'newline' });
        continue;
      }
      const headingMatch = trimmed.match(/^#{1,6}\s+(.*)/);
      if (headingMatch) {
        if (current.length) {
          currentSection.items.push(current);
          current = [];
        }
        if (
          currentSection.items.length === 0 &&
          currentSection.heading === defaultHeading
        ) {
          sections.pop();
        }
        currentSection = { heading: headingMatch[1].trim(), items: [] };
        sections.push(currentSection);
        continue;
      }
      const plainHeadingMatch = trimmed.match(
        /^((?:work|professional)\s*experience|education|skills|projects|certifications?|summary|languages)$/i
      );
      if (plainHeadingMatch) {
        if (current.length) currentSection.items.push(current);
        if (
          currentSection.items.length === 0 &&
          currentSection.heading === defaultHeading
        ) {
          sections.pop();
        }
        currentSection = {
          heading: normalizeHeading(plainHeadingMatch[0]),
          items: []
        };
        sections.push(currentSection);
        current = [];
        continue;
      }
      const bulletMatch = line.match(/^[\-*–]\s+/);
      if (bulletMatch) {
        if (current.length) currentSection.items.push(current);
        current = parseLine(line);
        continue;
      }
      const indentMatch = line.match(/^\s+(.*)/);
      if (indentMatch && current.length) {
        current.push({ type: 'newline' });
        const tabs = (line.match(/^\s+/) || [''])[0];
        for (const ch of tabs) {
          if (ch === '\u0009') current.push({ type: 'tab' });
        }
        // Preserve internal spacing on continuation lines
        current.push(...parseLine(indentMatch[1]));
        continue;
      }
      if (current.length) currentSection.items.push(current);
      current = parseLine(line.trim());
    }
    if (current.length) currentSection.items.push(current);
    if (
      sections.length &&
      sections[0].heading === defaultHeading &&
      sections[0].items.length === 0
    ) {
      sections.shift();
    }
    sections.forEach((sec, sIdx) => {
      sec.items = sec.items.map((tokens) =>
        tokens.reduce((acc, t, i) => {
          acc.push(t);
          const next = tokens[i + 1];
          if (
            next &&
            t.text &&
            next.text &&
            !/\s$/.test(t.text) &&
            !/^\s/.test(next.text)
          ) {
            acc.push({ type: 'paragraph', text: ' ' });
          }
          return acc;
        }, [])
      );
    });
    splitSkills(sections, options.jobSkills);
    moveSummaryJobEntries(sections);
    sections.forEach((sec) => {
      sec.heading = normalizeHeading(sec.heading);
    });
    const mergedSections = mergeDuplicateSections(sections);
    const prunedSections = pruneEmptySections(mergedSections);
    const ensured = ensureRequiredSections(
      { name, sections: prunedSections },
      rest
    );
    ensured.sections.forEach((sec) => {
      sec.heading = normalizeHeading(sec.heading);
    });
    ensured.sections = mergeDuplicateSections(ensured.sections);
    ensured.sections = pruneEmptySections(ensured.sections);
    return ensured;
  }
}

function extractExperience(source) {
  if (!source) return [];
  const parseEntry = (text) => {
    let company = '';
    let title = '';
    let startDate = '';
    let endDate = '';
    const dateMatch = text.match(/\(([^)]+)\)/);
    if (dateMatch) {
      const parts = dateMatch[1].split(/\s*[-–]\s*/);
      startDate = parts[0]?.trim() || '';
      endDate = parts[1]?.trim() || '';
      text = text.replace(dateMatch[0], '').trim();
    }
    const atMatch = text.match(/(.+?)\s+at\s+(.+)/i);
    if (atMatch) {
      title = atMatch[1].trim();
      company = atMatch[2].trim();
    } else {
      title = text.trim();
    }
    return { company, title, startDate, endDate };
  };
  if (Array.isArray(source)) {
    return source
      .map((s) => (typeof s === 'string' ? parseEntry(s) : s))
      .filter((e) => e.company || e.startDate || e.endDate);
  }
  const lines = String(source).split(/\r?\n/);
  const entries = [];
  let inSection = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(work|professional)?\s*experience/i.test(trimmed)) {
      inSection = true;
      continue;
    }
    if (!inSection) continue;
    if (/^(education|skills|projects|certifications|summary|objective|awards|interests|languages)/i.test(trimmed)) {
      break;
    }
    if (trimmed === '') {
      continue;
    }
    const jobMatch =
      line.match(/^\s*[-*]\s+(.*)/) || (!line.match(/^\s/) ? [null, trimmed] : null);
    if (jobMatch) {
      const text = jobMatch[1].trim();
      const entry = parseEntry(text);
      const hasCompanyTitleOrDate =
        /\bat\b/i.test(text) ||
        /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b\s+\d{4}\s*[\u2013-]\s*/i.test(text);
      if (hasCompanyTitleOrDate && !(entry.company === '' && entry.startDate === '')) {
        entries.push(entry);
      }
    }
  }
  return entries;
}

function extractEducation(source) {
  if (!source) return [];
  if (Array.isArray(source)) return source.map((s) => String(s));
  const lines = String(source).split(/\r?\n/);
  const entries = [];
  let inSection = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^education/i.test(trimmed)) {
      inSection = true;
      continue;
    }
    if (inSection && /^\s*$/.test(trimmed)) {
      inSection = false;
      continue;
    }
    if (inSection) {
      const match = trimmed.match(/^[-*]\s+(.*)/);
      if (match) {
        entries.push(match[1].trim());
      } else if (trimmed) {
        entries.push(trimmed);
      }
    }
  }
  return entries;
}

function extractCertifications(source) {
  if (!source) return [];

  const parseEntry = (text = '') => {
    const urlMatch = text.match(/https?:\/\/\S+/);
    const url = urlMatch ? urlMatch[0] : '';
    if (url) text = text.replace(url, '').trim();

    let name = '';
    let provider = '';

    const parenMatch = text.match(/^(.*?)\s*\((.*?)\)$/);
    if (parenMatch) {
      name = parenMatch[1].trim();
      provider = parenMatch[2].trim();
    } else {
      const parts = text.split(/[-–—|]/);
      name = parts.shift()?.trim() || '';
      provider = parts.join('-').trim();
    }

    return { name, provider, url };
  };

  if (Array.isArray(source)) {
    return source.map((item) => {
      if (typeof item === 'string') return parseEntry(item);
      const name =
        item.name || item.title || item.certificateName || item.credentialName || '';
      const provider =
        item.provider ||
        item.authority ||
        item.issuingOrganization ||
        item.issuer ||
        item.organization ||
        '';
      let url =
        item.url || item.credentialUrl || item.link || item.certUrl || '';
      if (!url) {
        const found = Object.values(item).find(
          (v) => typeof v === 'string' && /credly\.com/i.test(v)
        );
        if (found) url = found;
      }
      if (url || name || provider) return { name, provider, url };
      return parseEntry(String(item));
    });
  }

  const lines = String(source).split(/\r?\n/);
  const entries = [];
  let inSection = false;
  for (const line of lines) {
    const trimmed = line.trim();
    const credly = trimmed.match(/https?:\/\/\S*credly\.com\/\S*/i);
    if (credly) {
      const clean = trimmed.replace(/^[-*]\s+/, '');
      entries.push(parseEntry(clean));
      continue;
    }
    if (/^certifications?/i.test(trimmed)) {
      inSection = true;
      continue;
    }
    if (inSection && /^\s*$/.test(trimmed)) {
      inSection = false;
      continue;
    }
    if (inSection) {
      const match = trimmed.match(/^[-*]\s+(.*)/);
      if (match) entries.push(parseEntry(match[1].trim()));
      else if (trimmed) entries.push(parseEntry(trimmed));
    }
  }
  return entries;
}

function extractLanguages(source) {
  if (!source) return [];

  const parseEntry = (text = '') => {
    let language = '';
    let proficiency = '';
    const paren = text.match(/^(.*?)\s*\((.*?)\)$/);
    if (paren) {
      language = paren[1].trim();
      proficiency = paren[2].trim();
    } else {
      const parts = text.split(/[-\u2013:|]/);
      language = parts.shift()?.trim() || '';
      proficiency = parts.join('-').trim();
    }
    return { language, proficiency };
  };

  if (Array.isArray(source)) {
    return source
      .map((item) => {
        if (typeof item === 'string') return parseEntry(item);
        const language = item.language || item.name || '';
        const proficiency = item.proficiency || item.level || '';
        if (language || proficiency) return { language, proficiency };
        return parseEntry(String(item));
      })
      .filter((l) => l.language);
  }

  const lines = String(source).split(/\r?\n/);
  const entries = [];
  let inSection = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^languages?/i.test(trimmed)) {
      inSection = true;
      continue;
    }
    if (inSection && /^\s*$/.test(trimmed)) {
      inSection = false;
      continue;
    }
    if (inSection) {
      const match = trimmed.match(/^[-*]\s+(.*)/);
      if (match) entries.push(parseEntry(match[1].trim()));
      else if (trimmed) entries.push(parseEntry(trimmed));
    }
  }
  return entries;
}

export {
  parseLine,
  parseContent,
  ensureRequiredSections,
  splitSkills,
  mergeDuplicateSections,
  pruneEmptySections,
  extractExperience,
  extractEducation,
  extractCertifications,
  extractLanguages,
  normalizeHeading,
};
