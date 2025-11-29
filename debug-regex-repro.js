
const HASHED_ENTRY_SCRIPT_PATTERN =
    /<script\b[^>]*\bsrc=("|')[^"'>]*assets\/index-(?!latest(?:\.|$))[\w.-]+\.js(?:\?[^"'>]*)?\1[^>]*>\s*<\/script>\s*/gi
const HASHED_ENTRY_STYLESHEET_PATTERN =
    /<link\b[^>]*\bhref=("|')[^"'>]*assets\/index-(?!latest(?:\.|$))[\w.-]+\.css(?:\?[^"'>]*)?\1[^>]*>\s*/gi

const html = `
      <html>
        <head>
          <script type="module" crossorigin src="./assets/index-abc12345.js"></script>
          <link rel="stylesheet" href="./assets/index-abc12345.css" />
        </head>
        <body></body>
      </html>
    `

console.log('Original HTML:', html)

let updated = html.replace(HASHED_ENTRY_SCRIPT_PATTERN, '')
updated = updated.replace(HASHED_ENTRY_STYLESHEET_PATTERN, '')

console.log('Updated HTML:', updated)

if (updated.includes('index-abc12345.js')) {
    console.log('FAIL: Script not removed')
} else {
    console.log('PASS: Script removed')
}

if (updated.includes('index-abc12345.css')) {
    console.log('FAIL: Stylesheet not removed')
} else {
    console.log('PASS: Stylesheet removed')
}
