
const html = `<!doctype html>
      <html>
        <head>
          <script type="module" src="/assets/index-d438c9c1.js"></script>
        </head>
        <body></body>
      </html>`;

const assetPattern =
    /["']((?:\/?|(?:\.{1,2}\/)+)?(?:[\w.-]+\/)*assets\/index-[\w.-]+\.(?:css|js))(?:\?([^"'\s>]+))?["']/g;

let match;
while ((match = assetPattern.exec(html)) !== null) {
    console.log('Match:', match[1]);
}
