import React from 'react'

export function bootstrapApp({
  documentRef,
  windowRef,
  importMetaEnv = {},
  AppComponent,
  reactDomClient
}) {
  console.log('bootstrapApp called');
  if (!documentRef || typeof documentRef.getElementById !== 'function') {
    throw new Error('bootstrapApp requires a documentRef with DOM helpers')
  }
  if (!AppComponent) {
    throw new Error('bootstrapApp requires an AppComponent to render')
  }
  if (!reactDomClient || typeof reactDomClient.createRoot !== 'function' || typeof reactDomClient.hydrateRoot !== 'function') {
    throw new Error('bootstrapApp requires reactDomClient with createRoot and hydrateRoot')
  }

  const container = documentRef.getElementById('root')
  const metaTag = documentRef.querySelector?.('meta[name="resumeforge-api-base"]')
  const metaContent = metaTag?.content
  const sanitizedMetaBase = typeof metaContent === 'string' ? metaContent.trim() : ''

  if (
    windowRef &&
    typeof windowRef.__RESUMEFORGE_API_BASE_URL__ === 'undefined'
  ) {
    const envBase =
      typeof importMetaEnv.VITE_API_BASE_URL === 'string'
        ? importMetaEnv.VITE_API_BASE_URL.trim()
        : ''
    const initialBase = sanitizedMetaBase || envBase
    if (initialBase && initialBase !== 'undefined' && initialBase !== 'null') {
      windowRef.__RESUMEFORGE_API_BASE_URL__ = initialBase
    }
  }

  const app = React.createElement(
    React.StrictMode,
    null,
    React.createElement(AppComponent, null)
  )

  if (container?.hasChildNodes?.()) {
    reactDomClient.hydrateRoot(container, app)
  } else if (container) {
    reactDomClient.createRoot(container).render(app)
  }

  return { container, app }
}

export default bootstrapApp
