let presetEnv = null

try {
  const resolvedPreset = require('@babel/preset-env')
  presetEnv = resolvedPreset?.default ?? resolvedPreset
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') {
    throw error
  }
  // In minimal install environments the preset may be missing. Jest only
  // relies on it for transforming syntax that Node already supports, so we
  // gracefully continue without it.
}

module.exports = {
  presets: [
    presetEnv && [presetEnv, { targets: { node: 'current' } }],
    ['@babel/preset-react', { runtime: 'automatic' }]
  ].filter(Boolean),
  plugins: ['@babel/plugin-syntax-import-meta']
}
