import { describe, expect, it } from '@jest/globals'
import { detectPdfSignature, normalizePdfBlob } from '../../client/src/utils/assetValidation.js'

const createBlob = (body, options = {}) => {
  return new Blob(Array.isArray(body) ? body : [body], options)
}

describe('asset validation utilities', () => {
  it('detects the PDF signature bytes', () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])
    expect(detectPdfSignature(bytes)).toBe(true)
    expect(detectPdfSignature(new Uint8Array([0x50, 0x44, 0x46]))).toBe(false)
    expect(detectPdfSignature(null)).toBe(false)
  })

  it('returns the original blob when already typed as PDF', async () => {
    const pdfBlob = createBlob('%PDF-1.7\nBody', { type: 'application/pdf' })
    const result = await normalizePdfBlob(pdfBlob, { contentType: 'application/pdf' })
    expect(result.contentType).toBe('application/pdf')
    expect(result.blob).toBe(pdfBlob)
  })

  it('relabels generic blobs containing PDF data as PDFs', async () => {
    const pdfBlob = createBlob('%PDF-1.7\nBody', { type: '' })
    const result = await normalizePdfBlob(pdfBlob, { contentType: 'application/octet-stream' })
    expect(result.contentType).toBe('application/pdf')
    expect(result.blob.type).toBe('application/pdf')
    expect(await result.blob.text()).toContain('Body')
  })

  it('throws a descriptive error when text content is returned', async () => {
    const textBlob = createBlob('hello world', { type: 'text/plain' })
    await expect(
      normalizePdfBlob(textBlob, { contentType: 'text/plain; charset=utf-8' })
    ).rejects.toMatchObject({
      code: 'NON_PDF_CONTENT'
    })
  })

  it('throws when the blob lacks a PDF signature', async () => {
    const invalidBlob = createBlob('not a pdf', { type: 'application/pdf' })
    await expect(normalizePdfBlob(invalidBlob, { contentType: 'application/pdf' })).rejects.toMatchObject({
      code: 'INVALID_PDF_SIGNATURE'
    })
  })

  it('throws when the blob is empty', async () => {
    const emptyBlob = createBlob([], { type: 'application/pdf' })
    await expect(normalizePdfBlob(emptyBlob, { contentType: 'application/pdf' })).rejects.toMatchObject({
      code: 'EMPTY_PDF_CONTENT'
    })
  })
})
