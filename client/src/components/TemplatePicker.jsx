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
        <TemplateSelector
          idPrefix={coverSelectorIdPrefix}
          title="Cover Letter Template"
          description="Align your letter visuals with your selected CV or explore a bold alternative."
          options={coverOptions}
          selectedTemplate={selectedCoverTemplateId}
          onSelect={onCoverTemplateSelect}
          disabled={disabled}
        />
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
          isApplying={isApplying}
        />
      )}
    </>
  )
}

export default TemplatePicker
