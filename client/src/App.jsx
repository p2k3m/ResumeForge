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

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Request failed')
      }

      setOutputFiles(data.urls || [])
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  const disabled = !linkedinUrl || !cvFile || isProcessing

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center p-4">
      <h1 className="text-3xl font-bold mb-4 text-center">Enhance Your CV with AI</h1>
      <p className="mb-6 text-center max-w-xl">
        Provide your LinkedIn profile and upload your CV to receive enhanced versions tailored to your job.
      </p>

      <div
        className="w-full max-w-md p-6 border-2 border-dashed border-gray-400 rounded-md mb-4 text-center bg-white"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        {cvFile ? (
          <p>{cvFile.name}</p>
        ) : (
          <p className="text-gray-500">Drag and drop your CV here, or click to select (PDF or DOCX, max 5MB)</p>
        )}
        <input
          type="file"
          accept=".pdf,.docx"
          onChange={handleFileChange}
          className="hidden"
          id="cv-input"
        />
        <label htmlFor="cv-input" className="block mt-2 text-blue-600 cursor-pointer">
          Choose File
        </label>
      </div>

      <input
        type="url"
        placeholder="Enter LinkedIn job URL"
        value={linkedinUrl}
        onChange={(e) => setLinkedinUrl(e.target.value)}
        className="w-full max-w-md p-2 border rounded mb-4"
      />

      <button
        onClick={handleSubmit}
        disabled={disabled}
        className={`px-4 py-2 rounded text-white ${disabled ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}
      >
        Enhance CV Now
      </button>

      {isProcessing && (
        <div className="mt-4 animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
      )}

      {error && <p className="mt-4 text-red-600">{error}</p>}

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-md">
        {outputFiles.map((file) => (
          <div key={file.type} className="p-4 bg-white rounded shadow text-center">
            <p className="mb-2 font-semibold">Enhanced CV ({file.type.toUpperCase()})</p>
            <a href={file.url} className="text-blue-600 hover:underline">
              {file.type === 'pdf' ? 'Download PDF' : 'Download Word'}
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}

export default App
