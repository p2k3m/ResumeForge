
const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="resumeforge-api-base" content="https://a1b2c3d4e5.execute-api.ap-south-1.amazonaws.com/prod" />
    <script id="resumeforge-cloudfront-metadata">window.__RESUMEFORGE_CLOUDFRONT_METADATA__ = {"success":true,"cloudfront":{"stackName":"ResumeForge","url":"https://d109hwmzrqr39w.cloudfront.net","distributionId":"E2HWMZRQR39W0","apiGatewayUrl":"https://a1b2c3d4e5.execute-api.ap-south-1.amazonaws.com/prod","originBucket":"resume-forge-app-2025","originRegion":"ap-south-1","originPath":"/static/client/prod/latest","updatedAt":"2025-03-18T09:30:00.000Z","degraded":false}};</script>
    <script>
      ;(function seedPublishedCloudfrontMetadata() {
        // ...
      })()
    </script>
    <title>ResumeForge</title>
    <script type="module" crossorigin src="./assets/index-70ce539f.js"></script>
    <link rel="stylesheet" href="./assets/index-88182d50.css">
  </head>
  <body>
    <div id="root"></div>
    
  </body>
</html>`;

const assetPattern =
    /(?:src|href)=["']([^"']*assets\/(?:v[\w.-]+\/)?index-(?!latest(?:\.|$))[\w.-]+\.(?:css|js))(?:\?[^"'>\s]+)?["']/gi

let match
while ((match = assetPattern.exec(html)) !== null) {
    console.log('Match found:', match[1]);
}

console.log('Done');
