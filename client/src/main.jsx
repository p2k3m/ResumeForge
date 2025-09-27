import React from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'

const container = document.getElementById('root')

const metaTag = document.querySelector('meta[name="resumeforge-api-base"]')
const metaContent = metaTag?.content
const sanitizedMetaBase = typeof metaContent === 'string' ? metaContent.trim() : ''

if (typeof window !== 'undefined' && typeof window.__RESUMEFORGE_API_BASE_URL__ === 'undefined') {
  const envBase =
    typeof import.meta.env.VITE_API_BASE_URL === 'string'
      ? import.meta.env.VITE_API_BASE_URL.trim()
      : ''
  const initialBase = sanitizedMetaBase || envBase
  if (initialBase && initialBase !== 'undefined' && initialBase !== 'null') {
    window.__RESUMEFORGE_API_BASE_URL__ = initialBase
  }
}

const app = (
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

if (container?.hasChildNodes()) {
  hydrateRoot(container, app)
} else if (container) {
  createRoot(container).render(app)
}

if (typeof window !== 'undefined' && 'serviceWorker' in navigator && !import.meta.env.DEV) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then((registration) => {
        if ('sync' in registration) {
          const registerSync = () => {
            registration.sync.register('resumeForgeUpload').catch(() => {})
          }
          window.addEventListener('online', registerSync)
          if (navigator.onLine) {
            registerSync()
          }
        } else if (registration.active) {
          const requestReplay = () => {
            registration.active.postMessage({ type: 'RETRY_UPLOADS' })
          }
          window.addEventListener('online', requestReplay)
          if (navigator.onLine) {
            requestReplay()
          }
        }
      })
      .catch(() => {})
  })
}
