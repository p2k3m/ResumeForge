# CloudFront distribution reference

The **canonical production CloudFront domain** for ResumeForge lives in [`config/published-cloudfront.json`](../config/published-cloudfront.json). Treat that JSON file as the single source of truth for downstream docs, announcements, and redirects.

```json
{
  "stackName": "ResumeForge",
  "url": "https://dk892hgnzrcsl.cloudfront.net",
  "distributionId": "E2XOR1G42QPKU2",
  "updatedAt": "2024-06-03T00:00:00.000Z"
}
```

## Active domain snapshot

- **Production CloudFront URL:** [`https://dk892hgnzrcsl.cloudfront.net`](https://dk892hgnzrcsl.cloudfront.net)
- **Published:** 3 June 2024, 00:00 UTC

This document and the project README mirror the latest domain so onboarding teams can copy the canonical URL without installing the CLI helpers or loading the app.

## Updating the published URL

1. Deploy the CloudFormation/SAM stack.
2. Run `npm run print:cloudfront-url -- <stack-name>` to confirm the CloudFront domain that the deployment produced.
3. When you are ready to publish that domain, run `npm run publish:cloudfront-url -- <stack-name>`. This writes the latest distribution metadata to `config/published-cloudfront.json` and issues `/*` invalidations for both the previously published distribution (if one exists) and the active distribution so caches are purged immediately, even when the stack reuses the same distribution id.
4. Commit the updated JSON file so the new domain is visible to the team.

The script automatically invalidates the previously published distribution after every run and updates the helper endpoints that surface the active domain:

- `GET /api/published-cloudfront`
- `GET /go/cloudfront` (alias `/redirect/latest`)

These endpoints reflect whatever value is stored in `config/published-cloudfront.json`, so keeping that file current keeps all documentation and redirects accurate.

Before broadcasting the updated domain, run the verification helper to ensure the distribution answers its `/healthz` probe:

```bash
npm run verify:cloudfront
```

Pass an explicit URL to validate a newly deployed stack before publishing:

```bash
npm run verify:cloudfront -- https://d123456abcdef8.cloudfront.net/prod
```

After publishing, share the refreshed domain from `config/published-cloudfront.json` with downstream consumers so they can update bookmarks, integrations, or public references.
