import React from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import App from './App.jsx'
import { bootstrapApp } from './bootstrapApp.js'
import '@fontsource-variable/inter/wght.css'
import '@fontsource-variable/inter/wght-italic.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/700.css'
import './index.css'

const resolvedImportMetaEnv =
  (typeof import.meta !== 'undefined' &&
    import.meta &&
    typeof import.meta === 'object' &&
    import.meta.env) ||
  globalThis.__RESUMEFORGE_IMPORT_META_ENV__ ||
  {}

bootstrapApp({
  documentRef: typeof document !== 'undefined' ? document : undefined,
  windowRef: typeof window !== 'undefined' ? window : undefined,
  importMetaEnv: resolvedImportMetaEnv,
  AppComponent: App,
  reactDomClient: { createRoot, hydrateRoot }
})

if (
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  !resolvedImportMetaEnv.DEV
) {
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
