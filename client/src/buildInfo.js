export function getBuildVersion() {
  if (typeof __BUILD_VERSION__ !== 'undefined' && __BUILD_VERSION__) {
    return __BUILD_VERSION__
  }

  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_BUILD_VERSION) {
    return import.meta.env.VITE_BUILD_VERSION
  }

  return 'dev'
}

export const BUILD_VERSION = getBuildVersion()
