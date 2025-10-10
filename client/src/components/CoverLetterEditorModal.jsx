import React from 'react'

function CoverLetterEditorModal({
  isOpen = false,
  label = 'Cover letter',
  draftText = '',
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
        <div className="px-6 py-6 space-y-4 text-indigo-900">
          <textarea
            value={draftText}
            onChange={(event) => onChange(event.target.value)}
            rows={14}
            className="w-full rounded-2xl border border-indigo-200 bg-white/90 px-4 py-3 text-sm leading-relaxed shadow-inner focus:outline-none focus:ring-2 focus:ring-indigo-400"
            placeholder="Introduce yourself, highlight the top accomplishments that match the JD, and close with a confident call to action."
          />
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-indigo-600/80">
                {wordCount} word{wordCount === 1 ? '' : 's'}
              </span>
              <span className={changeBadgeClass}>{hasChanges ? 'Edited' : 'Original draft'}</span>
            </div>
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
