# CloudFront troubleshooting

When the published CloudFront domain stops responding, use the verification helper to confirm whether the CDN is reachable and serving the expected health payload.

## 1. Run the verifier

```bash
npm run verify:cloudfront
```

- The command reads the canonical distribution metadata from `config/published-cloudfront.json` and probes the `/healthz` endpoint on the recorded URL.
- A successful check prints `status "ok"` with the fully-qualified URL.
- A failure such as `Failed to reach https://dk892hgnzrcsl.cloudfront.net/healthz: fetch failed` means the CDN cannot be reached from the current network or the distribution is offline.

## 2. Validate the metadata

Open [`config/published-cloudfront.json`](../config/published-cloudfront.json) and confirm the stored domain matches the most recent deployment output. Outdated metadata will cause the verifier and redirect endpoints to probe the wrong distribution.

## 3. Redeploy if necessary

If the CloudFront distribution was removed or replaced, redeploy the SAM stack and republish the fresh metadata:

```bash
sam build --use-container
sam deploy --guided
npm run publish:cloudfront-url -- <stack-name>
```

This rebuilds the Lambda/API Gateway stack, updates `config/published-cloudfront.json`, and issues cache invalidations so the new CDN becomes the canonical entry point.

## 4. Share the working domain

Once the verifier succeeds, broadcast the CloudFront URL recorded in `config/published-cloudfront.json` (also mirrored in [`docs/cloudfront-url.md`](cloudfront-url.md)) so the team and candidates use the active distribution.
