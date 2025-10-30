let presetEnv = null
let presetReact = null

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

try {
  const resolvedPreset = require('@babel/preset-react')
  presetReact = resolvedPreset?.default ?? resolvedPreset
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') {
    throw error
  }
}

module.exports = {
  presets: [
    presetEnv && [presetEnv, { targets: { node: 'current' } }],
    presetReact && [presetReact, { runtime: 'automatic' }],
  ].filter(Boolean),
  plugins: ['@babel/plugin-syntax-import-meta'],
}
