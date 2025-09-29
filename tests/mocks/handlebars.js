function tokenize(template) {
  const tokens = []
  let index = 0
  while (index < template.length) {
    const open = template.indexOf('{{', index)
    if (open === -1) {
      tokens.push({ type: 'text', value: template.slice(index) })
      break
    }
    if (open > index) {
      tokens.push({ type: 'text', value: template.slice(index, open) })
    }
    const isTriple = template.startsWith('{{{', open)
    const closeToken = isTriple ? '}}}' : '}}'
    const close = template.indexOf(closeToken, open + 2)
    if (close === -1) {
      tokens.push({ type: 'text', value: template.slice(open) })
      break
    }
    const raw = template
      .slice(open + (isTriple ? 3 : 2), close)
      .trim()
    tokens.push({ type: isTriple ? 'triple' : 'tag', value: raw })
    index = close + closeToken.length
  }
  return trimStandaloneBlocks(tokens)
}

function trimStandaloneBlocks(tokens) {
  const result = tokens.slice()
  const isStandaloneTag = (value) => {
    if (!value) return false
    const first = value[0]
    return first === '#' || first === '/' || value === 'else'
  }

  for (let i = 0; i < result.length; i++) {
    const token = result[i]
    if (token.type !== 'tag' || !isStandaloneTag(token.value)) continue
    const prev = result[i - 1]
    const next = result[i + 1]
    if (prev && prev.type === 'text') {
      const lastNewline = Math.max(prev.value.lastIndexOf('\n'), prev.value.lastIndexOf('\r'))
      if (lastNewline === -1) {
        if (prev.value.trim() === '') {
          prev.value = ''
        }
      } else {
        const lastLine = prev.value.slice(lastNewline + 1)
        if (lastLine.trim() === '') {
          prev.value = prev.value.slice(0, lastNewline + 1)
        }
      }
    }
    if (next && next.type === 'text') {
      if (next.value.startsWith('\r\n')) {
        next.value = next.value.slice(2)
      } else if (next.value.startsWith('\n')) {
        next.value = next.value.slice(1)
      }
    }
  }

  return result.filter((token) => token.type !== 'text' || token.value !== '')
}

function parse(template) {
  const tokens = tokenize(template)
  const root = []
  const stack = [{ type: 'root', children: root }]
  const pushNode = (node) => {
    stack[stack.length - 1].children.push(node)
  }

  for (const token of tokens) {
    if (token.type === 'text') {
      pushNode({ type: 'text', value: token.value })
      continue
    }
    if (token.type === 'triple') {
      pushNode({ type: 'triple', expression: token.value })
      continue
    }
    if (token.value.startsWith('#each')) {
      const expression = token.value.slice(5).trim()
      const node = { type: 'each', expression, children: [] }
      pushNode(node)
      stack.push(node)
      continue
    }
    if (token.value.startsWith('#if')) {
      const expression = token.value.slice(3).trim()
      const node = { type: 'if', expression, children: [] }
      pushNode(node)
      stack.push(node)
      continue
    }
    if (token.value.startsWith('/')) {
      stack.pop()
      continue
    }
    pushNode({ type: 'var', expression: token.value })
  }
  return root
}

function getFromContext(context, path) {
  if (!path) return context
  if (path === '.' || path === 'this') return context
  const segments = path.split('.').filter(Boolean)
  let value = context
  for (const segment of segments) {
    if (segment === 'this') continue
    if (value == null) return undefined
    value = value[segment]
  }
  return value
}

function resolve(expression, context, stack) {
  expression = expression.trim()
  if (expression === 'this' || expression === '.') return context
  let value = getFromContext(context, expression)
  if (value !== undefined) return value
  for (const parent of stack) {
    value = getFromContext(parent, expression)
    if (value !== undefined) return value
  }
  return ''
}

function truthy(value) {
  if (Array.isArray(value)) return value.length > 0
  return !!value
}

function renderAst(ast, context, stack) {
  let output = ''
  for (const node of ast) {
    if (node.type === 'text') {
      output += node.value
    } else if (node.type === 'var') {
      const value = resolve(node.expression, context, stack)
      output += value == null ? '' : String(value)
    } else if (node.type === 'triple') {
      const value = resolve(node.expression, context, stack)
      output += value == null ? '' : String(value)
    } else if (node.type === 'if') {
      const value = resolve(node.expression, context, stack)
      if (truthy(value)) {
        output += renderAst(node.children, context, stack)
      }
    } else if (node.type === 'each') {
      const collection = resolve(node.expression, context, stack)
      if (Array.isArray(collection)) {
        for (const item of collection) {
          const childContext = item
          output += renderAst(
            node.children,
            childContext,
            [context, ...stack]
          )
        }
      } else if (
        collection &&
        typeof collection === 'object' &&
        collection !== null
      ) {
        for (const key of Object.keys(collection)) {
          const childContext = collection[key]
          output += renderAst(
            node.children,
            childContext,
            [context, ...stack]
          )
        }
      }
    }
  }
  return output
}

function compile(template) {
  const ast = parse(template)
  return (data = {}) => renderAst(ast, data, [])
}

export default {
  create() {
    const helpers = {}
    return {
      helpers,
      registerHelper(name, fn) {
        helpers[name] = fn
      },
      compile
    }
  }
}
