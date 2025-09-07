import multer from 'multer';
import path from 'path';
import net from 'net';
import dns from 'dns';

// Multer configuration for resume uploads. Accepts PDFs and DOCX.
const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.doc') {
      return cb(
        new Error(
          'Legacy .doc files are not supported. Please upload a .pdf or .docx file.'
        )
      );
    }
    const allowed = ['.pdf', '.docx'];
    if (!allowed.includes(ext)) {
      return cb(new Error('Only .pdf and .docx files are allowed'));
    }
    cb(null, true);
  }
});

const uploadMiddleware = upload.single('resume');

function detectMime(buffer) {
  if (!buffer || buffer.length < 4) return null;
  const header = buffer.slice(0, 4).toString('binary');
  if (header === '%PDF') return 'application/pdf';
  if (header === 'PK\u0003\u0004') {
    const ascii = buffer.toString('ascii');
    if (ascii.includes('[Content_Types].xml') && ascii.includes('word/')) {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
  }
  return null;
}

function uploadResume(req, res, cb) {
  uploadMiddleware(req, res, (err) => {
    if (err) return cb(err);
    if (!req.file) return cb(null);
    const detected = detectMime(req.file.buffer);
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (!detected || !allowed.includes(detected)) {
      return cb(new Error('Invalid file type. Only .pdf and .docx files are allowed'));
    }
    req.file.mimetype = detected;
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
    if (host === 'localhost') return null;
    let ip = host;
    let ipVersion = net.isIP(host);
    if (!ipVersion) {
      try {
        const { address, family } = await dns.promises.lookup(host);
        ip = address;
        ipVersion = family;
      } catch {
        return null;
      }
    }
    if (ipVersion === 4) {
      if (
        /^0\./.test(ip) ||
        /^10\./.test(ip) ||
        /^127\./.test(ip) ||
        /^169\.254\./.test(ip) ||
        /^192\.168\./.test(ip) ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)
      )
        return null;
    } else if (ipVersion === 6) {
      if (
        /^fc00:/i.test(ip) ||
        /^fd00:/i.test(ip) ||
        /^fe80:/i.test(ip) ||
        ip === '::1'
      )
        return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export { uploadResume, parseUserAgent, validateUrl };
