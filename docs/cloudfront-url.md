# CloudFront distribution reference

The **canonical production CloudFront domain** for ResumeForge lives in [`config/published-cloudfront.json`](../config/published-cloudfront.json). Treat that JSON file as the single source of truth for downstream docs, announcements, and redirects.

```json
{
  "stackName": "ResumeForge",
  "url": "https://d3exampleabcdef8.cloudfront.net",
  "distributionId": "E123456789ABC",
  "updatedAt": "2024-05-28T00:00:00.000Z"
}
```

## Updating the published URL

1. Deploy the CloudFormation/SAM stack.
2. Run `npm run publish:cloudfront-url -- <stack-name>` to refresh `config/published-cloudfront.json` with the most recent distribution metadata.
3. Commit the updated JSON file so the new domain is visible to the team.

The script automatically invalidates the previous distribution (when it changes) and updates the helper endpoints that surface the active domain:

- `GET /api/published-cloudfront`
- `GET /go/cloudfront` (alias `/redirect/latest`)

These endpoints reflect whatever value is stored in `config/published-cloudfront.json`, so keeping that file current keeps all documentation and redirects accurate.
