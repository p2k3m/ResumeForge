import { useState, useCallback } from 'react'

function App() {
  const [linkedinUrl, setLinkedinUrl] = useState('')
  const [cvFile, setCvFile] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [outputFiles, setOutputFiles] = useState([])
  const [error, setError] = useState('')

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && file.name.toLowerCase().endsWith('.doc')) {
      setError('.doc files are not supported.')
      return
    }
    if (file) setCvFile(file)
  }, [])

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file && file.name.toLowerCase().endsWith('.doc')) {
      setError('.doc files are not supported.')
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
      formData.append('jobDescriptionUrl', linkedinUrl)

      const response = await fetch('/api/process-cv', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || 'Request failed')
      }

      const contentType = response.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        const text = await response.text()
        throw new Error(text || 'Invalid JSON response')
      }

      const data = await response.json()

      setOutputFiles(data.urls || [])
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  const disabled = !linkedinUrl || !cvFile || isProcessing

  return (
    <div className="min-h-screen bg-gradient-to-r from-blue-200 to-purple-300 flex flex-col items-center p-4">
      <h1 className="text-3xl font-bold mb-4 text-center text-purple-800">Enhance Your CV</h1>
      <p className="mb-6 text-center max-w-xl text-indigo-800">
        Provide your LinkedIn profile and upload your CV to receive enhanced versions tailored to your job.
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
        placeholder="Enter LinkedIn job URL"
        value={linkedinUrl}
        onChange={(e) => setLinkedinUrl(e.target.value)}
        className="w-full max-w-md p-2 border border-purple-300 rounded mb-4"
      />

      <button
        onClick={handleSubmit}
        disabled={disabled}
        className={`px-4 py-2 rounded text-white ${disabled ? 'bg-purple-300' : 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700'}`}
      >
        Enhance CV Now
      </button>

      {isProcessing && (
        <div className="mt-4 animate-spin h-8 w-8 border-4 border-purple-500 border-t-transparent rounded-full"></div>
      )}

      {error && <p className="mt-4 text-red-600">{error}</p>}

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-md">
        {outputFiles.map((file) => (
          <div key={file.type} className="p-4 bg-gradient-to-r from-white to-purple-50 rounded shadow text-center">
            <p className="mb-2 font-semibold text-purple-800">Enhanced CV ({file.type.toUpperCase()})</p>
            <a href={file.url} className="text-purple-700 hover:underline">
              {file.type === 'pdf' ? 'Download PDF' : 'Download Word'}
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}

export default App
