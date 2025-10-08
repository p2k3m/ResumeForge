import { useMemo } from 'react'
import parseJobDescriptionText from '../utils/parseJobDescriptionText.js'

function JobDescriptionPreview({ text }) {
  const parsed = useMemo(() => parseJobDescriptionText(text), [text])

  if (!parsed) return null

  const { title, sections, keywords, wordCount, meta } = parsed

  return (
    <section
      className="space-y-4 rounded-2xl border border-purple-200 bg-white/70 p-4 text-left shadow-sm"
      data-testid="job-description-preview"
    >
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-purple-900">Job Description Preview</h2>
          <p className="text-sm text-purple-600/80">
            Confirm the parsed JD content below before running the ATS score so we analyse the exact role you pasted.
          </p>
        </div>
        <div className="caps-label flex items-center gap-3 text-xs font-semibold text-purple-500">
          <span data-testid="jd-word-count">{wordCount} words</span>
          {sections.length > 0 && <span data-testid="jd-section-count">{sections.length} sections</span>}
        </div>
      </header>

      <div className="space-y-3 rounded-xl bg-gradient-to-r from-purple-50 to-white p-4">
        <h3 className="text-xl font-bold text-purple-900" data-testid="jd-title">
          {title}
        </h3>
        {meta.length > 0 && (
          <dl className="grid gap-2 text-sm text-purple-700 sm:grid-cols-2" data-testid="jd-meta">
            {meta.map((item) => (
              <div key={`${item.label}-${item.value}`} className="flex items-center gap-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-purple-500">{item.label}</dt>
                <dd className="font-medium text-purple-800">{item.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {keywords.length > 0 && (
          <div className="flex flex-wrap gap-2" data-testid="jd-keywords">
            {keywords.map((keyword) => (
              <span
                key={keyword}
                className="inline-flex items-center rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700"
              >
                {keyword}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        {sections.map((section) => (
          <article key={section.heading} className="space-y-2 rounded-xl border border-purple-100 bg-white/90 p-4">
            <h4 className="caps-label text-sm font-semibold text-purple-500" data-testid="jd-section-title">
              {section.heading}
            </h4>
            <div className="space-y-2 text-sm leading-relaxed text-purple-900" data-testid="jd-section-content">
              {section.paragraphs.map((paragraph, index) => (
                <p key={`paragraph-${index}`}>{paragraph}</p>
              ))}
              {section.bullets.length > 0 && (
                <ul className="list-disc space-y-1 pl-5 marker:text-purple-400">
                  {section.bullets.map((bullet, index) => (
                    <li key={`bullet-${index}`}>{bullet}</li>
                  ))}
                </ul>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

export default JobDescriptionPreview
