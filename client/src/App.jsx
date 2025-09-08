import { useState, useRef } from 'react'
import skillResources from './skillResources'
import certResources from './certResources'
import languageResources from './languageResources'
import { getScoreStatus } from './scoreStatus'
import { getSkillIcon } from '../../skillIcons.js'

const metricTips = {
  layoutSearchability: 'Use bullet points for better scanning.',
  atsReadability: 'Simplify language and shorten sentences.',
  impact: 'Emphasize strong action verbs and results.',
  crispness: 'Keep sentences concise.',
  keywordDensity: 'Repeat relevant keywords naturally.',
  sectionHeadingClarity: 'Use clear section headings like Experience.',
  contactInfoCompleteness: 'Include email, phone, and LinkedIn.',
  grammar: 'Proofread for correct grammar and punctuation.'
}

const formatMetricName = (name) =>
  name.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())

const isValidUrl = (url) => {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

const atsMetricCategories = {
  Layout: ['layoutSearchability'],
  Readability: ['atsReadability'],
  Impact: ['impact'],
  Crispness: ['crispness'],
  Grammar: ['grammar']
}

const allAtsMetrics = Object.values(atsMetricCategories).flat()

const otherQualityMetricCategories = {
  'Keyword Optimization': ['keywordDensity'],
  'Section Headings': ['sectionHeadingClarity'],
  'Contact Information': ['contactInfoCompleteness']
}

function App() {
  const [jobUrl, setJobUrl] = useState('')
  const [cvFile, setCvFile] = useState(null)
  const [result, setResult] = useState(null)
  const [skills, setSkills] = useState([])
  const [linkedinUrl, setLinkedinUrl] = useState('')
  const [credlyUrl, setCredlyUrl] = useState('')
  const [error, setError] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [designationOverride, setDesignationOverride] = useState('')
  const [expOptions, setExpOptions] = useState([])
  const [eduOptions, setEduOptions] = useState([])
  const [certOptions, setCertOptions] = useState([])
  const [langOptions, setLangOptions] = useState([])
  const [cvKey, setCvKey] = useState('')
  const [cvTextKey, setCvTextKey] = useState('')
  const [finalScore, setFinalScore] = useState(null)
  const [improvement, setImprovement] = useState(null)
  const [chanceOfSelection, setChanceOfSelection] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [cvUrl, setCvUrl] = useState('')
  const [coverLetterUrl, setCoverLetterUrl] = useState('')
  const [coverLetterTextUrl, setCoverLetterTextUrl] = useState('')
  const [coverLetterText, setCoverLetterText] = useState('')
  const [enhancedCvUrls, setEnhancedCvUrls] = useState([])
  const [enhancedCoverUrls, setEnhancedCoverUrls] = useState([])
  const [addedSkills, setAddedSkills] = useState([])
  const [addedProjects, setAddedProjects] = useState([])
  const [addedCertifications, setAddedCertifications] = useState([])
  const [studyTips, setStudyTips] = useState([])
  const [manualName, setManualName] = useState('')
  const [showNameModal, setShowNameModal] = useState(false)
  const [metricSuggestions, setMetricSuggestions] = useState({})
  const [gapSuggestion, setGapSuggestion] = useState('')
  const [showGapModal, setShowGapModal] = useState(false)
  const [jobUrlError, setJobUrlError] = useState('')
  const [linkedinUrlError, setLinkedinUrlError] = useState('')
  const [credlyUrlError, setCredlyUrlError] = useState('')
  const fileInputRef = useRef(null)
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

  const handleFileChange = (e) => {
    const file = e.target ? e.target.files[0] : e
    if (file && !file.name.toLowerCase().match(/\.(pdf|docx)$/)) {
      setError('Only PDF or DOCX files are supported.')
      return
    }
    setCvFile(file)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileChange(file)
  }

  const handleJobUrlBlur = () => {
    if (jobUrl && !isValidUrl(jobUrl)) {
      setJobUrlError('Please enter a valid URL.')
    } else {
      setJobUrlError('')
    }
  }

  const handleLinkedinBlur = () => {
    if (linkedinUrl && !isValidUrl(linkedinUrl)) {
      setLinkedinUrlError('Please enter a valid URL.')
    } else {
      setLinkedinUrlError('')
    }
  }

  const handleCredlyBlur = () => {
    if (credlyUrl && !isValidUrl(credlyUrl)) {
      setCredlyUrlError('Please enter a valid URL.')
    } else {
      setCredlyUrlError('')
    }
  }

  const handleSubmit = async (nameOverride) => {
    setIsProcessing(true)
    setError('')
    setDesignationOverride('')
    try {
      if (!linkedinUrl.trim()) {
        throw new Error('LinkedIn profile URL is required.')
      }
      const formData = new FormData()
      formData.append('resume', cvFile)
      formData.append('jobDescriptionUrl', jobUrl)
      formData.append('linkedinProfileUrl', linkedinUrl)
      if (credlyUrl.trim())
        formData.append('credlyProfileUrl', credlyUrl.trim())
      if (nameOverride) formData.append('applicantName', nameOverride)
      const response = await fetch(`${API_BASE_URL}/api/evaluate`, {
        method: 'POST',
        body: formData,
      })
      if (response.status === 400) {
        let data
        let text
        try {
          data = await response.json()
        } catch {
          text = await response.text()
        }
        if (data?.nameRequired) {
          setShowNameModal(true)
          return
        }
        const errText = data?.error || text || 'Request failed'
        setError(errText)
        return
      }
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || 'Request failed')
      }
      const data = await response.json()
      setResult(data)
      setSkills(
        (data.missingSkills || []).map((s) => ({
          name: s,
          icon: getSkillIcon(s),
          level: 70
        }))
      )
      setExpOptions((data.missingExperience || []).map((t) => ({ text: t, checked: false })))
      setEduOptions((data.missingEducation || []).map((t) => ({ text: t, checked: false })))
      setCertOptions(
        (data.missingCertifications || []).map((c) => ({
          text: c.provider ? `${c.name} - ${c.provider}` : c.name,
          data: c,
          checked: false
        }))
      )
      setLangOptions(
        (data.missingLanguages || []).map((t) => ({ text: t, checked: false }))
      )
      if (!data.designationMatch) {
        setDesignationOverride(data.jobTitle || '')
      }
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setIsProcessing(false)
    }
  }

  const disabled = !jobUrl || !cvFile || !linkedinUrl || isProcessing

  const handleSkillChange = (idx, field, value) => {
    setSkills((prev) =>
      prev.map((s, i) => {
        if (i !== idx) return s
        const updated = { ...s, [field]: value }
        if (field === 'name') {
          updated.icon = getSkillIcon(value)
          if (!updated.level) updated.level = 70
        }
        return updated
      })
    )
  }

  const addSkill = () =>
    setSkills((prev) => [...prev, { name: '', icon: '', level: 70 }])

  const toggleOption = (setter) => (idx) => {
    setter((prev) =>
      prev.map((o, i) => (i === idx ? { ...o, checked: !o.checked } : o))
    )
  }

  const handleFix = async (metricOrCategory) => {
    try {
      const form = new FormData()
      form.append('resume', cvFile)
      form.append('jobDescriptionUrl', jobUrl)
      form.append('metric', metricOrCategory)
      const resp = await fetch(`${API_BASE_URL}/api/fix-metric`, {
        method: 'POST',
        body: form
      })
      if (!resp.ok) {
        const text = await resp.text()
        throw new Error(text || 'Request failed')
      }
      const data = await resp.json()
      setMetricSuggestions((prev) => ({
        ...prev,
        [metricOrCategory]: data.suggestion
      }))
    } catch (err) {
      setMetricSuggestions((prev) => ({
        ...prev,
        [metricOrCategory]: err.message || 'Failed to fetch suggestion'
      }))
    }
  }

  const handleGap = async () => {
    try {
      const form = new FormData()
      form.append('resume', cvFile)
      form.append('jobDescriptionUrl', jobUrl)
      const resp = await fetch(`${API_BASE_URL}/api/fix-gap`, {
        method: 'POST',
        body: form
      })
      if (!resp.ok) {
        const text = await resp.text()
        throw new Error(text || 'Request failed')
      }
      const data = await resp.json()
      setGapSuggestion(data.suggestion || 'No suggestions')
    } catch (err) {
      setGapSuggestion(err.message || 'Failed to fetch suggestions')
    } finally {
      setShowGapModal(true)
    }
  }

  const handleGapFix = async (gap) => {
    try {
      const resp = await fetch(`${API_BASE_URL}/api/fix-gap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gap, jobDescriptionUrl: jobUrl })
      })
      if (!resp.ok) {
        const text = await resp.text()
        throw new Error(text || 'Request failed')
      }
      const data = await resp.json()
      setGapSuggestion(data.suggestion || 'No suggestions')
    } catch (err) {
      setGapSuggestion(err.message || 'Failed to fetch suggestions')
    } finally {
      setShowGapModal(true)
    }
  }

  const pollProgress = (jobId) => {
    const interval = setInterval(async () => {
      try {
        const resp = await fetch(`${API_BASE_URL}/api/progress/${jobId}`)
        const data = await resp.json()
        if (data && Object.values(data).every((v) => v === 'completed')) {
          clearInterval(interval)
        }
      } catch {
        clearInterval(interval)
      }
    }, 1000)
  }

  const getDownloadUrl = async (jobId, file) => {
    const resp = await fetch(`${API_BASE_URL}/api/download/${jobId}/${file}`)
    if (!resp.ok) throw new Error('Request failed')
    const info = await resp.json()
    return info.url || ''
  }

  const handleCompile = async () => {
    setIsProcessing(true)
    setError('')
    setCvUrl('')
    setCoverLetterUrl('')
    setChanceOfSelection(null)
    try {
      // Gather user selections once
      const selectedExperience = expOptions.filter((o) => o.checked).map((o) => o.text)
      const selectedEducation = eduOptions.filter((o) => o.checked).map((o) => o.text)
      const selectedCertifications = certOptions
        .filter((o) => o.checked)
        .map((o) => o.data)
      const selectedLanguages = langOptions.filter((o) => o.checked).map((o) => o.text)

      // Step 1: improve CV to obtain keys
      const improveForm = new FormData()
      improveForm.append('resume', cvFile)
      improveForm.append('jobDescriptionUrl', jobUrl)
      improveForm.append('linkedinProfileUrl', linkedinUrl)
      if (credlyUrl.trim()) improveForm.append('credlyProfileUrl', credlyUrl.trim())
      if (manualName) improveForm.append('applicantName', manualName)
      improveForm.append('addedSkills', JSON.stringify(skills))
      improveForm.append('selectedExperience', JSON.stringify(selectedExperience))
      improveForm.append('selectedEducation', JSON.stringify(selectedEducation))
      improveForm.append('selectedCertifications', JSON.stringify(selectedCertifications))
      improveForm.append('selectedLanguages', JSON.stringify(selectedLanguages))
      if (designationOverride)
        improveForm.append('designation', designationOverride)
      const improveResp = await fetch(`${API_BASE_URL}/api/process-cv`, {
        method: 'POST',
        body: improveForm
      })
      if (!improveResp.ok) {
        const text = await improveResp.text()
        throw new Error(text || 'Request failed')
      }
      const improveData = await improveResp.json()
      if (improveData.jobId) pollProgress(improveData.jobId)
      const existingKey = improveData.existingCvKey || ''
      const existingTextKey = improveData.cvTextKey || ''
      setCvKey(existingKey)
      setCvTextKey(existingTextKey)
      setAddedProjects(improveData.addedProjects || [])
      setAddedCertifications(improveData.addedCertifications || [])

      // Step 2: compile final CV & cover letter
      const compileForm = new FormData()
      compileForm.append('jobDescriptionUrl', jobUrl)
      compileForm.append('linkedinProfileUrl', linkedinUrl)
      if (credlyUrl.trim()) compileForm.append('credlyProfileUrl', credlyUrl.trim())
      if (manualName) compileForm.append('applicantName', manualName)
      compileForm.append('existingCvKey', existingKey)
      compileForm.append('existingCvTextKey', existingTextKey)
      compileForm.append('originalScore', result?.atsScore || 0)
      compileForm.append('addedSkills', JSON.stringify(skills))
      compileForm.append('selectedExperience', JSON.stringify(selectedExperience))
      compileForm.append('selectedEducation', JSON.stringify(selectedEducation))
      compileForm.append('selectedCertifications', JSON.stringify(selectedCertifications))
      compileForm.append('selectedLanguages', JSON.stringify(selectedLanguages))
      if (designationOverride)
        compileForm.append('designation', designationOverride)
      const compileResp = await fetch(`${API_BASE_URL}/api/compile`, {
        method: 'POST',
        body: compileForm
      })
      if (!compileResp.ok) {
        const text = await compileResp.text()
        throw new Error(text || 'Request failed')
      }
      const data = await compileResp.json()
      pollProgress(data.jobId)
      setFinalScore(data.atsScore)
      setImprovement(data.improvement)
      setChanceOfSelection(data.chanceOfSelection)
      setAddedSkills([...(data.addedSkills || []), ...(data.addedLanguages || [])])
      setStudyTips(data.studyTips || [])
      const cvDownload = await getDownloadUrl(data.jobId, 'cv.pdf')
      const clDownload = await getDownloadUrl(data.jobId, 'cover_letter.pdf')
      const clTextDownload = await getDownloadUrl(data.jobId, 'cover_letter.txt')
      setCvUrl(cvDownload)
      setCoverLetterUrl(clDownload)
      setCoverLetterTextUrl(clTextDownload)
      setCoverLetterText(data.coverLetterText || '')
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleEnhance = async () => {
    setIsProcessing(true)
    setError('')
    setEnhancedCvUrls([])
    setEnhancedCoverUrls([])
    try {
      const form = new FormData()
      form.append('resume', cvFile)
      form.append('jobDescriptionUrl', jobUrl)
      form.append('linkedinProfileUrl', linkedinUrl)
      if (credlyUrl.trim()) form.append('credlyProfileUrl', credlyUrl.trim())
      const resp = await fetch(`${API_BASE_URL}/api/enhance`, {
        method: 'POST',
        body: form
      })
      if (!resp.ok) {
        const text = await resp.text()
        throw new Error(text || 'Request failed')
      }
      const data = await resp.json()
      if (data.jobId) {
        pollProgress(data.jobId)
        const variantFiles = data.variantFiles || data.variants || []
        const coverFiles = data.coverFiles || data.coverLetters || []
        const variantLinks = []
        for (let i = 0; i < variantFiles.length; i++) {
          try {
            const url = await getDownloadUrl(data.jobId, variantFiles[i])
            variantLinks.push({ label: `Download CV Version ${i + 1}`, url })
          } catch {}
        }
        const coverLinks = []
        for (let i = 0; i < coverFiles.length; i++) {
          try {
            const url = await getDownloadUrl(data.jobId, coverFiles[i])
            coverLinks.push({ label: `Download Cover Letter${coverFiles.length > 1 ? ` ${i + 1}` : ''}`, url })
          } catch {}
        }
        setEnhancedCvUrls(variantLinks)
        setEnhancedCoverUrls(coverLinks)
      }
      setAddedSkills([...(data.addedSkills || []), ...(data.addedLanguages || [])])
      setAddedProjects(data.addedProjects || [])
      setAddedCertifications(data.addedCertifications || [])
      setStudyTips(data.studyTips || [])
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-r from-blue-200 to-purple-300 flex flex-col items-center p-4">
      <h1 className="text-3xl font-bold mb-4 text-center text-purple-800">Evaluate Your CV</h1>
      <p className="mb-6 text-center max-w-xl text-indigo-800">
        Upload your CV and provide the job description URL to evaluate how well it matches.
      </p>

      <div
        data-testid="dropzone"
        className={`mb-1 p-4 border-2 border-dashed rounded ${
          disabled && !cvFile
            ? 'border-red-500'
            : isDragging
            ? 'border-blue-500 bg-blue-100'
            : 'border-purple-300'
        } cursor-pointer text-center text-purple-700`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current && fileInputRef.current.click()}
      >
        <p>Drag & drop your CV here or</p>
        <label
          htmlFor="cv-upload"
          className="block mt-2 underline cursor-pointer break-words"
        >
          Browse... {cvFile ? cvFile.name : 'No file selected.'}
        </label>
        <input
          id="cv-upload"
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx"
          onChange={handleFileChange}
          aria-label="Choose File"
          className="sr-only"
        />
      </div>

      {disabled && !cvFile && (
        <p className="text-red-600 text-sm mb-4">Resume file is required.</p>
      )}

      <input
        type="url"
        placeholder="Job Description URL"
        value={jobUrl}
        onChange={(e) => setJobUrl(e.target.value)}
        onBlur={handleJobUrlBlur}
        className={`w-full max-w-md p-2 border rounded ${
          (disabled && !jobUrl) || jobUrlError ? 'border-red-500' : 'border-purple-300'
        } mb-1`}
      />

      {disabled && !jobUrl && (
        <p className="text-red-600 text-sm mb-4">Job description URL is required.</p>
      )}
      {jobUrl && jobUrlError && (
        <p className="text-red-600 text-sm mb-4">{jobUrlError}</p>
      )}

      <input
        type="url"
        placeholder="LinkedIn Profile URL"
        value={linkedinUrl}
        onChange={(e) => setLinkedinUrl(e.target.value)}
        onBlur={handleLinkedinBlur}
        className={`w-full max-w-md p-2 border rounded ${
          (disabled && !linkedinUrl) || linkedinUrlError
            ? 'border-red-500'
            : 'border-purple-300'
        } mb-1`}
      />

      {disabled && !linkedinUrl && (
        <p className="text-red-600 text-sm mb-4">LinkedIn profile URL is required.</p>
      )}
      {linkedinUrl && linkedinUrlError && (
        <p className="text-red-600 text-sm mb-4">{linkedinUrlError}</p>
      )}

      <input
        type="url"
        placeholder="Credly Profile URL (optional)"
        value={credlyUrl}
        onChange={(e) => setCredlyUrl(e.target.value)}
        onBlur={handleCredlyBlur}
        className={`w-full max-w-md p-2 border rounded ${
          credlyUrl && credlyUrlError ? 'border-red-500' : 'border-purple-300'
        } mb-1`}
      />

      {credlyUrl && credlyUrlError && (
        <p className="text-red-600 text-sm mb-4">{credlyUrlError}</p>
      )}

      <button
        onClick={handleSubmit}
        disabled={disabled}
        className={`px-4 py-2 rounded text-white ${disabled ? 'bg-purple-300' : 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700'}`}
      >
        Evaluate me against the JD
      </button>

      {isProcessing && (
        <div className="mt-4 animate-spin h-8 w-8 border-4 border-purple-500 border-t-transparent rounded-full"></div>
      )}

      {error && <p className="mt-4 text-red-600">{error}</p>}

      {result && (
        <div className="mt-6 w-full max-w-md p-4 bg-gradient-to-r from-white to-purple-50 rounded shadow">
          <p className="text-purple-800 mb-2">ATS Score: {result.atsScore}%</p>
          {result.atsMetrics &&
            allAtsMetrics.some((m) => result.atsMetrics[m] != null) && (
              <div className="text-purple-800 mb-2">
                <p className="font-semibold mb-1">ATS Breakdown</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {Object.entries(atsMetricCategories).map(
                    ([category, metrics]) => {
                      const available = metrics.filter(
                        (m) => result.atsMetrics[m] != null
                      )
                      if (available.length === 0) return null
                      const avgScore = Math.round(
                        available.reduce(
                          (a, m) => a + result.atsMetrics[m],
                          0
                        ) / available.length
                      )
                      const status = getScoreStatus(avgScore)
                      const primaryMetric = available[0]
                      return (
                        <div
                          key={category}
                          className="p-4 bg-white border rounded shadow-sm"
                        >
                          <p className="font-medium">{category}</p>
                          {avgScore < 80 && (
                            <p className="text-sm text-purple-600">
                              Target ≥80. Click to FIX
                            </p>
                          )}
                          <p>
                            {avgScore}% ({status})
                            <button
                              onClick={() => handleFix(primaryMetric)}
                              className="ml-2 text-blue-600 underline"
                            >
                              Fix
                            </button>
                          </p>
                          <ul>
                            {available.map((metricKey) => {
                              const score = result.atsMetrics[metricKey]
                              const metricStatus = getScoreStatus(score)
                              return (
                                <li key={metricKey} className="mb-1">
                                  <span>
                                    {formatMetricName(metricKey)}: {score}%
                                    {' '}
                                    ({metricStatus})
                                  </span>
                                  <button
                                    onClick={() => handleFix(metricKey)}
                                    className="ml-2 text-blue-600 underline"
                                  >
                                    Fix
                                  </button>
                                  {metricTips[metricKey] && (
                                    <span
                                      className={`block text-sm ${
                                        score >= 70
                                          ? 'text-green-600'
                                          : 'text-purple-600'
                                      }`}
                                    >
                                      {score >= 70
                                        ? `Great job: ${metricTips[metricKey]}`
                                        : metricTips[metricKey]}
                                    </span>
                                  )}
                                  {score < 70 &&
                                    metricSuggestions[metricKey] && (
                                      <div className="mt-1 text-sm text-purple-700">
                                        {metricSuggestions[metricKey]}
                                      </div>
                                    )}
                                </li>
                              )
                            })}
                          </ul>
                          {avgScore < 80 && metricSuggestions[primaryMetric] && (
                            <div className="mt-1 text-sm text-purple-700">
                              {metricSuggestions[primaryMetric]}
                            </div>
                          )}
                        </div>
                      )
                    }
                  )}
                </div>
              </div>
            )}

          {result.atsMetrics && (
            <div className="text-purple-800 mb-2">
              <p className="font-semibold mb-1">Other Quality Metrics</p>
              {Object.entries(otherQualityMetricCategories).map(
                ([category, metrics]) => {
                  const available = metrics.filter(
                    (m) => result.atsMetrics[m] != null
                  )
                  if (available.length === 0) return null
                  const avgScore = Math.round(
                    available.reduce(
                      (a, m) => a + result.atsMetrics[m],
                      0
                    ) / available.length
                  )
                  const status = getScoreStatus(avgScore)
                  const primaryMetric = available[0]
                  return (
                    <div
                      key={category}
                      className="p-4 bg-white border rounded shadow-sm mb-2"
                    >
                      <p className="font-medium">{category}</p>
                      {avgScore < 80 && (
                        <p className="text-sm text-purple-600">
                          Target ≥80. Click to FIX
                        </p>
                      )}
                      <p>
                        {avgScore}% ({status})
                        <button
                          onClick={() => handleFix(primaryMetric)}
                          className="ml-2 text-blue-600 underline"
                        >
                          Fix
                        </button>
                      </p>
                      <ul>
                        {available.map((metric) => {
                          const score = result.atsMetrics[metric]
                          const metricStatus = getScoreStatus(score)
                          return (
                            <li key={metric} className="mb-1">
                              <span>
                                {formatMetricName(metric)}: {score}% ({metricStatus})
                              </span>
                              <>
                                <button
                                  onClick={() => handleFix(metric)}
                                  className="ml-2 text-blue-600 underline"
                                >
                                  Fix
                                </button>
                                {metricTips[metric] && (
                                  <span
                                    className={`block text-sm ${
                                      score >= 70
                                        ? 'text-green-600'
                                        : 'text-purple-600'
                                    }`}
                                  >
                                    {score >= 70
                                      ? `Great job: ${metricTips[metric]}`
                                      : metricTips[metric]}
                                  </span>
                                )}
                                {score < 70 && metricSuggestions[metric] && (
                                  <div className="mt-1 text-sm text-purple-700">
                                    {metricSuggestions[metric]}
                                  </div>
                                )}
                              </>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )
                }
              )}
            </div>
          )}
          <p className="text-purple-800 mb-2">
            Designation: {result.originalTitle || 'N/A'} vs {result.jobTitle || 'N/A'}
            {!result.designationMatch ? ' (Mismatch)' : ''}
          </p>
          <button
            onClick={handleGap}
            className="px-4 py-2 bg-purple-600 text-white rounded mb-2"
          >
            Get Targeted Suggestions
          </button>
          {!result.designationMatch && (
            <div className="mb-2">
              <input
                type="text"
                placeholder="Revised Designation"
                value={designationOverride}
                onChange={(e) => setDesignationOverride(e.target.value)}
                className="w-full p-2 border border-purple-300 rounded"
              />
            </div>
          )}
          {skills.length > 0 && (
            <div className="text-purple-800 mb-2">
              <p className="mb-2">Missing skills:</p>
              {skills.map((skill, idx) => (
                <div key={idx} className="mb-4">
                  <div className="flex items-center gap-2 mb-1">
                    {skill.icon && <i className={`${skill.icon} text-xl`}></i>}
                    <span className="capitalize">{skill.name}</span>
                    {skill.level && (
                      <div className="flex-1 h-2 bg-purple-200 rounded">
                        <div
                          className="h-2 bg-purple-600 rounded"
                          style={{ width: `${skill.level}%` }}
                        ></div>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col md:flex-row gap-2">
                    <input
                      value={skill.name}
                      placeholder="Skill"
                      onChange={(e) => handleSkillChange(idx, 'name', e.target.value)}
                      className="flex-1 p-2 border border-purple-300 rounded"
                    />
                    <input
                      value={skill.icon || ''}
                      placeholder="Icon (optional)"
                      onChange={(e) => handleSkillChange(idx, 'icon', e.target.value)}
                      className="flex-1 p-2 border border-purple-300 rounded"
                    />
                    <input
                      value={skill.level || ''}
                      type="number"
                      placeholder="Level"
                      onChange={(e) => handleSkillChange(idx, 'level', e.target.value)}
                      className="w-24 p-2 border border-purple-300 rounded"
                    />
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={addSkill}
                className="px-2 py-1 bg-purple-500 text-white rounded"
              >
                Add Skill
              </button>
            </div>
          )}
          {result.jdMismatches?.length > 0 && (
            <div className="text-purple-800 mb-2">
              <p className="mb-2">JD responsibility gaps:</p>
              <ul>
                {result.jdMismatches.map((gap, idx) => (
                  <li key={idx} className="mb-1">
                    {gap}
                    <a
                      href="#"
                      className="ml-2 text-purple-600 underline"
                      onClick={() => handleGapFix(gap)}
                    >
                      Click to fix
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {expOptions.length > 0 && (
            <div className="text-purple-800 mb-2">
              <p className="mb-2">LinkedIn experience not in resume:</p>
              {expOptions.map((opt, idx) => (
                <label key={idx} className="block">
                  <input
                    type="checkbox"
                    checked={opt.checked}
                    onChange={() => toggleOption(setExpOptions)(idx)}
                    className="mr-2"
                  />
                  {opt.text}
                </label>
              ))}
            </div>
          )}
          {eduOptions.length > 0 && (
            <div className="text-purple-800 mb-2">
              <p className="mb-2">LinkedIn education not in resume:</p>
              {eduOptions.map((opt, idx) => (
                <label key={idx} className="block">
                  <input
                    type="checkbox"
                    checked={opt.checked}
                    onChange={() => toggleOption(setEduOptions)(idx)}
                    className="mr-2"
                  />
                  {opt.text}
                </label>
              ))}
            </div>
          )}
          {certOptions.length > 0 && (
            <div className="text-purple-800 mb-2">
              <p className="mb-2">Credly certifications not in resume:</p>
              {certOptions.map((opt, idx) => (
                <label key={idx} className="block">
                  <input
                    type="checkbox"
                    checked={opt.checked}
                    onChange={() => toggleOption(setCertOptions)(idx)}
                    className="mr-2"
                  />
                  {opt.text}
                </label>
              ))}
            </div>
          )}
          {langOptions.length > 0 && (
            <div className="text-purple-800 mb-2">
              <p className="mb-2">LinkedIn languages not in resume:</p>
              {langOptions.map((opt, idx) => (
                <label key={idx} className="block">
                  <input
                    type="checkbox"
                    checked={opt.checked}
                    onChange={() => toggleOption(setLangOptions)(idx)}
                    className="mr-2"
                  />
                  {opt.text}
                </label>
              ))}
            </div>
          )}
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleCompile}
              className="px-4 py-2 bg-purple-600 text-white rounded"
            >
              Improve CV and Generate Cover Letter
            </button>
            <button
              onClick={handleEnhance}
              className="px-4 py-2 bg-green-600 text-white rounded"
            >
              Enhance CV
            </button>
          </div>
          {finalScore !== null && (
            <p className="text-purple-800 mt-2">
              Final ATS Score: {finalScore}% (Improvement: {improvement}% )
            </p>
          )}
          {chanceOfSelection !== null && (
            <p className="text-purple-800 mt-2">
              Chance of Selection: {chanceOfSelection}%
            </p>
          )}
          {cvUrl && (
            <div className="flex gap-2 mt-2">
              <a
                href={cvUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-green-600 text-white rounded"
              >
                Download CV
              </a>
              {coverLetterUrl && (
                <a
                  href={coverLetterUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-green-600 text-white rounded"
                >
                  Download Cover Letter
                </a>
              )}
              {coverLetterTextUrl && (
                <a
                  href={coverLetterTextUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-green-600 text-white rounded"
                >
                  Download Cover Letter Text
                </a>
              )}
            </div>
          )}
          {enhancedCvUrls.length > 0 && (
            <div className="flex flex-col gap-2 mt-2">
              {enhancedCvUrls.map((link, idx) => (
                <a
                  key={idx}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-green-600 text-white rounded"
                >
                  {link.label}
                </a>
              ))}
              {enhancedCoverUrls.map((link, idx) => (
                <a
                  key={`cover-${idx}`}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-green-600 text-white rounded"
                >
                  {link.label}
                </a>
              ))}
            </div>
          )}
          {coverLetterText && (
            <div className="mt-4">
              <h3 className="font-semibold mb-2">Cover Letter Text</h3>
              <pre className="bg-gray-100 p-4 rounded whitespace-pre-wrap">
                {coverLetterText}
              </pre>
            </div>
          )}
          {(addedSkills.length > 0 ||
            addedProjects.length > 0 ||
            addedCertifications.length > 0 ||
            studyTips.length > 0) && (
            <div className="text-purple-800 mt-4">
              <h3 className="font-semibold mb-2">New Additions for Interview Prep</h3>

              {addedSkills.length > 0 && (
                <div className="mb-2">
                  <p className="font-semibold">Skills</p>
                  <ul className="list-disc list-inside">
                    {addedSkills.map((item, idx) => {
                      const name = typeof item === 'string' ? item : item.name
                      const key = name.toLowerCase().trim()
                      const resources =
                        skillResources[key] ||
                        certResources[key] ||
                        languageResources[key]
                      return (
                        <li key={idx}>
                          {name}{' '}
                          {resources ? (
                            resources.map((r, i) => (
                              <span key={i}>
                                <a
                                  href={r.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 underline"
                                >
                                  {r.label}
                                </a>
                                {i < resources.length - 1 ? ', ' : ''}
                              </span>
                            ))
                          ) : (
                            <a
                              href={`https://www.google.com/search?q=${encodeURIComponent(
                                name + ' interview questions'
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 underline"
                            >
                              Learning Resources
                            </a>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              {addedProjects.length > 0 && (
                <div className="mb-2">
                  <p className="font-semibold">Projects</p>
                  <ul className="list-disc list-inside">
                    {addedProjects.map((p, idx) => (
                      <li key={idx}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}

              {addedCertifications.length > 0 && (
                <div className="mb-2">
                  <p className="font-semibold">Certifications</p>
                  <ul className="list-disc list-inside">
                    {addedCertifications.map((c, idx) => {
                      const name = c.provider
                        ? `${c.name} - ${c.provider}`
                        : c.name || c
                      const key = (c.name || c).toLowerCase().trim()
                      const resources = certResources[key] || []
                      return (
                        <li key={idx}>
                          {name}{' '}
                          {resources.length > 0 ? (
                            resources.map((r, i) => (
                              <span key={i}>
                                <a
                                  href={r.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 underline"
                                >
                                  {r.label}
                                </a>
                                {i < resources.length - 1 ? ', ' : ''}
                              </span>
                            ))
                          ) : (
                            <a
                              href={`https://www.google.com/search?q=${encodeURIComponent(
                                name + ' interview questions'
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 underline"
                            >
                              Learning Resources
                            </a>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              {studyTips.length > 0 && (
                <div className="mb-2">
                  <p className="font-semibold">Study Tips</p>
                  <ul className="list-disc list-inside">
                    {studyTips.map((t, idx) => (
                      <li key={idx}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
        )}

      {showNameModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white p-4 rounded shadow w-80">
            <p className="mb-2 text-purple-800">Please enter your name</p>
            <input
              type="text"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              className="w-full p-2 border border-purple-300 rounded mb-2"
            />
            <button
              onClick={() => {
                setShowNameModal(false)
                handleSubmit(manualName)
              }}
              className="px-4 py-2 bg-purple-600 text-white rounded"
            >
              Submit
            </button>
          </div>
        </div>
      )}

      {showGapModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white p-4 rounded shadow w-96 max-h-[80vh] overflow-y-auto">
            <p className="mb-2 text-purple-800 whitespace-pre-line">{gapSuggestion}</p>
            <button
              onClick={() => setShowGapModal(false)}
              className="mt-2 px-4 py-2 bg-purple-600 text-white rounded"
            >
              Close
            </button>
          </div>
        </div>
      )}

      </div>
    )
  }

export default App
