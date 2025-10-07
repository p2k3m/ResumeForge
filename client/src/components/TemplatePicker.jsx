import TemplateSelector from './TemplateSelector.jsx'
import TemplatePreview from './TemplatePreview.jsx'

function TemplatePicker({
  context = 'improvements',
  resumeOptions = [],
  resumeHistorySummary = '',
  selectedResumeTemplateId,
  selectedResumeTemplateName,
  selectedResumeTemplateDescription = '',
  onResumeTemplateSelect,
  coverOptions = [],
  selectedCoverTemplateId,
  selectedCoverTemplateName,
  selectedCoverTemplateDescription = '',
  onCoverTemplateSelect,
  isCoverLinkedToResume = true,
  onCoverLinkToggle,
  disabled = false,
  isApplying = false
}) {
  const resumeSelectorIdPrefix =
    context === 'downloads' ? 'download-resume-template-selector' : 'resume-template-selector'
  const coverSelectorIdPrefix =
    context === 'downloads' ? 'download-cover-template-selector' : 'cover-template-selector'

  const hasResumeOptions = Array.isArray(resumeOptions) && resumeOptions.length > 0
  const hasCoverOptions = Array.isArray(coverOptions) && coverOptions.length > 0
  const showPreview = hasResumeOptions || hasCoverOptions

  const coverSelectorDescription = isCoverLinkedToResume
    ? 'Cover letters mirror your selected CV template. Choose another style or switch off “Match CV style” to decouple them.'
    : 'Choose a cover letter design to use even if your CV keeps a different look.'

  const handleCoverLinkChange = (event) => {
    const nextValue = event.target.checked
    onCoverLinkToggle?.(nextValue)
  }

  return (
    <>
      {hasResumeOptions && (
        <TemplateSelector
          idPrefix={resumeSelectorIdPrefix}
          title="CV Template Style"
          description="Choose the CV aesthetic that mirrors your personality and the JD tone."
          options={resumeOptions}
          selectedTemplate={selectedResumeTemplateId}
          onSelect={onResumeTemplateSelect}
          disabled={disabled}
          historySummary={resumeHistorySummary}
        />
      )}

      {hasCoverOptions && (
        <div className="space-y-3">
          {typeof onCoverLinkToggle === 'function' && (
            <div className="rounded-2xl border border-purple-100 bg-purple-50/50 p-3">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-purple-300 text-purple-600 focus:ring-purple-400"
                  checked={isCoverLinkedToResume}
                  onChange={handleCoverLinkChange}
                  disabled={disabled}
                />
                <span>
                  <span className="block text-sm font-semibold text-purple-700">
                    Match cover letter style to CV template
                  </span>
                  <span className="mt-1 block text-xs text-purple-600">
                    Uncheck or pick a new cover letter template to mix and match styles.
                  </span>
                </span>
              </label>
            </div>
          )}

          <TemplateSelector
            idPrefix={coverSelectorIdPrefix}
            title="Cover Letter Template"
            description={coverSelectorDescription}
            options={coverOptions}
            selectedTemplate={selectedCoverTemplateId}
            onSelect={onCoverTemplateSelect}
            disabled={disabled}
          />
        </div>
      )}

      {showPreview && (
        <TemplatePreview
          resumeTemplateId={selectedResumeTemplateId}
          resumeTemplateName={selectedResumeTemplateName}
          resumeTemplateDescription={selectedResumeTemplateDescription}
          coverTemplateId={selectedCoverTemplateId}
          coverTemplateName={selectedCoverTemplateName}
          coverTemplateDescription={selectedCoverTemplateDescription}
          availableResumeTemplates={resumeOptions}
          availableCoverTemplates={coverOptions}
          onResumeTemplateApply={onResumeTemplateSelect}
          onCoverTemplateApply={onCoverTemplateSelect}
          isCoverLinkedToResume={isCoverLinkedToResume}
          isApplying={isApplying}
        />
      )}
    </>
  )
}

export default TemplatePicker
