export const LAMBDA_PROCESSING_ERROR_MESSAGE =
  'Our Lambda resume engine is temporarily unavailable. Please try again shortly.'

export const CV_GENERATION_ERROR_MESSAGE =
  'Our Lambda resume engine could not generate your PDFs. Please try again shortly.'

export const COVER_LETTER_GENERATION_ERROR_MESSAGE =
  'Our Lambda resume engine could not generate your cover letter PDF. Please try again shortly.'

export const GEMINI_ENHANCEMENT_ERROR_MESSAGE =
  'Gemini enhancements are temporarily offline. Please try again soon.'

export const S3_STORAGE_ERROR_MESSAGE =
  'Amazon S3 storage is temporarily unavailable. Please try again in a few minutes.'

export const S3_CHANGE_LOG_ERROR_MESSAGE =
  'Amazon S3 is currently unavailable, so we could not save your updates. Please retry shortly.'

export const DOWNLOAD_SESSION_EXPIRED_MESSAGE =
  'Your download session expired. Regenerate the documents to get new links.'

export const API_ERROR_CONTRACTS = Object.freeze({
  INITIAL_UPLOAD_FAILED: {
    code: 'INITIAL_UPLOAD_FAILED',
    friendlyMessage: S3_STORAGE_ERROR_MESSAGE,
    service: 's3',
    step: 'upload'
  },
  STORAGE_UNAVAILABLE: {
    code: 'STORAGE_UNAVAILABLE',
    friendlyMessage: S3_STORAGE_ERROR_MESSAGE,
    service: 's3',
    step: 'download'
  },
  CHANGE_LOG_PERSISTENCE_FAILED: {
    code: 'CHANGE_LOG_PERSISTENCE_FAILED',
    friendlyMessage: S3_CHANGE_LOG_ERROR_MESSAGE,
    service: 's3',
    step: 'enhance'
  },
  DOCUMENT_GENERATION_FAILED: {
    code: 'DOCUMENT_GENERATION_FAILED',
    friendlyMessage: LAMBDA_PROCESSING_ERROR_MESSAGE,
    service: 'lambda',
    step: 'evaluate'
  },
  PROCESSING_FAILED: {
    code: 'PROCESSING_FAILED',
    friendlyMessage: LAMBDA_PROCESSING_ERROR_MESSAGE,
    service: 'lambda',
    step: 'evaluate'
  },
  GENERATION_FAILED: {
    code: 'GENERATION_FAILED',
    friendlyMessage: LAMBDA_PROCESSING_ERROR_MESSAGE,
    service: 'lambda',
    step: 'evaluate'
  },
  PDF_GENERATION_FAILED: {
    code: 'PDF_GENERATION_FAILED',
    friendlyMessage: CV_GENERATION_ERROR_MESSAGE,
    service: 'lambda',
    step: 'evaluate'
  },
  COVER_LETTER_GENERATION_FAILED: {
    code: 'COVER_LETTER_GENERATION_FAILED',
    friendlyMessage: COVER_LETTER_GENERATION_ERROR_MESSAGE,
    service: 'lambda',
    step: 'evaluate'
  },
  AI_RESPONSE_INVALID: {
    code: 'AI_RESPONSE_INVALID',
    friendlyMessage: GEMINI_ENHANCEMENT_ERROR_MESSAGE,
    service: 'gemini',
    step: 'enhance'
  },
  DOWNLOAD_SESSION_EXPIRED: {
    code: 'DOWNLOAD_SESSION_EXPIRED',
    friendlyMessage: DOWNLOAD_SESSION_EXPIRED_MESSAGE,
    service: 's3',
    step: 'download'
  }
})

export function buildServiceErrorFallbackMessages(contracts = API_ERROR_CONTRACTS) {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(contracts).map(([code, contract]) => [
        code,
        contract?.friendlyMessage || ''
      ])
    )
  )
}
