import React from 'react'

function CoverLetterEditorModal({
  isOpen = false,
  label = 'Cover letter',
  draftText = '',
  originalText = '',
  hasChanges = false,
  wordCount = 0,
  onClose = () => {},
  onChange = () => {},
  onReset = () => {},
  onCopy = () => {},
  onDownload = () => {},
  isDownloading = false,
  downloadError = '',
  clipboardStatus = ''
}) {
  if (!isOpen) {
    return null
  }

  const title = label || 'Cover letter'
  const originalWordCount = originalText.trim()
    ? originalText
        .trim()
        .split(/\s+/)
        .filter(Boolean).length
    : 0
  const changeBadgeClass = hasChanges
    ? 'inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-700'
    : 'inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${title}`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl rounded-3xl bg-white shadow-2xl border border-indigo-200/70 overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-indigo-100 bg-gradient-to-r from-indigo-50 to-sky-50 px-6 py-4">
          <div>
            <h3 className="text-xl font-semibold text-indigo-900">{title}</h3>
            <p className="mt-1 text-sm text-indigo-700/90">
              Refine the draft text before downloading your personalised PDF.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-semibold text-indigo-700 hover:text-indigo-900"
          >
            Close
          </button>
        </div>
        <div className="px-6 py-6 space-y-6 text-indigo-900">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold uppercase tracking-wide text-indigo-700">
                  Original cover letter
                </h4>
                <span className="text-xs font-medium text-indigo-500">
                  {originalWordCount} word{originalWordCount === 1 ? '' : 's'}
                </span>
              </div>
              <textarea
                id="cover-letter-original"
                value={originalText}
                readOnly
                rows={14}
                className="h-full min-h-[14rem] w-full rounded-2xl border border-indigo-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed shadow-inner text-indigo-700"
                aria-describedby="cover-letter-original-help"
              />
              <p
                id="cover-letter-original-help"
                className="text-xs text-indigo-500"
              >
                {originalText
                  ? 'Reference the original draft while you personalise the enhanced version.'
                  : 'Original draft text is not available yet. Generate a cover letter to populate this view.'}
              </p>
            </div>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-indigo-700">
                    Enhanced cover letter
                  </h4>
                  <span className={changeBadgeClass}>{hasChanges ? 'Edited' : 'Original draft'}</span>
                </div>
                <span className="text-xs font-medium text-indigo-500">
                  {wordCount} word{wordCount === 1 ? '' : 's'}
                </span>
              </div>
              <textarea
                id="cover-letter-enhanced"
                value={draftText}
                onChange={(event) => onChange(event.target.value)}
                rows={14}
                className="h-full min-h-[14rem] w-full rounded-2xl border border-indigo-200 bg-white/90 px-4 py-3 text-sm leading-relaxed shadow-inner focus:outline-none focus:ring-2 focus:ring-indigo-400"
                placeholder="Introduce yourself, highlight the top accomplishments that match the JD, and close with a confident call to action."
              />
            </div>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between text-sm">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onReset}
                className="px-4 py-2 rounded-xl border border-indigo-200 text-indigo-700 hover:bg-indigo-50"
              >
                Reset to original
              </button>
              <button
                type="button"
                onClick={onCopy}
                className="px-4 py-2 rounded-xl border border-indigo-200 text-indigo-700 hover:bg-indigo-50"
              >
                Copy to clipboard
              </button>
              <button
                type="button"
                onClick={onDownload}
                disabled={isDownloading}
                className={`px-4 py-2 rounded-xl font-semibold text-white shadow ${
                  isDownloading ? 'bg-indigo-300 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {isDownloading ? 'Preparing PDF…' : 'Download updated PDF'}
              </button>
            </div>
          </div>
          {downloadError && (
            <p className="text-sm font-medium text-rose-600">{downloadError}</p>
          )}
          {clipboardStatus && (
            <p className="text-sm text-indigo-600/80">{clipboardStatus}</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default CoverLetterEditorModal
