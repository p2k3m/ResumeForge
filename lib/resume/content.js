/**
 * Utilities for parsing resume content into normalized structures that can be
 * shared across services.  These helpers were migrated from `server.js` to
 * ensure that parsing logic lives inside the reusable library layer.
 */

function stripUrlPunctuation(url = '') {
  let trimmed = String(url || '').trim();
  trimmed = trimmed.replace(/^[\[({<]+/, '');
  while (/[)>.,;:!]+$/.test(trimmed)) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed;
}

function normalizeUrl(url = '') {
  let trimmed = stripUrlPunctuation(url);
  if (!trimmed) return '';
  if (/^(?:https?|mailto|tel):/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (trimmed.startsWith('/')) return `https://www.credly.com${trimmed}`;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  if (/^(?:[a-z0-9.-]*\.)?linkedin\.com/i.test(trimmed)) return `https://${trimmed}`;
  if (/^(?:[a-z0-9.-]*\.)?credly\.com/i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

function detectLikelyLocation(text = '') {
  if (!text) return '';
  const lines = String(text)
    .split(/\r?\n/)
    .slice(0, 8)
    .map((line) => line.replace(/[\u2022•*-]+\s*/, '').trim())
    .filter(Boolean);
  for (const line of lines) {
    if (/^(?:email|phone|linkedin|github|portfolio|website)/i.test(line)) {
      continue;
    }
    const normalized = line.replace(/\s+/g, ' ');
    const cityStateMatch = normalized.match(
      /\b([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+)*)\s*,\s*([A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?|[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+)*)\b/
    );
    if (cityStateMatch) {
      const value = cityStateMatch[0].replace(/\s{2,}/g, ' ').trim();
      if (value && value.length <= 60) return value;
    }
  }
  return '';
}

function extractContactDetails(text = '', linkedinProfileUrl = '') {
  const result = {
    email: '',
    phone: '',
    linkedin: '',
    cityState: '',
    contactLines: [],
  };

  if (text) {
    const emailMatch = String(text).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (emailMatch) {
      result.email = emailMatch[0];
    }

    const phoneMatch = String(text).match(/(\+?\d[\d\s().-]{7,}\d)/);
    if (phoneMatch) {
      result.phone = phoneMatch[0].replace(/\s+/g, ' ').trim();
    }

    if (!result.linkedin) {
      const lines = String(text)
        .split(/\r?\n/)
        .slice(0, 12);
      for (const line of lines) {
        const parsed = parseContactLine(line);
        const label = parsed?.label || '';
        const value = parsed?.value || '';
        if (/linkedin/i.test(label)) {
          const normalized = normalizeUrl(value);
          if (normalized) {
            result.linkedin = normalized;
            break;
          }
        }
        if (!result.linkedin && value) {
          const rawMatch = value.match(
            /((?:https?:\/\/|www\.)?(?:[a-z0-9.-]*\.)?linkedin\.com\/[\w\-/%?#=&.+]+)/i
          );
          if (rawMatch) {
            const normalized = normalizeUrl(rawMatch[1]);
            if (normalized) {
              result.linkedin = normalized;
              break;
            }
          }
        }
      }
    }

    if (!result.linkedin) {
      const rawMatch = String(text).match(
        /((?:https?:\/\/|www\.)?(?:[a-z0-9.-]*\.)?linkedin\.com\/[\w\-/%?#=&.+]+)/i
      );
      if (rawMatch) {
        const normalized = normalizeUrl(rawMatch[1]);
        if (normalized) {
          result.linkedin = normalized;
        }
      }
    }
  }

  const normalizedLinkedIn = normalizeUrl(linkedinProfileUrl);
  if (normalizedLinkedIn) {
    result.linkedin = normalizedLinkedIn;
  }

  const location = detectLikelyLocation(text);
  if (location) {
    result.cityState = location;
  }

  const seen = new Set();
  const pushLine = (label, value) => {
    if (!value) return;
    const trimmed = String(value).trim();
    if (!trimmed) return;
    const key = `${label}:${trimmed}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.contactLines.push(`${label}: ${trimmed}`);
  };

  pushLine('Email', result.email);
  pushLine('Phone', result.phone);
  pushLine('LinkedIn', result.linkedin);
  pushLine('Location', result.cityState);

  return result;
}

function parseContactLine(line) {
  if (!line) return null;
  const trimmed = String(line).replace(/^[\s\u2022•*-]+/, '').trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^([^:]+):\s*(.+)$/);
  if (match) {
    return { label: match[1].trim(), value: match[2].trim() };
  }
  return { label: '', value: trimmed };
}

function dedupeContactLines(lines = []) {
  const seen = new Set();
  const result = [];
  for (const line of lines || []) {
    if (!line) continue;
    const trimmed = String(line).trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

const SENSITIVE_CONTACT_PATTERNS = [/linkedin/i, /credly/i, /\bjd\b/i];

function filterSensitiveContactLines(lines = []) {
  if (!Array.isArray(lines)) {
    return [];
  }

  return lines
    .map((line) => (typeof line === 'string' ? line.trim() : ''))
    .filter((line) => {
      if (!line) {
        return false;
      }
      const lower = line.toLowerCase();
      const containsSensitiveLabel = SENSITIVE_CONTACT_PATTERNS.some((pattern) => pattern.test(lower));
      if (!containsSensitiveLabel) {
        return true;
      }
      const hasUrl = /(https?:\/\/|www\.)/i.test(line);
      if (hasUrl) {
        return false;
      }
      if (lower.includes('linkedin') || lower.includes('credly')) {
        return false;
      }
      return true;
    });
}

function buildTemplateContactContext({ text = '', options = {}, templateParams = {} } = {}) {
  const explicitContactDetails =
    options && typeof options.contactDetails === 'object'
      ? options.contactDetails
      : null;
  const templateContact =
    templateParams && typeof templateParams.contact === 'object'
      ? templateParams.contact
      : {};
  const linkedinHint =
    options?.linkedinProfileUrl ||
    templateParams?.linkedin ||
    templateContact?.linkedin ||
    explicitContactDetails?.linkedin ||
    '';

  const contactDetails =
    explicitContactDetails && typeof explicitContactDetails === 'object'
      ? {
          email: explicitContactDetails.email || '',
          phone: explicitContactDetails.phone || '',
          linkedin: explicitContactDetails.linkedin || '',
          cityState: explicitContactDetails.cityState || '',
          contactLines: Array.isArray(explicitContactDetails.contactLines)
            ? [...explicitContactDetails.contactLines]
            : [],
        }
      : extractContactDetails(text, linkedinHint);

  const contactLines = dedupeContactLines([
    ...(Array.isArray(options?.contactLines) ? options.contactLines : []),
    ...(Array.isArray(contactDetails.contactLines) ? contactDetails.contactLines : []),
  ]);

  const fieldValues = {
    email: contactDetails.email || '',
    phone: contactDetails.phone || '',
    linkedin: contactDetails.linkedin || linkedinHint || '',
    cityState: contactDetails.cityState || '',
  };

  const applyOverride = (key, value, { normalizeLinkedIn = false } = {}) => {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (!trimmed) return;
    if (!fieldValues[key]) {
      fieldValues[key] = normalizeLinkedIn ? normalizeUrl(trimmed) || trimmed : trimmed;
    }
  };

  applyOverride('email', templateContact.email);
  applyOverride('phone', templateContact.phone);
  applyOverride('linkedin', templateContact.linkedin, { normalizeLinkedIn: true });
  applyOverride('cityState', templateContact.cityState);

  applyOverride('email', templateParams.email);
  applyOverride('phone', templateParams.phone);
  applyOverride('linkedin', templateParams.linkedin, { normalizeLinkedIn: true });
  applyOverride('cityState', templateParams.cityState);

  applyOverride('email', options?.email);
  applyOverride('phone', options?.phone);
  applyOverride('linkedin', options?.linkedinProfileUrl, { normalizeLinkedIn: true });
  applyOverride('linkedin', options?.linkedin, { normalizeLinkedIn: true });
  applyOverride('cityState', options?.cityState);

  for (const line of contactLines) {
    const parsed = parseContactLine(line);
    if (!parsed) continue;
    const label = parsed.label.toLowerCase();
    if (/mail/.test(label)) applyOverride('email', parsed.value);
    else if (/(phone|mobile|tel|contact)/.test(label)) applyOverride('phone', parsed.value);
    else if (/linkedin/.test(label))
      applyOverride('linkedin', parsed.value, { normalizeLinkedIn: true });
    else if (/(city|location|based|address)/.test(label)) applyOverride('cityState', parsed.value);
    else if (!parsed.label) {
      const inferredLocation = detectLikelyLocation(parsed.value);
      if (inferredLocation) applyOverride('cityState', inferredLocation);
    }
  }

  if (!fieldValues.cityState) {
    const inferredFromLines = contactLines
      .map((line) => detectLikelyLocation(line))
      .find((value) => value);
    if (inferredFromLines) fieldValues.cityState = inferredFromLines;
  }

  if (!fieldValues.cityState) {
    const fallbackLocation = detectLikelyLocation(text);
    if (fallbackLocation) fieldValues.cityState = fallbackLocation;
  }

  const normalizedLines = dedupeContactLines([
    ...contactLines,
    fieldValues.email ? `Email: ${fieldValues.email}` : null,
    fieldValues.phone ? `Phone: ${fieldValues.phone}` : null,
    fieldValues.linkedin ? `LinkedIn: ${fieldValues.linkedin}` : null,
    fieldValues.cityState ? `Location: ${fieldValues.cityState}` : null,
  ]);

  return { fieldValues, contactLines: normalizedLines };
}

function parseLine(text, options = {}) {
  const preserveLinkText = Boolean(options?.preserveLinkText);
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
      const linkRegex =
        /\[([^\]]+)\]\((https?:\/\/\S+?)\)|(https?:\/\/\S+|(?:www\.)?(?:[a-z0-9.-]*linkedin\.com|credly\.com)\S*)/gi;
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
        let leadingParenCount = 0;
        if (match.index > lastIndex) {
          let segment = piece.slice(lastIndex, match.index);
          const leadingParens = segment.match(/\(+$/);
          if (leadingParens) {
            leadingParenCount = leadingParens[0].length;
            segment = segment.slice(0, -leadingParenCount);
          }
          flushSegment(segment);
        }
        if (match[1] && match[2]) {
          const href = normalizeUrl(match[2]);
          if (!href) {
            if (leadingParenCount) {
              flushSegment('('.repeat(leadingParenCount));
            }
            flushSegment(match[0]);
            lastIndex = linkRegex.lastIndex;
            continue;
          }
          tokens.push({
            type: 'link',
            text: match[1].replace(/[*_]/g, ''),
            href,
            continued: true,
            ...(forceBold ? { style: 'bold' } : {})
          });
        } else if (match[3]) {
          let raw = match[3];
          let trailing = '';
          while (/[)>.,;:]+$/.test(raw)) {
            trailing = raw.slice(-1) + trailing;
            raw = raw.slice(0, -1);
          }
          const href = normalizeUrl(raw);
          if (!href) {
            if (leadingParenCount) {
              flushSegment('('.repeat(leadingParenCount));
            }
            flushSegment(match[0]);
            lastIndex = linkRegex.lastIndex;
            continue;
          }
          const domainMap = {
            'linkedin.com': 'LinkedIn',
            'github.com': 'GitHub',
            'credly.com': 'Credly'
          };
          let label = raw;
          if (!preserveLinkText) {
            try {
              const hostname = new URL(href).hostname.replace(/^www\./, '');
              label = domainMap[hostname] || href;
            } catch {
              if (/linkedin\.com/i.test(href)) label = 'LinkedIn';
              else if (/credly\.com/i.test(href)) label = 'Credly';
              else label = href;
            }
          }
          tokens.push({
            type: 'link',
            text: label.replace(/[*_]/g, ''),
            href,
            continued: true,
            ...(forceBold ? { style: 'bold' } : {})
          });
          if (trailing) {
            let trailingToFlush = trailing;
            let parensToDrop = leadingParenCount;
            while (parensToDrop > 0 && trailingToFlush.startsWith(')')) {
              trailingToFlush = trailingToFlush.slice(1);
              parensToDrop--;
            }
            if (trailingToFlush) {
              flushSegment(trailingToFlush);
            }
          }
        }
        if (leadingParenCount > 0) {
          while (leadingParenCount > 0 && piece[linkRegex.lastIndex] === ')') {
            linkRegex.lastIndex++;
            leadingParenCount--;
          }
        }
        lastIndex = linkRegex.lastIndex;
      }
      if (lastIndex < piece.length) {
        flushSegment(piece.slice(lastIndex));
      }
    }
  }

  const pipeSegments = text.split('|');
  if (pipeSegments.length > 1) {
    const [firstSegment, ...restSegments] = pipeSegments;
    const leading = firstSegment.trim();
    if (leading) {
      processPart(leading, true);
    }
    restSegments.forEach((segment) => {
      const trimmed = segment.trim();
      if (!trimmed) {
        return;
      }
      if (!leading && tokens.length === 0) {
        processPart(trimmed, true);
        return;
      }
      tokens.push({ type: 'jobsep' });
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
    const remaining = segment.slice(i);
    const enhancementMatch =
      remaining.match(/^\{\{RF_ENH_[A-Za-z0-9_]+\}\}/) ||
      remaining.match(/^\{\{RFENH[A-Za-z0-9]+\}\}/);
    if (enhancementMatch) {
      buffer += enhancementMatch[0];
      i += enhancementMatch[0].length;
      continue;
    }
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
    if (!t?.text) return;
    if (/^\{\{RF_ENH_[A-Za-z0-9_]+\}\}$/.test(t.text)) return;
    if (/^\{\{RFENH[A-Za-z0-9]+\}\}$/.test(t.text)) return;
    t.text = t.text.replace(/[*_]/g, '');
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
      if (jobTitle && additions.length && existing.length === 0) {
        additions[0].title = jobTitle;
      }

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
    ? certSection.items.map((tokens = []) => {
        const text = tokens
          .filter((t) => typeof t.text === 'string' && t.text.trim())
          .map((t) => t.text)
          .join(' ')
          .trim();
        const parsed = extractCertifications([text])[0] || {};
        if (!parsed.url) {
          const linkToken = tokens.find(
            (t) => t && t.type === 'link' && t.href && normalizeUrl(t.href)
          );
          if (linkToken) {
            parsed.url = normalizeUrl(linkToken.href);
          }
        }
        return parsed;
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
    deduped.push({ ...cert, url: normalizeUrl(cert.url) });
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

  const orderedCerts = deduped.sort((a, b) => getCertDate(b) - getCertDate(a));

  const certItems = orderedCerts.map((cert) => {
    const tokens = [{ type: 'bullet' }];
    const text = cert.provider
      ? `${cert.name} - ${cert.provider}`
      : cert.name;
    const href = normalizeUrl(cert.url);
    if (href) {
      tokens.push({ type: 'link', text, href });
    } else {
      tokens.push({ type: 'paragraph', text });
    }
    return tokens;
  });

  const normalizedCredlyProfileUrl = normalizeUrl(credlyProfileUrl);
  if (normalizedCredlyProfileUrl) {
    const alreadyHasProfile = certItems.some((item) =>
      item.some((t) => t.type === 'link' && t.href === normalizedCredlyProfileUrl)
    );
    if (!alreadyHasProfile) {
      certItems.push([
        { type: 'bullet' },
        { type: 'link', text: 'Credly Profile', href: normalizedCredlyProfileUrl },
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
  const jobSet = new Set(
    (jobSkills || [])
      .map((s) => (s == null ? '' : String(s).trim().toLowerCase()))
      .filter(Boolean)
  );
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
    sec.items.forEach((tokens = []) => {
      const text = tokens
        .filter((t) => t.text)
        .map((t) => t.text)
        .join('')
        .trim();
      if (!text) return;
      const parts = /[;,]/.test(text) ? text.split(/[;,]/) : [text];
      const linkTokens = tokens
        .filter((t) => t && t.type === 'link' && t.href && t.text)
        .map((t) => ({ text: t.text.trim(), href: normalizeUrl(t.href) }))
        .filter((entry) => entry.href);
      const normalizeSkillKey = (value = '') =>
        value
          .toLowerCase()
          .replace(/[^a-z0-9+]+/g, ' ')
          .trim();
      parts
        .map((p) => p.trim())
        .filter(Boolean)
        .forEach((skill) => {
          const lower = skill.toLowerCase();
          const normalized = normalizeSkillKey(skill);
          const matchedLink =
            linkTokens.find(
              (link) => normalizeSkillKey(link.text) === normalized
            ) ||
            linkTokens.find((link) =>
              normalizeSkillKey(link.text).includes(normalized)
            ) ||
            linkTokens.find((link) =>
              normalized.includes(normalizeSkillKey(link.text))
            );
          collected.push({
            display: skill,
            lower,
            href: matchedLink ? matchedLink.href : '',
          });
        });
    });
    const uniqMap = new Map();
    collected.forEach((skill) => {
      if (!skill || !skill.lower) return;
      const key = skill.lower;
      if (!uniqMap.has(key)) {
        uniqMap.set(key, { display: skill.display, href: skill.href });
      } else if (skill.href && !uniqMap.get(key).href) {
        uniqMap.get(key).href = skill.href;
      }
    });
    let filtered = Array.from(uniqMap.entries());
    if (jobSet.size) {
      filtered = filtered.filter(([lower]) => jobSet.has(lower));
    }
    const groupMap = new Map();
    filtered.forEach(([lower, value]) => {
      const display = value.display;
      const href = value.href;
      let label = null;
      for (const [cat, members] of Object.entries(SKILL_CATEGORY_MAP)) {
        const all = [cat, ...members];
        if (all.includes(lower)) {
          label = cat;
          break;
        }
      }
      if (label) {
        if (!groupMap.has(label)) {
          groupMap.set(label, [{ display: label, href: '' }]);
        }
        if (lower !== label) {
          groupMap.get(label).push({ display, href });
        }
      } else {
        groupMap.set(display.toLowerCase(), [{ display, href }]);
      }
    });
    const grouped = Array.from(groupMap.values()).map((entries) =>
      entries.filter((entry) => entry && entry.display)
    );
    sec.items = grouped.map((entries) => {
      const tokens = [{ type: 'bullet' }];
      entries.forEach((entry, index) => {
        if (index > 0) {
          tokens.push({ type: 'paragraph', text: ', ' });
        }
        if (entry.href) {
          tokens.push({ type: 'link', text: entry.display, href: entry.href });
        } else {
          tokens.push({ type: 'paragraph', text: entry.display });
        }
      });
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
  const { defaultHeading = 'Summary', preserveLinkText = false, ...rest } = options;
  const parseLineOptions = preserveLinkText ? { preserveLinkText: true } : undefined;
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
          const tokens = parseLine(String(i), parseLineOptions);
          if (!tokens.some((t) => t.type === 'bullet')) tokens.unshift({ type: 'bullet' });
          items.push(tokens);
        });
      } else if (src) {
        const tokens = parseLine(String(src), parseLineOptions);
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
        /^((?:work|professional)\s*experience|education|skills|projects|certification|summary)$/i
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
        current = parseLine(line, parseLineOptions);
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
        current.push(...parseLine(indentMatch[1], parseLineOptions));
        continue;
      }
      if (current.length) currentSection.items.push(current);
      current = parseLine(line.trim(), parseLineOptions);
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

  const normalizeResponsibilities = (responsibilities = []) => {
    if (!Array.isArray(responsibilities)) {
      return [];
    }
    return responsibilities
      .map((line) =>
        typeof line === 'string'
          ? line
              .replace(/^\s*[-*•]\s*/, '')
              .replace(/\s+/g, ' ')
              .trim()
          : ''
      )
      .filter(Boolean);
  };

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
    return { company, title, startDate, endDate, responsibilities: [] };
  };

  if (Array.isArray(source)) {
    return source
      .map((item) => {
        if (!item) return null;
        if (typeof item === 'string') {
          const entry = parseEntry(item);
          if (!entry.responsibilities.length) {
            delete entry.responsibilities;
          }
          return entry;
        }
        if (typeof item === 'object') {
          const base = parseEntry(
            [item.title, item.company].filter(Boolean).join(' at ') || ''
          );
          const responsibilities = normalizeResponsibilities(item.responsibilities);
          const entry = {
            ...base,
            company: item.company || base.company || '',
            title: item.title || base.title || '',
            startDate: item.startDate || base.startDate || '',
            endDate: item.endDate || base.endDate || '',
          };
          if (responsibilities.length) {
            entry.responsibilities = responsibilities;
          }
          return entry;
        }
        return null;
      })
      .filter((entry) => entry && (entry.company || entry.startDate || entry.endDate));
  }

  const lines = String(source).split(/\r?\n/);
  const entries = [];
  let inSection = false;
  let currentEntry = null;

  const pushCurrent = () => {
    if (!currentEntry) return;
    currentEntry.responsibilities = normalizeResponsibilities(
      currentEntry.responsibilities
    );
    entries.push(currentEntry);
    currentEntry = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(work|professional)?\s*experience/i.test(trimmed)) {
      inSection = true;
      continue;
    }
    if (!inSection) continue;
    if (
      /^(education|skills|projects|certifications|summary|objective|awards|interests|languages)/i.test(
        trimmed
      )
    ) {
      pushCurrent();
      break;
    }
    if (!trimmed) {
      continue;
    }

    const bulletMatch = line.match(/^\s*[-*•]\s+(.*)/);
    const jobMatch = bulletMatch || (!line.match(/^\s/) ? [null, trimmed] : null);

    if (jobMatch) {
      const text = jobMatch[1].trim();
      const entry = parseEntry(text);
      const hasCompanyTitleOrDate =
        /\bat\b/i.test(text) ||
        /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b\s+\d{4}\s*[\u2013-]\s*/i.test(
          text
        );

      if (
        hasCompanyTitleOrDate &&
        !(entry.company === '' && entry.startDate === '' && entry.endDate === '')
      ) {
        pushCurrent();
        currentEntry = { ...entry, responsibilities: [] };
        continue;
      }
    }

    if (currentEntry) {
      if (bulletMatch) {
        const responsibility = bulletMatch[1].trim();
        if (responsibility) {
          currentEntry.responsibilities.push(responsibility);
        }
        continue;
      }
      if (/^\s{2,}\S/.test(line)) {
        const responsibility = line.replace(/^\s+/, '').trim();
        if (responsibility) {
          currentEntry.responsibilities.push(responsibility);
        }
        continue;
      }
    }
  }

  pushCurrent();
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
    const urlMatch = text.match(
      /(https?:\/\/\S+|www\.\S+|(?:[a-z0-9.-]*linkedin\.com|credly\.com)\S*)/i
    );
    let url = '';
    if (urlMatch) {
      url = normalizeUrl(urlMatch[0]);
      text = text.replace(urlMatch[0], '').trim();
    }

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
      url = normalizeUrl(url);
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

/**
 * Exported API surface for resume parsing utilities.
 * Consumers should import from this module rather than `server.js`.
 */
export {
  normalizeUrl,
  detectLikelyLocation,
  extractContactDetails,
  parseContactLine,
  dedupeContactLines,
  filterSensitiveContactLines,
  buildTemplateContactContext,
  parseLine,
  normalizeHeading,
  ensureRequiredSections,
  splitSkills,
  moveSummaryJobEntries,
  mergeDuplicateSections,
  pruneEmptySections,
  normalizeName,
  containsContactInfo,
  isJobEntry,
  parseContent,
  extractExperience,
  extractEducation,
  extractCertifications,
};

