import { useState, useCallback } from 'react'
import { formatMatchMessage } from './formatMatchMessage.js'

function App() {
  const [profileUrl, setProfileUrl] = useState('')
  const [jobUrl, setJobUrl] = useState('')
  const [credlyUrl, setCredlyUrl] = useState('')
  const [cvFile, setCvFile] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [history, setHistory] = useState([])
  const [iteration, setIteration] = useState(0)
  const [latestCvKey, setLatestCvKey] = useState('')
  const [error, setError] = useState('')
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''
  const metricLabels = {
    layoutSearchability: 'Layout Searchability',
    atsReadability: 'ATS Readability',
    impact: 'Impact',
    crispness: 'Crispness',
    keywordDensity: 'Keyword Density',
    sectionHeadingClarity: 'Section Heading Clarity',
    contactInfoCompleteness: 'Contact Info Completeness'
  }
  const metricOrder = Object.keys(metricLabels)

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && !file.name.toLowerCase().match(/\.(pdf|docx)$/)) {
      setError('Only PDF or DOCX files are supported.')
      return
    }
    if (file) setCvFile(file)
  }, [])

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file && !file.name.toLowerCase().match(/\.(pdf|docx)$/)) {
      setError('Only PDF or DOCX files are supported.')
      return
    }
    if (file) setCvFile(file)
  }

  const handleSubmit = async () => {
    setIsProcessing(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('resume', cvFile)
      formData.append('linkedinProfileUrl', profileUrl)
      formData.append('jobDescriptionUrl', jobUrl)
      if (credlyUrl) formData.append('credlyProfileUrl', credlyUrl)
      if (latestCvKey) formData.append('existingCvKey', latestCvKey)
      formData.append('iteration', iteration)

      const response = await fetch(`${API_BASE_URL}/api/process-cv`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        let message = 'Request failed'
        try {
          const data = await response.json()
          message = data.error || data.message || message
        } catch {
          const text = await response.text()
          message = text || message
        }
        setError(message)
        throw new Error(message)
      }

      const contentType = response.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        const text = await response.text()
        throw new Error(text || 'Invalid JSON response')
      }

      const data = await response.json()
      const entry = {
        iteration: data.iteration,
        urls: data.urls || [],
        match: {
          table: data.table || [],
          addedSkills: data.addedSkills || [],
          missingSkills: data.missingSkills || data.newSkills || [],
          originalScore: data.originalScore || 0,
          enhancedScore: data.enhancedScore || 0,
          originalTitle: data.originalTitle || '',
          modifiedTitle: data.modifiedTitle || ''
        },
        metrics: data.metrics || []
      }
      setHistory((h) => [...h, entry])
      setLatestCvKey(data.existingCvKey || data.bestCvKey || '')
      setIteration(data.iteration + 1)
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleImproveMetric = async (metric) => {
    if (!metric) return
    setIsProcessing(true)
    setError('')
    try {
      const response = await fetch(`${API_BASE_URL}/api/improve-metric`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metric,
          jobDescriptionUrl: jobUrl,
          linkedinProfileUrl: profileUrl,
          credlyProfileUrl: credlyUrl,
          existingCvKey: latestCvKey,
          iteration: iteration - 1,
        }),
      })

        if (!response.ok) {
        let message = 'Request failed'
        try {
          const data = await response.json()
          message = data.error || data.message || message
        } catch {
          const text = await response.text()
          message = text || message
        }
        setError(message)
        throw new Error(message)
      }

      const contentType = response.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        const text = await response.text()
        throw new Error(text || 'Invalid JSON response')
      }

      const data = await response.json()
      setHistory((h) => {
        if (h.length === 0) return h
        const last = h[h.length - 1]
        const entry = {
          iteration: data.iteration,
          urls: data.urls || [],
          metrics: data.metrics || [],
          match: {
            table: data.table || last.match.table,
            addedSkills: data.addedSkills || last.match.addedSkills,
            missingSkills:
              data.missingSkills || data.newSkills || last.match.missingSkills,
            originalScore:
              data.originalScore ?? last.match.originalScore,
            enhancedScore:
              data.enhancedScore ?? last.match.enhancedScore,
            originalTitle:
              data.originalTitle ?? last.match.originalTitle,
            modifiedTitle:
              data.modifiedTitle ?? last.match.modifiedTitle,
          },
        }
        return [...h, entry]
      })
      if (data.existingCvKey || data.bestCvKey)
        setLatestCvKey(data.existingCvKey || data.bestCvKey)
      setIteration(data.iteration + 1)
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  const disabled = !profileUrl || !jobUrl || !cvFile || isProcessing

  return (
    <div className="min-h-screen bg-gradient-to-r from-blue-200 to-purple-300 flex flex-col items-center p-4">
      <h1 className="text-3xl font-bold mb-4 text-center text-purple-800">Enhance Your CV</h1>
      <p className="mb-6 text-center max-w-xl text-indigo-800">
        Provide your LinkedIn profile and job description URLs, and upload your CV to receive enhanced versions tailored to your job.
      </p>

      <div
        className="w-full max-w-md p-6 border-2 border-dashed border-blue-300 rounded-md mb-4 text-center bg-gradient-to-r from-white to-purple-50"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        {cvFile ? (
          <p className="text-purple-800">{cvFile.name}</p>
        ) : (
          <p className="text-purple-700">Drag and drop your CV here, or click to select (PDF or DOCX, max 5MB)</p>
        )}
        <input
          type="file"
          accept=".pdf,.docx"
          onChange={handleFileChange}
          className="hidden"
          id="cv-input"
        />
        <label htmlFor="cv-input" className="block mt-2 text-purple-700 cursor-pointer">
          Choose File
        </label>
      </div>

      <input
        type="url"
        placeholder="LinkedIn Profile URL"
        value={profileUrl}
        onChange={(e) => setProfileUrl(e.target.value)}
        className="w-full max-w-md p-2 border border-purple-300 rounded mb-4"
      />

      <input
        type="url"
        placeholder="Job Description URL"
        value={jobUrl}
        onChange={(e) => setJobUrl(e.target.value)}
        className="w-full max-w-md p-2 border border-purple-300 rounded mb-4"
      />

      <input
        type="url"
        placeholder="Credly Profile URL (optional)"
        value={credlyUrl}
        onChange={(e) => setCredlyUrl(e.target.value)}
        className="w-full max-w-md p-2 border border-purple-300 rounded mb-4"
      />

      <button
        onClick={handleSubmit}
        disabled={disabled}
        title="Generate an initial enhanced CV"
        className={`px-4 py-2 rounded text-white ${disabled ? 'bg-purple-300' : 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700'}`}
      >
        Enhance CV
      </button>

      {history.length > 0 && (
        <button
          onClick={handleSubmit}
          disabled={isProcessing}
          title="Refine the latest enhanced CV"
          className="mt-2 px-4 py-2 rounded text-white bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700"
        >
          Refine CV
        </button>
      )}

      <p className="mt-2 text-sm text-purple-700">
        {history.length === 0
          ? 'Enhance CV generates your first improved document.'
          : 'Refine CV iteratively polishes the latest version; use Enhance CV to start over.'}
      </p>

      {isProcessing && (
        <div className="mt-4 animate-spin h-8 w-8 border-4 border-purple-500 border-t-transparent rounded-full"></div>
      )}

      {error && <p className="mt-4 text-red-600">{error}</p>}

      {history.map(({ iteration: iter, match, metrics, urls }) => (
        <div key={iter} className="mt-6 w-full max-w-md p-4 bg-gradient-to-r from-white to-purple-50 rounded shadow">
          <h2 className="text-xl font-bold mb-2 text-purple-800">
            Round {iter + 1}: Skill Match Score: {match.enhancedScore}%
            {match.enhancedScore !== match.originalScore && ` (Original: ${match.originalScore}%)`}
          </h2>
          <p className="text-purple-700 mb-2">Original Title: {match.originalTitle || 'N/A'}</p>
          <p className="text-purple-700 mb-2">Modified Title: {match.modifiedTitle || 'N/A'}</p>
          <table className="w-full mb-2">
            <thead>
              <tr>
                <th className="text-left text-purple-800">Skill</th>
                <th className="text-right text-purple-800">Match</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const rows = [...(match.table || [])]
                while (rows.length < 5) rows.push({ skill: '—', matched: false })
                return rows.slice(0, 5).map((row, idx) => (
                  <tr key={`${row.skill}-${idx}`}>
                    <td className="py-1 text-purple-800">{row.skill}</td>
                    <td className="py-1 text-right">{row.matched ? '✓' : '✗'}</td>
                  </tr>
                ))
              })()}
            </tbody>
          </table>
          <p className="text-purple-700 mb-2">
            Added skills:{' '}
            {match.addedSkills.length > 0
              ? match.addedSkills.join(', ')
              : 'None'}
            {match.missingSkills.length > 0 && (
              <>
                <br />
                Missing skills: {match.missingSkills.join(', ')}
              </>
            )}
          </p>
          <p className="font-semibold text-purple-800">
            {formatMatchMessage(match.originalScore, match.enhancedScore)}
          </p>

          {metrics.length > 0 && (
            <table className="w-full mb-2 mt-4">
              <thead>
                <tr>
                  <th className="text-left text-purple-800">Metric</th>
                  <th className="text-right text-purple-800">Original</th>
                  <th className="text-right text-purple-800">Improved</th>
                  <th className="text-right text-purple-800">%Δ</th>
                  <th className="text-right text-purple-800">Action</th>
                </tr>
              </thead>
              <tbody>
                {[...metrics]
                  .sort((a, b) => metricOrder.indexOf(a.metric) - metricOrder.indexOf(b.metric))
                  .map((m) => (
                    <tr key={m.metric}>
                      <td className="py-1 text-purple-800">
                        {metricLabels[m.metric] || m.metric}
                      </td>
                      <td className="py-1 text-right">{m.original}</td>
                      <td className="py-1 text-right">{m.improved}</td>
                      <td className="py-1 text-right">{m.improvement}%</td>
                      <td className="py-1 text-right">
                        <button
                          onClick={() => handleImproveMetric(m.metric)}
                          className="text-blue-600 hover:underline"
                        >
                          Improve
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            {urls.map((file) => {
              let label
              switch (file.type) {
                case 'cover_letter1':
                  label = 'Cover Letter 1 (PDF)'
                  break
                case 'cover_letter2':
                  label = 'Cover Letter 2 (PDF)'
                  break
                case 'cv':
                  label = 'Improved CV (PDF)'
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
                <div key={file.type} className="p-4 bg-gradient-to-r from-white to-purple-50 rounded shadow text-center">
                  <p className="mb-2 font-semibold text-purple-800">{label}</p>
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-700 hover:underline"
                  >
                    Download PDF
                  </a>
                  <p className="mt-1 text-xs text-purple-600">
                    Link expires in one hour
                    {file.expiresAt && (
                      <> (expires at {new Date(file.expiresAt).toLocaleString()})</>
                    )}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

export default App
