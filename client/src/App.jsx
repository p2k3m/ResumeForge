import { useState } from 'react'

function App() {
  const [jobUrl, setJobUrl] = useState('')
  const [cvFile, setCvFile] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file && !file.name.toLowerCase().match(/\.(pdf|docx)$/)) {
      setError('Only PDF or DOCX files are supported.')
      return
    }
    setCvFile(file)
  }

  const handleSubmit = async () => {
    setIsProcessing(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('resume', cvFile)
      formData.append('jobDescriptionUrl', jobUrl)
      const response = await fetch(`${API_BASE_URL}/api/evaluate`, {
        method: 'POST',
        body: formData,
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || 'Request failed')
      }
      const data = await response.json()
      setResult(data)
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setIsProcessing(false)
    }
  }

  const disabled = !jobUrl || !cvFile || isProcessing

  return (
    <div className="min-h-screen bg-gradient-to-r from-blue-200 to-purple-300 flex flex-col items-center p-4">
      <h1 className="text-3xl font-bold mb-4 text-center text-purple-800">Evaluate Your CV</h1>
      <p className="mb-6 text-center max-w-xl text-indigo-800">
        Upload your CV and provide the job description URL to evaluate how well it matches.
      </p>

      <input
        type="file"
        accept=".pdf,.docx"
        onChange={handleFileChange}
        className="mb-4"
        aria-label="Choose File"
      />

      <input
        type="url"
        placeholder="Job Description URL"
        value={jobUrl}
        onChange={(e) => setJobUrl(e.target.value)}
        className="w-full max-w-md p-2 border border-purple-300 rounded mb-4"
      />

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
          <p className="text-purple-800 mb-2">
            Designation: {result.candidateTitle || 'N/A'} vs {result.jobTitle || 'N/A'} ({result.designationMatch ? 'Match' : 'Mismatch'})
          </p>
          {result.missingSkills && result.missingSkills.length > 0 && (
            <p className="text-purple-800 mb-2">
              Missing skills: {result.missingSkills.join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default App
