function toLowerSafe(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function detectPdfSignature(bytes) {
  if (!bytes || typeof bytes.length !== 'number') {
    return false
  }
  if (bytes.length < 4) {
    return false
  }
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46
}

export async function normalizePdfBlob(blob, { contentType = '' } = {}) {
  if (!blob) {
    const error = new Error('Downloaded document is unavailable.')
    error.code = 'EMPTY_PDF_CONTENT'
    throw error
  }

  const declaredType = toLowerSafe(contentType) || toLowerSafe(blob.type)
  const suspiciousTextType =
    declaredType.startsWith('text/') ||
    declaredType === 'application/json' ||
    declaredType === 'application/xml'

  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  if (!bytes.length) {
    const error = new Error('Downloaded document is empty.')
    error.code = 'EMPTY_PDF_CONTENT'
    throw error
  }

  if (!detectPdfSignature(bytes)) {
    const error = new Error(
      suspiciousTextType
        ? 'Received text content instead of a PDF document.'
        : 'Downloaded document is not a valid PDF.'
    )
    error.code = suspiciousTextType ? 'NON_PDF_CONTENT' : 'INVALID_PDF_SIGNATURE'
    throw error
  }

  if (declaredType.includes('pdf') && toLowerSafe(blob.type).includes('pdf')) {
    return { blob, contentType: 'application/pdf' }
  }

  return { blob: new Blob([bytes], { type: 'application/pdf' }), contentType: 'application/pdf' }
}

export default normalizePdfBlob
