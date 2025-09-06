import { useState } from 'react'

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
  const [showDesignationInput, setShowDesignationInput] = useState(false)
  const [expOptions, setExpOptions] = useState([])
  const [eduOptions, setEduOptions] = useState([])
  const [certOptions, setCertOptions] = useState([])
  const [cvKey, setCvKey] = useState('')
  const [cvTextKey, setCvTextKey] = useState('')
  const [finalScore, setFinalScore] = useState(null)
  const [improvement, setImprovement] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
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

  const handleSubmit = async () => {
    setIsProcessing(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('resume', cvFile)
      formData.append('jobDescriptionUrl', jobUrl)
      if (linkedinUrl) formData.append('linkedinProfileUrl', linkedinUrl)
      if (credlyUrl) formData.append('credlyProfileUrl', credlyUrl)
      const response = await fetch(`${API_BASE_URL}/api/evaluate`, {
        method: 'POST',
        body: formData,
      })
      if (response.status === 400) {
        const text = await response.text()
        setError(text || 'Request failed')
        return
      }
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || 'Request failed')
      }
      const data = await response.json()
      setResult(data)
      setSkills(data.missingSkills || [])
      setExpOptions((data.missingExperience || []).map((t) => ({ text: t, checked: false })))
      setEduOptions((data.missingEducation || []).map((t) => ({ text: t, checked: false })))
      setCertOptions(
        (data.missingCertifications || []).map((c) => ({
          text: c.provider ? `${c.name} - ${c.provider}` : c.name,
          data: c,
          checked: false
        }))
      )
      if (!data.designationMatch) {
        alert('Designation mismatch detected. Please enter a revised designation.')
        setShowDesignationInput(true)
      }
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setIsProcessing(false)
    }
  }

  const disabled = !jobUrl || !cvFile || isProcessing

  const handleSkillChange = (idx, value) => {
    setSkills((prev) => prev.map((s, i) => (i === idx ? value : s)))
  }

  const addSkill = () => setSkills((prev) => [...prev, ''])

  const toggleOption = (setter) => (idx) => {
    setter((prev) =>
      prev.map((o, i) => (i === idx ? { ...o, checked: !o.checked } : o))
    )
  }

  const handleImproveCv = async () => {
    setIsProcessing(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('resume', cvFile)
      formData.append('jobDescriptionUrl', jobUrl)
      formData.append('linkedinProfileUrl', linkedinUrl)
      if (credlyUrl) formData.append('credlyProfileUrl', credlyUrl)
      formData.append('addedSkills', JSON.stringify(skills))
      const selectedExperience = expOptions.filter((o) => o.checked).map((o) => o.text)
      const selectedEducation = eduOptions.filter((o) => o.checked).map((o) => o.text)
      const selectedCertifications = certOptions
        .filter((o) => o.checked)
        .map((o) => o.data)
      formData.append('selectedExperience', JSON.stringify(selectedExperience))
      formData.append('selectedEducation', JSON.stringify(selectedEducation))
      formData.append('selectedCertifications', JSON.stringify(selectedCertifications))
      const response = await fetch(`${API_BASE_URL}/api/process-cv`, {
        method: 'POST',
        body: formData
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || 'Request failed')
      }
      const data = await response.json()
      setCvKey(data.existingCvKey || '')
      setCvTextKey(data.cvTextKey || '')
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleGenerateCoverLetter = async () => {
    setIsProcessing(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('resume', cvFile)
      formData.append('jobDescriptionUrl', jobUrl)
      formData.append('linkedinProfileUrl', linkedinUrl)
      if (credlyUrl) formData.append('credlyProfileUrl', credlyUrl)
      const selectedCertifications = certOptions
        .filter((o) => o.checked)
        .map((o) => o.data)
      formData.append('selectedCertifications', JSON.stringify(selectedCertifications))
      const response = await fetch(
        `${API_BASE_URL}/api/generate-cover-letter`,
        {
          method: 'POST',
          body: formData
        }
      )
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || 'Request failed')
      }
      await response.json()
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCompile = async () => {
    setIsProcessing(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('jobDescriptionUrl', jobUrl)
      formData.append('linkedinProfileUrl', linkedinUrl)
      if (credlyUrl) formData.append('credlyProfileUrl', credlyUrl)
      formData.append('existingCvKey', cvKey)
      formData.append('existingCvTextKey', cvTextKey)
      formData.append('originalScore', result?.atsScore || 0)
      formData.append('addedSkills', JSON.stringify(skills))
      const selectedExperience = expOptions.filter((o) => o.checked).map((o) => o.text)
      const selectedEducation = eduOptions.filter((o) => o.checked).map((o) => o.text)
      const selectedCertifications = certOptions
        .filter((o) => o.checked)
        .map((o) => o.data)
      formData.append('selectedExperience', JSON.stringify(selectedExperience))
      formData.append('selectedEducation', JSON.stringify(selectedEducation))
      formData.append('selectedCertifications', JSON.stringify(selectedCertifications))
      if (designationOverride)
        formData.append('designation', designationOverride)
      const response = await fetch(`${API_BASE_URL}/api/compile`, {
        method: 'POST',
        body: formData
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || 'Request failed')
      }
      const data = await response.json()
      setFinalScore(data.atsScore)
      setImprovement(data.improvement)
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
        className={`mb-4 p-4 border-2 border-dashed rounded ${
          isDragging ? 'border-blue-500 bg-blue-100' : 'border-purple-300'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept=".pdf,.docx"
          onChange={handleFileChange}
          aria-label="Choose File"
        />
      </div>

      <input
        type="url"
        placeholder="Job Description URL"
        value={jobUrl}
        onChange={(e) => setJobUrl(e.target.value)}
        className="w-full max-w-md p-2 border border-purple-300 rounded mb-4"
      />

      <input
        type="url"
        placeholder="LinkedIn Profile URL"
        value={linkedinUrl}
        onChange={(e) => setLinkedinUrl(e.target.value)}
        className="w-full max-w-md p-2 border border-purple-300 rounded mb-4"
      />

      <input
        type="url"
        placeholder="Credly Profile URL"
        value={credlyUrl}
        onChange={(e) => setCredlyUrl(e.target.value)}
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
            Designation: {result.originalTitle || 'N/A'} vs {result.jobTitle || 'N/A'} ({result.designationMatch ? 'Match' : 'Mismatch'})
          </p>
          {skills.length > 0 && (
            <div className="text-purple-800 mb-2">
              <p className="mb-2">Missing skills:</p>
              {skills.map((skill, idx) => (
                <input
                  key={idx}
                  value={skill}
                  placeholder="Skill"
                  onChange={(e) => handleSkillChange(idx, e.target.value)}
                  className="w-full p-2 border border-purple-300 rounded mb-2"
                />
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
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleImproveCv}
              className="px-4 py-2 bg-blue-500 text-white rounded"
            >
              Improve CV
            </button>
            <button
              onClick={handleGenerateCoverLetter}
              className="px-4 py-2 bg-green-500 text-white rounded"
            >
              Generate Cover Letter
            </button>
            <button
              onClick={handleCompile}
              className="px-4 py-2 bg-purple-600 text-white rounded"
            >
              Generate Final CV & Cover Letter
            </button>
          </div>
          {finalScore !== null && (
            <p className="text-purple-800 mt-2">
              Final ATS Score: {finalScore}% (Improvement: {improvement}% )
            </p>
          )}
        </div>
      )}

      {showDesignationInput && (
        <div className="mt-4 w-full max-w-md">
          <input
            type="text"
            placeholder="Revised Designation"
            value={designationOverride}
            onChange={(e) => setDesignationOverride(e.target.value)}
            className="w-full p-2 border border-purple-300 rounded mb-4"
          />
        </div>
      )}
    </div>
  )
}

export default App
