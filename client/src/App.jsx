import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { formatMatchMessage } from './formatMatchMessage.js'
import { buildApiUrl, resolveApiBase } from './resolveApiBase.js'
import ATSScoreDashboard from './components/ATSScoreDashboard.jsx'
import TemplateSelector from './components/TemplateSelector.jsx'

const improvementActions = [
  {
    key: 'improve-summary',
    label: 'Improve Summary',
    helper: 'Refresh your summary to mirror the JD tone and keywords.'
  },
  {
    key: 'add-missing-skills',
    label: 'Add Missing Skills',
    helper: 'Blend missing keywords into the skills and experience sections.'
  },
  {
    key: 'change-designation',
    label: 'Change Designation',
    helper: 'Align your visible job title with the target role.'
  },
  {
    key: 'align-experience',
    label: 'Align Experience',
    helper: 'Emphasise accomplishments that mirror the job requirements.'
  },
  {
    key: 'enhance-all',
    label: 'Enhance All',
    helper: 'Apply every improvement in one pass for a best-fit CV.'
  }
]

function summariseItems(items, { limit = 5 } = {}) {
  const list = Array.isArray(items)
    ? items
        .map((item) => (typeof item === 'string' ? item.trim() : String(item || '').trim()))
        .filter(Boolean)
    : []
  if (!list.length) return ''
  const unique = Array.from(new Set(list))
  if (unique.length <= limit) {
    return unique.join(', ')
  }
  const shown = unique.slice(0, limit).join(', ')
  const remaining = unique.length - limit
  return `${shown}, and ${remaining} more`
}

const highlightToneStyles = {
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  info: 'bg-sky-50 border-sky-200 text-sky-800'
}

const templateOptions = [
  {
    id: 'modern',
    name: 'Modern Minimal',
    description: 'Two-column balance, subtle dividers, ATS-safe typography.'
  },
  {
    id: 'professional',
    name: 'Professional Blue',
    description: 'Classic layout with blue accents and bullet precision.'
  },
  {
    id: 'vibrant',
    name: 'Vibrant Gradient',
    description: 'Bold gradients with strong section separation.'
  },
  {
    id: '2025',
    name: '2025 Vision',
    description: 'Latest Inter font styling with responsive grid sections.'
  }
]

function getApiBaseCandidate() {
  if (typeof window !== 'undefined') {
    const fromWindow = window.__RESUMEFORGE_API_BASE_URL__
    if (typeof fromWindow === 'string' && fromWindow.trim()) {
      return fromWindow.trim()
    }

    if (typeof document !== 'undefined') {
      const metaTag = document.querySelector('meta[name="resumeforge-api-base"]')
      const metaContent = metaTag?.content
      if (typeof metaContent === 'string' && metaContent.trim()) {
        return metaContent.trim()
      }
    }
  }

  if (typeof process !== 'undefined' && process.env) {
    if (typeof process.env.VITE_API_BASE_URL === 'string' && process.env.VITE_API_BASE_URL.trim()) {
      return process.env.VITE_API_BASE_URL.trim()
    }
    if (
      typeof process.env.RESUMEFORGE_API_BASE_URL === 'string' &&
      process.env.RESUMEFORGE_API_BASE_URL.trim()
    ) {
      return process.env.RESUMEFORGE_API_BASE_URL.trim()
    }
  }

  return ''
}

function ImprovementCard({ suggestion, onAccept, onReject }) {
  return (
    <div className="rounded-xl bg-white/80 backdrop-blur border border-purple-200/60 shadow p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h4 className="text-lg font-semibold text-purple-800">{suggestion.title}</h4>
          <p className="text-xs uppercase tracking-wide text-purple-500">
            Confidence: {(suggestion.confidence * 100).toFixed(0)}%
          </p>
        </div>
        {suggestion.accepted !== null && (
          <span
            className={`text-xs px-3 py-1 rounded-full ${
              suggestion.accepted
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-rose-100 text-rose-600'
            }`}
          >
            {suggestion.accepted ? 'Accepted' : 'Rejected'}
          </span>
        )}
      </div>
      <p className="text-sm text-purple-900/80 leading-relaxed">{suggestion.explanation}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
          <p className="text-xs uppercase font-semibold text-purple-500">Before</p>
          <p className="mt-1 text-purple-800 whitespace-pre-wrap">{suggestion.beforeExcerpt || '—'}</p>
        </div>
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
          <p className="text-xs uppercase font-semibold text-indigo-500">After</p>
          <p className="mt-1 text-indigo-800 whitespace-pre-wrap">{suggestion.afterExcerpt || '—'}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-3 justify-end pt-2">
        <button
          type="button"
          onClick={onReject}
          className="px-4 py-2 rounded-full text-sm font-medium border border-rose-300 text-rose-600 hover:bg-rose-50"
        >
          Reject
        </button>
        <button
          type="button"
          onClick={onAccept}
          className="px-4 py-2 rounded-full text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700"
        >
          Accept
        </button>
      </div>
    </div>
  )
}

function App() {
  const [profileUrl, setProfileUrl] = useState('')
  const [jobUrl, setJobUrl] = useState('')
  const [credlyUrl, setCredlyUrl] = useState('')
  const [manualJobDescription, setManualJobDescription] = useState('')
  const [manualJobDescriptionRequired, setManualJobDescriptionRequired] = useState(false)
  const [manualCertificatesInput, setManualCertificatesInput] = useState('')
  const [cvFile, setCvFile] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [outputFiles, setOutputFiles] = useState([])
  const [match, setMatch] = useState(null)
  const [scoreBreakdown, setScoreBreakdown] = useState([])
  const [resumeText, setResumeText] = useState('')
  const [jobDescriptionText, setJobDescriptionText] = useState('')
  const [jobSkills, setJobSkills] = useState([])
  const [resumeSkills, setResumeSkills] = useState([])
  const [knownCertificates, setKnownCertificates] = useState([])
  const [manualCertificatesData, setManualCertificatesData] = useState([])
  const [certificateInsights, setCertificateInsights] = useState(null)
  const [selectionInsights, setSelectionInsights] = useState(null)
  const [improvementResults, setImprovementResults] = useState([])
  const [activeImprovement, setActiveImprovement] = useState('')
  const [error, setError] = useState('')
  const [queuedMessage, setQueuedMessage] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('modern')
  const improvementLockRef = useRef(false)

  const rawBaseUrl = useMemo(() => getApiBaseCandidate(), [])
  const API_BASE_URL = useMemo(() => resolveApiBase(rawBaseUrl), [rawBaseUrl])

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return undefined
    }

    const handleMessage = (event) => {
      const data = event.data
      if (!data || typeof data !== 'object') return

      if (data.type === 'OFFLINE_UPLOAD_COMPLETE') {
        const payload = data.payload || {}
        setQueuedMessage(
          payload.message || data.message || 'Upload processed after reconnection.'
        )
        setIsProcessing(false)
        setError('')
        setOutputFiles(Array.isArray(payload.urls) ? payload.urls : [])
        setMatch(payload.match || null)
      } else if (data.type === 'OFFLINE_UPLOAD_FAILED') {
        setQueuedMessage('')
        setIsProcessing(false)
        setError(data.message || 'Failed to process queued upload. Please try again.')
      }
    }

    navigator.serviceWorker.addEventListener('message', handleMessage)

    navigator.serviceWorker.ready
      .then((registration) => {
        registration.active?.postMessage({ type: 'RETRY_UPLOADS' })
      })
      .catch(() => {})

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage)
    }
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && !file.name.toLowerCase().match(/\.(pdf|docx?)$/)) {
      setError('Only PDF, DOC, or DOCX files are supported.')
      return
    }
    if (file) setCvFile(file)
  }, [])

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file && !file.name.toLowerCase().match(/\.(pdf|docx?)$/)) {
      setError('Only PDF, DOC, or DOCX files are supported.')
      return
    }
    if (file) setCvFile(file)
  }

  const resetAnalysisState = () => {
    setOutputFiles([])
    setMatch(null)
    setScoreBreakdown([])
    setResumeText('')
    setJobDescriptionText('')
    setJobSkills([])
    setResumeSkills([])
    setKnownCertificates([])
    setManualCertificatesData([])
    setCertificateInsights(null)
    setSelectionInsights(null)
    setImprovementResults([])
  }

  const handleSubmit = async () => {
    if (!cvFile) {
      setError('Please upload a CV before submitting.')
      return
    }
    if (manualJobDescriptionRequired && !manualJobDescription.trim()) {
      setError('Please paste the full job description before continuing.')
      return
    }

    setIsProcessing(true)
    setError('')
    setMatch(null)
    setQueuedMessage('')
    resetAnalysisState()

    try {
      const formData = new FormData()
      formData.append('resume', cvFile)
      formData.append('linkedinProfileUrl', profileUrl)
      formData.append('jobDescriptionUrl', jobUrl)
      if (manualJobDescription.trim()) {
        formData.append('manualJobDescription', manualJobDescription.trim())
      }
      if (credlyUrl) formData.append('credlyProfileUrl', credlyUrl)
      if (manualCertificatesInput.trim()) {
        formData.append('manualCertificates', manualCertificatesInput.trim())
      }
      if (selectedTemplate) {
        formData.append('template', selectedTemplate)
      }

      const requestUrl = buildApiUrl(API_BASE_URL, '/api/process-cv')

      const response = await fetch(requestUrl, {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        let message = 'Request failed'
        let manualFallbackTriggered = false
        try {
          const data = await response.json()
          const apiMessage =
            (typeof data?.error === 'string' && data.error) ||
            data?.error?.message ||
            data?.message
          if (apiMessage) {
            message = apiMessage
          }
          if (data?.error?.code && data?.error?.code !== 'PROCESSING_FAILED') {
            message = `${message} (${data.error.code})`
          }
          if (data?.error?.details?.manualInputRequired) {
            manualFallbackTriggered = true
          }
        } catch {
          try {
            const text = await response.text()
            if (text) message = text
          } catch {}
        }
        if (manualFallbackTriggered) {
          setManualJobDescriptionRequired(true)
        }
        console.error('Resume processing request failed', {
          status: response.status,
          statusText: response.statusText,
          message
        })
        throw new Error(message)
      }

      const contentType = response.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        const text = await response.text()
        throw new Error(text || 'Invalid JSON response')
      }

      const data = await response.json()

      if (response.status === 202 && data?.queued) {
        setQueuedMessage(
          data.message ||
            'You are offline. The upload will resume automatically once you reconnect.'
        )
        return
      }

      setOutputFiles(data.urls || [])
      setManualJobDescriptionRequired(false)
      setMatch({
        table: data.table || [],
        addedSkills: data.addedSkills || [],
        missingSkills: data.missingSkills || [],
        originalScore: data.originalScore || 0,
        enhancedScore: data.enhancedScore || 0,
        originalTitle: data.originalTitle || '',
        modifiedTitle: data.modifiedTitle || '',
        selectionProbability:
          typeof data.selectionProbability === 'number'
            ? data.selectionProbability
            : typeof data.selectionInsights?.probability === 'number'
              ? data.selectionInsights.probability
              : null
      })
      const breakdownArray = Array.isArray(data.scoreBreakdown)
        ? data.scoreBreakdown
        : Object.values(data.scoreBreakdown || {})
      setScoreBreakdown(breakdownArray)
      setResumeText(data.resumeText || '')
      setJobDescriptionText(data.jobDescriptionText || '')
      setJobSkills(data.jobSkills || [])
      setResumeSkills(data.resumeSkills || [])
      setKnownCertificates((data.certificateInsights?.known || []).map((cert) => ({
        ...cert,
        source: cert.source || 'resume'
      })))
      setManualCertificatesData(data.manualCertificates || [])
      setCertificateInsights(data.certificateInsights || null)
      setSelectionInsights(data.selectionInsights || null)
    } catch (err) {
      console.error('Unable to enhance CV', err)
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  const improvementAvailable = resumeText && jobDescriptionText
  const improvementBusy = Boolean(activeImprovement)
  const manualJobDescriptionActive =
    manualJobDescriptionRequired || manualJobDescription.trim().length > 0

  const analysisHighlights = useMemo(() => {
    const items = []
    if (Array.isArray(match?.missingSkills) && match.missingSkills.length > 0) {
      items.push({
        key: 'missing-skills',
        tone: 'warning',
        title: 'Missing skills',
        message: `Add ${summariseItems(match.missingSkills, { limit: 6 })} to mirror the JD keywords.`
      })
    }
    if (
      match?.originalTitle &&
      match?.modifiedTitle &&
      match.modifiedTitle !== match.originalTitle
    ) {
      items.push({
        key: 'designation-mismatch',
        tone: 'info',
        title: 'Designation mismatch',
        message: `Resume lists ${match.originalTitle}; align it with the target designation ${match.modifiedTitle}.`
      })
    }
    const addedSkills = Array.isArray(match?.addedSkills) ? match.addedSkills : []
    if (addedSkills.length > 0) {
      items.push({
        key: 'added-skills',
        tone: 'success',
        title: 'Highlights added',
        message: `Enhanced drafts now surface ${summariseItems(addedSkills, { limit: 5 })}. Review them before the interview.`
      })
    }
    if (certificateInsights?.manualEntryRequired) {
      items.push({
        key: 'cert-manual',
        tone: 'warning',
        title: 'Missing certifications',
        message:
          'Credly requires authentication. Paste critical certifications manually so we can include them.'
      })
    }
    const recommendedCertificates = Array.isArray(certificateInsights?.suggestions)
      ? certificateInsights.suggestions.filter(Boolean)
      : []
    if (recommendedCertificates.length > 0) {
      items.push({
        key: 'cert-suggestions',
        tone: 'info',
        title: 'Recommended certifications',
        message: `Consider adding ${summariseItems(recommendedCertificates, { limit: 4 })} to strengthen the match.`
      })
    }
    return items
  }, [match, certificateInsights])

  const handleImprovementClick = async (type) => {
    if (improvementLockRef.current) {
      setError('Please wait for the current improvement to finish before requesting another one.')
      return
    }
    if (!improvementAvailable) {
      setError('Run the main CV analysis first so we can personalise the improvements.')
      return
    }
    improvementLockRef.current = true
    setActiveImprovement(type)
    setError('')
    try {
      const requestUrl = buildApiUrl(API_BASE_URL, `/api/${type}`)
      const payload = {
        resumeText,
        jobDescription: jobDescriptionText,
        jobTitle: match?.modifiedTitle || match?.originalTitle || '',
        currentTitle: match?.modifiedTitle || match?.originalTitle || '',
        jobSkills,
        resumeSkills,
        missingSkills: match?.missingSkills || [],
        knownCertificates,
        manualCertificates: manualCertificatesData
      }
      if (manualCertificatesInput.trim()) {
        payload.manualCertificates = manualCertificatesInput.trim()
      }

      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errPayload = await response.json().catch(() => ({}))
        const message =
          errPayload?.message || errPayload?.error || 'Unable to generate improvement.'
        throw new Error(message)
      }

      const data = await response.json()
      const suggestion = {
        id: `${type}-${Date.now()}`,
        type,
        title:
          data.title || improvementActions.find((action) => action.key === type)?.label || 'Improvement',
        beforeExcerpt: data.beforeExcerpt || '',
        afterExcerpt: data.afterExcerpt || '',
        explanation: data.explanation || 'Change generated successfully.',
        updatedResume: data.updatedResume || resumeText,
        confidence: typeof data.confidence === 'number' ? data.confidence : 0.6,
        accepted: null
      }
      setImprovementResults((prev) => [suggestion, ...prev])
    } catch (err) {
      console.error('Improvement request failed', err)
      setError(err.message || 'Unable to generate the requested improvement.')
    } finally {
      setActiveImprovement('')
      improvementLockRef.current = false
    }
  }

  const handleAcceptImprovement = (id) => {
    const suggestion = improvementResults.find((item) => item.id === id)
    setImprovementResults((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, accepted: true } : item
      )
    )
    if (suggestion?.updatedResume) {
      setResumeText(suggestion.updatedResume)
    }
  }

  const handleRejectImprovement = (id) => {
    setImprovementResults((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, accepted: false } : item
      )
    )
  }

  const disabled = !profileUrl || !jobUrl || !cvFile || isProcessing

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-200 via-purple-200 to-purple-300 flex flex-col items-center p-4 md:p-8">
      <div className="w-full max-w-5xl space-y-8">
        <header className="text-center space-y-2">
          <h1 className="text-4xl md:text-5xl font-black text-purple-900 drop-shadow-sm">
            ResumeForge ATS Optimiser
          </h1>
          <p className="text-purple-800/90 max-w-2xl mx-auto">
            Upload your CV, paste the job description, and instantly receive a five-metric ATS
            breakdown with tailored improvements you can accept or reject.
          </p>
        </header>

        <section className="bg-white/80 backdrop-blur rounded-3xl border border-purple-200/60 shadow-xl p-6 md:p-8 space-y-6">
          <div
            className="w-full p-6 border-2 border-dashed border-purple-300 rounded-2xl text-center bg-gradient-to-r from-white to-purple-50"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            {cvFile ? (
              <p className="text-purple-800 font-semibold">{cvFile.name}</p>
            ) : (
              <p className="text-purple-700">
                Drag and drop your CV here, or click to select (PDF, DOC, or DOCX · max 5MB)
              </p>
            )}
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={handleFileChange}
              className="hidden"
              id="cv-input"
            />
            <label
              htmlFor="cv-input"
              className="inline-flex mt-3 px-4 py-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold cursor-pointer hover:from-indigo-600 hover:to-purple-700"
            >
              Choose File
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="url"
              placeholder="LinkedIn Profile URL"
              value={profileUrl}
              onChange={(e) => setProfileUrl(e.target.value)}
              className="w-full p-3 rounded-xl border border-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
            <input
              type="url"
              placeholder="Job Description URL"
              value={jobUrl}
              onChange={(e) => setJobUrl(e.target.value)}
              className="w-full p-3 rounded-xl border border-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
            {manualJobDescriptionActive && (
              <div className="md:col-span-2 space-y-2">
                <label className="text-sm font-semibold text-purple-700">
                  Paste Full Job Description
                </label>
                <textarea
                  value={manualJobDescription}
                  onChange={(e) => setManualJobDescription(e.target.value)}
                  placeholder="Paste the entire job post when automatic fetching is blocked."
                  className="w-full h-32 p-3 rounded-xl border border-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
                {manualJobDescriptionRequired ? (
                  <p className="text-xs font-semibold text-rose-600">
                    Unable to fetch the JD from the provided link. Paste the description here to continue.
                  </p>
                ) : (
                  <p className="text-xs text-purple-500">
                    We&apos;ll analyse this text directly instead of scraping the URL.
                  </p>
                )}
              </div>
            )}
            <input
              type="url"
              placeholder="Credly Profile URL (optional)"
              value={credlyUrl}
              onChange={(e) => setCredlyUrl(e.target.value)}
              className="w-full p-3 rounded-xl border border-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
            <div className="space-y-2">
              <label className="text-sm font-semibold text-purple-700">Manual Certificates</label>
              <textarea
                value={manualCertificatesInput}
                onChange={(e) => setManualCertificatesInput(e.target.value)}
                placeholder="e.g. AWS Certified Solutions Architect - Amazon; PMP by PMI"
                className="w-full h-24 p-3 rounded-xl border border-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
              <p className="text-xs text-purple-500">
                Paste certificates if Credly is unavailable. Separate entries with commas or new
                lines.
              </p>
            </div>
          </div>

          <TemplateSelector
            options={templateOptions}
            selectedTemplate={selectedTemplate}
            onSelect={setSelectedTemplate}
            disabled={isProcessing}
          />

          <button
            onClick={handleSubmit}
            disabled={disabled}
            className={`w-full md:w-auto px-6 py-3 rounded-full text-white font-semibold shadow-lg transition ${
              disabled
                ? 'bg-purple-300 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700'
            }`}
          >
            {isProcessing ? 'Processing…' : 'Enhance CV Now'}
          </button>

          {queuedMessage && <p className="text-blue-700 text-center">{queuedMessage}</p>}
          {isProcessing && (
            <div className="flex justify-center">
              <div className="mt-4 h-10 w-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {error && <p className="text-red-600 text-center font-semibold">{error}</p>}
        </section>

        {scoreBreakdown.length > 0 && (
          <ATSScoreDashboard metrics={scoreBreakdown} match={match} />
        )}

        {selectionInsights && (
          <section className="space-y-4 rounded-3xl bg-white/85 border border-emerald-200/70 shadow-xl p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-emerald-600">
                  Selection Probability
                </p>
                <p className="mt-3 text-5xl font-black text-emerald-700">
                  {selectionInsights.probability ?? '—'}%
                </p>
                <p className="mt-2 text-sm text-emerald-700/90">
                  {selectionInsights.message ||
                    'Projected probability that this resume will be shortlisted for the JD.'}
                </p>
              </div>
              {selectionInsights.level && (
                <span className="self-start rounded-full bg-emerald-100 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700">
                  {selectionInsights.level} Outlook
                </span>
              )}
            </div>
            <p className="text-sm text-emerald-800/90">
              {selectionInsights.summary ||
                'Your chances of selection have increased. Prepare for the interview and learn these skills!'}
            </p>
            {selectionInsights.flags?.length > 0 && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {selectionInsights.flags.map((flag) => {
                  const toneClass =
                    flag.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : flag.type === 'warning'
                        ? 'bg-amber-50 border-amber-200 text-amber-800'
                        : 'bg-sky-50 border-sky-200 text-sky-800'
                  return (
                    <div
                      key={`${flag.key}-${flag.title}`}
                      className={`rounded-2xl border px-4 py-3 shadow-sm ${toneClass}`}
                    >
                      <p className="text-sm font-semibold">{flag.title}</p>
                      <p className="mt-1 text-sm leading-relaxed">
                        {flag.detail || flag.message || ''}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {analysisHighlights.length > 0 && (
          <section className="space-y-4 rounded-3xl bg-white/85 border border-purple-200/70 shadow-xl p-6">
            <div>
              <h2 className="text-xl font-semibold text-purple-900">Match Checklist</h2>
              <p className="mt-1 text-sm text-purple-700/80">
                Review these alignment notes to close remaining gaps before submitting your application.
              </p>
            </div>
            <ul className="space-y-3">
              {analysisHighlights.map((item) => (
                <li
                  key={item.key}
                  className={`rounded-2xl border px-4 py-3 shadow-sm ${
                    highlightToneStyles[item.tone] || highlightToneStyles.info
                  }`}
                >
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 text-sm leading-relaxed">{item.message}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {match && (
          <section className="space-y-4">
            <div className="rounded-3xl bg-white/80 backdrop-blur border border-purple-200/70 shadow-xl p-6 space-y-4">
              <h3 className="text-xl font-semibold text-purple-900">Skill Coverage Snapshot</h3>
              <table className="w-full text-left text-sm text-purple-800">
                <thead>
                  <tr className="uppercase text-xs tracking-wide text-purple-500">
                    <th className="py-2">Skill</th>
                    <th className="py-2 text-right">Match</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const rows = [...(match.table || [])]
                    while (rows.length < 5) rows.push({ skill: '—', matched: false })
                    return rows.slice(0, 5).map((row, idx) => (
                      <tr key={`${row.skill}-${idx}`} className="border-t border-purple-100/60">
                        <td className="py-2">{row.skill}</td>
                        <td className="py-2 text-right font-semibold">
                          {row.matched ? '✓' : '✗'}
                        </td>
                      </tr>
                    ))
                  })()}
                </tbody>
              </table>
              <p className="text-purple-800 font-medium">
                {formatMatchMessage(match.originalScore, match.enhancedScore)}
              </p>
              <div className="text-sm text-purple-700 space-y-1">
                <p>
                  Added keywords: {match.addedSkills.length > 0 ? match.addedSkills.join(', ') : 'None'}
                </p>
                {match.missingSkills.length > 0 && (
                  <p>Still missing: {match.missingSkills.join(', ')}</p>
                )}
              </div>
            </div>
          </section>
        )}

        {certificateInsights && (
          <section className="space-y-3 rounded-3xl bg-white/80 border border-blue-200/70 shadow-xl p-6">
            <h2 className="text-xl font-semibold text-blue-900">Certificate Insights</h2>
            <p className="text-sm text-blue-800/90">
              We detected {certificateInsights.known?.length || 0} certificates across your resume,
              LinkedIn, and manual inputs.
            </p>
            {certificateInsights.manualEntryRequired && (
              <p className="text-sm text-rose-600 font-semibold">
                Credly requires authentication. Please paste key certifications manually above so we can
                include them.
              </p>
            )}
            {certificateInsights.suggestions?.length > 0 ? (
              <div className="text-sm text-blue-800/90 space-y-1">
                <p className="font-semibold">Recommended additions for this job:</p>
                <ul className="list-disc pl-5 space-y-1">
                  {certificateInsights.suggestions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-blue-700/80">No additional certifications recommended.</p>
            )}
          </section>
        )}

        {improvementActions.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-purple-900">Targeted Improvements</h2>
            <p className="text-sm text-purple-700/80">
              Launch AI-powered fixes for any category below. Each enhancement rewrites your resume snippets without adding
              unrealistic claims.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {improvementActions.map((action) => {
                const isActive = activeImprovement === action.key
                const buttonDisabled = isProcessing || improvementBusy
                return (
                  <button
                    key={action.key}
                    type="button"
                    onClick={() => handleImprovementClick(action.key)}
                    disabled={buttonDisabled}
                    className={`rounded-2xl border border-purple-200 bg-white/80 p-4 text-left shadow-sm hover:shadow-lg transition ${
                      isActive
                        ? 'opacity-70 cursor-wait'
                        : buttonDisabled
                          ? 'opacity-60 cursor-not-allowed'
                          : 'hover:-translate-y-0.5'
                    }`}
                    aria-busy={isActive}
                    aria-disabled={buttonDisabled}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-lg font-semibold text-purple-800">{action.label}</p>
                        <p className="text-sm text-purple-600">{action.helper}</p>
                      </div>
                      {isActive && (
                        <span className="h-6 w-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {improvementResults.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-purple-900">Suggested Edits</h2>
            <div className="rounded-2xl border border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 p-4 text-sm text-purple-700">
              These skills and highlights were added to match the JD. Please prepare for the interview accordingly.
            </div>
            <div className="space-y-4">
              {improvementResults.map((item) => (
                <ImprovementCard
                  key={item.id}
                  suggestion={item}
                  onAccept={() => handleAcceptImprovement(item.id)}
                  onReject={() => handleRejectImprovement(item.id)}
                />
              ))}
            </div>
          </section>
        )}

        {resumeText && (
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-purple-900">Latest Resume Preview</h2>
            <textarea
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              className="w-full h-64 p-4 rounded-2xl border border-purple-200 bg-white/80 text-sm text-purple-900"
            />
            <p className="text-xs text-purple-600">
              This preview updates whenever you accept an improvement. You can copy, edit, or export it
              as needed.
            </p>
          </section>
        )}

        {outputFiles.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-purple-900">Download Enhanced Documents</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {outputFiles.map((file) => {
                let label
                switch (file.type) {
                  case 'cover_letter1':
                    label = 'Cover Letter 1 (PDF)'
                    break
                  case 'cover_letter2':
                    label = 'Cover Letter 2 (PDF)'
                    break
                  case 'version1':
                    label = 'CV Version 1 (PDF)'
                    break
                  case 'version2':
                    label = 'CV Version 2 (PDF)'
                    break
                  default:
                    label = 'Download (PDF)'
                }

                return (
                  <div
                    key={file.type}
                    className="p-4 bg-white/80 border border-purple-200 rounded-2xl shadow text-center"
                  >
                    <p className="mb-2 font-semibold text-purple-800">{label}</p>
                    <a
                      href={file.url}
                      className="text-purple-700 hover:underline font-semibold"
                    >
                      Download PDF
                    </a>
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

export default App
