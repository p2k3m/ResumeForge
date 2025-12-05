/**
 * @jest-environment jsdom
 */
import React from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals'

let bootstrapApp

beforeAll(async () => {
  ; ({ bootstrapApp } = await import('../bootstrapApp.js'))
})

const renderMock = jest.fn()
const createRootMock = jest.fn(() => ({ render: renderMock }))
const hydrateRootMock = jest.fn()

const AppShell = () =>
  React.createElement('div', { 'data-testid': 'app-shell' }, 'ResumeForge App')

const reactDomClient = {
  createRoot: (...args) => createRootMock(...args),
  hydrateRoot: (...args) => hydrateRootMock(...args)
}

beforeEach(() => {
  renderMock.mockReset()
  createRootMock.mockReset()
  hydrateRootMock.mockReset()
  createRootMock.mockImplementation(() => ({ render: renderMock }))
  document.body.innerHTML = ''
  document.head.innerHTML = ''
  delete window.__RESUMEFORGE_API_BASE_URL__
  delete window.__RESUMEFORGE_APP_MOUNTED__
})

afterEach(() => {
  document.body.innerHTML = ''
  document.head.innerHTML = ''
  delete window.__RESUMEFORGE_API_BASE_URL__
  delete window.__RESUMEFORGE_APP_MOUNTED__
})

describe('client bootstrap', () => {
  it('hydrates pre-rendered markup and records the API base from the meta tag', () => {
    document.head.innerHTML =
      '<meta name="resumeforge-api-base" content=" https://api.resume-forge.example.com " />'
    document.body.innerHTML = '<div id="root"><span>ssr</span></div>'

    const result = bootstrapApp({
      documentRef: document,
      windowRef: window,
      importMetaEnv: { DEV: true },
      AppComponent: AppShell,
      reactDomClient
    })

    expect(hydrateRootMock).toHaveBeenCalledTimes(1)
    expect(createRootMock).not.toHaveBeenCalled()

    const [container, element] = hydrateRootMock.mock.calls[0]
    const strictModeChild = Array.isArray(element.props.children)
      ? element.props.children[0]
      : element.props.children
    expect(container).not.toBeNull()
    expect(container.id).toBe('root')
    expect(strictModeChild.type).toBe(AppShell)
    expect(result.container).toBe(container)
    expect(window.__RESUMEFORGE_API_BASE_URL__).toBe(
      'https://api.resume-forge.example.com'
    )
  })

  it('creates a client root when no server markup is present', () => {
    document.body.innerHTML = '<div id="root"></div>'

    bootstrapApp({
      documentRef: document,
      windowRef: window,
      importMetaEnv: { DEV: true },
      AppComponent: AppShell,
      reactDomClient
    })

    expect(createRootMock).toHaveBeenCalledTimes(1)
    expect(renderMock).toHaveBeenCalledTimes(1)
    expect(hydrateRootMock).not.toHaveBeenCalled()
  })

  it('respects an existing API base override on the window', () => {
    window.__RESUMEFORGE_API_BASE_URL__ = 'https://existing.example.com'
    document.body.innerHTML = '<div id="root"></div>'

    bootstrapApp({
      documentRef: document,
      windowRef: window,
      importMetaEnv: { DEV: true, VITE_API_BASE_URL: 'https://api.resume-forge.example.com' },
      AppComponent: AppShell,
      reactDomClient
    })

    expect(window.__RESUMEFORGE_API_BASE_URL__).toBe('https://existing.example.com')
  })
})
