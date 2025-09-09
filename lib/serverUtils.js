import multer from 'multer';
import path from 'path';
import net from 'net';
import dns from 'dns';

// Multer configuration for resume uploads. Accepts PDFs, DOC, and DOCX.
const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = ['.pdf', '.doc', '.docx'];
    if (!allowed.includes(ext)) {
      return cb(new Error('Only .pdf, .doc, and .docx files are allowed'));
    }
    cb(null, true);
  }
});

function createUploadMiddleware(field = 'resume') {
  return upload.single(field);
}

function detectMime(buffer) {
  if (!buffer || buffer.length < 8) return null;
  const header4 = buffer.slice(0, 4).toString('binary');
  if (header4 === '%PDF') return 'application/pdf';
  if (header4 === 'PK\u0003\u0004') {
    const ascii = buffer.toString('ascii');
    if (ascii.includes('[Content_Types].xml') && ascii.includes('word/')) {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
  }
  const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  if (buffer.slice(0, 8).equals(ole)) return 'application/msword';
  return null;
}

function detectMacros(buffer = Buffer.from([])) {
  const ascii = buffer.toString('ascii').toLowerCase();
  return ascii.includes('vbaproject') || ascii.includes('macros');
}

function uploadResume(req, res, cb, field = 'resume') {
  const middleware = createUploadMiddleware(field);
  middleware(req, res, (err) => {
    if (err) return cb(err);
    if (!req.file) return cb(null);
    const detected = detectMime(req.file.buffer);
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (!detected || !allowed.includes(detected)) {
      return cb(new Error('Invalid file type. Only .pdf, .doc, and .docx files are allowed'));
    }
    req.file.mimetype = detected;
    req.file.macroWarning = detectMacros(req.file.buffer);
    cb(null);
  });
}

async function parseUserAgent(ua) {
  const fallback = { browser: ua || '', os: ua || '', device: ua || '' };
  if (!ua) return fallback;
  try {
    const { default: UAParser } = await import('ua-parser-js');
    const result = new UAParser(ua).getResult();
    return {
      browser: result.browser?.name || ua,
      os: result.os?.name || ua,
      device: result.device?.model || ua
    };
  } catch {
    return fallback;
  }
}

async function validateUrl(input) {
  try {
    const url = new URL(String(input));
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    if (!net.isIP(host)) {
      try {
        await dns.promises.lookup(host);
      } catch {
        return null;
      }
    }
    return url.toString();
  } catch {
    return null;
  }
}

export { uploadResume, parseUserAgent, validateUrl, detectMacros };
