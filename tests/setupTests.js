import('@testing-library/jest-dom').catch((error) => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND' && error.code !== 'MODULE_NOT_FOUND') {
    throw error
  }
})
