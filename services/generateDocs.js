import puppeteer from 'puppeteer';
import mammoth from 'mammoth';
import { Document, Packer, Paragraph } from 'docx';
import { PUPPETEER_HEADLESS, PUPPETEER_ARGS } from '../config/puppeteer.js';

async function buildDocxBuffer(text, variant) {
  const paragraphs = text.split(/\n+/).map((line) => new Paragraph(line));
  const doc = new Document({ sections: [{ children: paragraphs }] });
  return Packer.toBuffer(doc);
}

export async function generateDocx(text, variant) {
  return buildDocxBuffer(text, variant);
}

export async function generatePdf(text, variant) {
  const docxBuf = await buildDocxBuffer(text, variant);
  const { value: html } = await mammoth.convertToHtml({ buffer: docxBuf });
  const browser = await puppeteer.launch({ headless: PUPPETEER_HEADLESS, args: PUPPETEER_ARGS });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    return await page.pdf({ format: 'A4', printBackground: true });
  } finally {
    await browser.close();
  }
}
