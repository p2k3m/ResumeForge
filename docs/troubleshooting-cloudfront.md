# CloudFront troubleshooting

When the published CloudFront domain stops responding, use the verification helper to confirm whether the CDN is reachable and serving the expected health payload. The runbook below walks through verifying the outage, validating the recorded metadata, and republishing a working distribution.

> **Break-glass override:** If CloudFront refuses to serve newly uploaded assets but you must move forward temporarily (for example, during an ongoing AWS outage), export `ALLOW_CLOUDFRONT_VERIFY_FAILURE=true` before running `npm run verify:static`. The script will still attempt the CDN checks and log the failures, but it will exit successfully so the pipeline can continue. Remove the override and rerun the verifier as soon as the CDN stabilizes so production traffic is never switched to an unverified distribution.

## 1. Run the verifier

```bash
npm run verify:cloudfront
```

- The command reads the canonical distribution metadata from `config/published-cloudfront.json` and probes the `/healthz` endpoint on the recorded URL.
- A successful check prints `status "ok"` with the fully-qualified URL.
- A failure such as `Failed to reach https://d3p4q5r6s7t8u9.cloudfront.net/healthz: fetch failed` means the CDN cannot be reached from the current network or the distribution is offline. The helper now prints next steps that point to this runbook and remind you to redeploy if the metadata is stale.

### Example failure output

```text
Loaded CloudFront URL from config: https://d3p4q5r6s7t8u9.cloudfront.net
CloudFront verification failed:
Failed to reach https://d3p4q5r6s7t8u9.cloudfront.net/healthz: fetch failed

Next steps:
- Confirm the recorded domain in config/published-cloudfront.json matches the most recent deployment output (the current distribution fronts the `resume-forge-app-2025` bucket).
- If the distribution was replaced or removed, redeploy the SAM stack and republish the CloudFront URL:
    sam validate
    sam build --use-container
    sam deploy --guided
    npm run publish:cloudfront-url -- <stack-name>
- See docs/troubleshooting-cloudfront.md for a detailed runbook.
```

If you see output similar to the above, continue with the validation and redeploy steps below.

## 2. Validate the metadata

Open [`config/published-cloudfront.json`](../config/published-cloudfront.json) and confirm the stored domain matches the most recent deployment output. Outdated metadata (for example, a stale distribution id or a URL from an older release) will cause the verifier and redirect endpoints to probe the wrong distribution. If the file references an obsolete distribution, run `npm run print:cloudfront-url -- <stack-name>` to inspect the new outputs that the deployment produced.

## 3. Redeploy if necessary

If the CloudFront distribution was removed or replaced, redeploy the SAM stack and republish the fresh metadata:

```bash
sam validate
sam build --use-container
sam deploy --guided
npm run publish:cloudfront-url -- <stack-name>
```

This rebuilds the Lambda/API Gateway stack, updates `config/published-cloudfront.json`, and issues cache invalidations so the new CDN becomes the canonical entry point.

## 4. Share the working domain

Once the verifier succeeds, broadcast the CloudFront URL recorded in `config/published-cloudfront.json` (also mirrored in [`docs/cloudfront-url.md`](cloudfront-url.md)) so the team and candidates use the active distribution.
