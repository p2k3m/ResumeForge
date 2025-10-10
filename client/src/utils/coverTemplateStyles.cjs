const COVER_TEMPLATE_STYLE_MAP = {
  cover_modern: {
    header: 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white',
    footer: 'border-t border-slate-800/40 bg-slate-900/90 text-slate-100',
    border: 'border-purple-200 bg-white',
    line: 'bg-slate-200/80',
    highlight: 'bg-purple-500/10 text-purple-800',
    badge: 'bg-purple-100 text-purple-700'
  },
  cover_classic: {
    header: 'bg-gradient-to-r from-amber-700 via-amber-600 to-rose-600 text-amber-50',
    footer: 'border-t border-amber-200 bg-amber-100 text-amber-700',
    border: 'border-amber-200 bg-amber-50/70',
    line: 'bg-amber-200/80',
    highlight: 'bg-amber-500/15 text-amber-900',
    badge: 'bg-amber-100 text-amber-700'
  },
  cover_professional: {
    header: 'bg-gradient-to-r from-slate-900 via-blue-900 to-blue-700 text-slate-50',
    footer: 'border-t border-slate-200 bg-slate-100 text-slate-700',
    border: 'border-slate-300 bg-slate-50',
    line: 'bg-slate-200/80',
    highlight: 'bg-blue-500/10 text-blue-900',
    badge: 'bg-blue-100 text-blue-700'
  },
  cover_ats: {
    header: 'bg-gradient-to-r from-slate-700 via-slate-600 to-slate-500 text-white',
    footer: 'border-t border-slate-200 bg-slate-100 text-slate-700',
    border: 'border-slate-200 bg-white',
    line: 'bg-slate-300/70',
    highlight: 'bg-slate-400/10 text-slate-700',
    badge: 'bg-slate-200 text-slate-700'
  },
  cover_2025: {
    header: 'bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-500 text-cyan-100',
    footer: 'border-t border-slate-700 bg-slate-900 text-cyan-100',
    border: 'border-slate-700 bg-slate-900 text-slate-100',
    line: 'bg-slate-600/80',
    highlight: 'bg-cyan-400/20 text-cyan-100',
    badge: 'bg-cyan-500/30 text-cyan-100'
  }
}

const DEFAULT_COVER_TEMPLATE_STYLE = {
  header: 'bg-gradient-to-r from-slate-700 via-slate-600 to-slate-500 text-white',
  footer: 'border-t border-slate-200 bg-slate-100 text-slate-600',
  border: 'border-slate-200 bg-white',
  line: 'bg-slate-200/80',
  highlight: 'bg-slate-500/10 text-slate-700',
  badge: 'bg-slate-200 text-slate-600'
}

const getCoverTemplateStyle = (templateId) => {
  if (!templateId || typeof templateId !== 'string') {
    return DEFAULT_COVER_TEMPLATE_STYLE
  }
  return COVER_TEMPLATE_STYLE_MAP[templateId] || DEFAULT_COVER_TEMPLATE_STYLE
}

module.exports = getCoverTemplateStyle
module.exports.default = getCoverTemplateStyle
module.exports.COVER_TEMPLATE_STYLE_MAP = COVER_TEMPLATE_STYLE_MAP
module.exports.DEFAULT_COVER_TEMPLATE_STYLE = DEFAULT_COVER_TEMPLATE_STYLE
module.exports.getCoverTemplateStyle = getCoverTemplateStyle
