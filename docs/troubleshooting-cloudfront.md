# CloudFront troubleshooting

When the published CloudFront domain stops responding, use the verification helper to confirm whether the CDN is reachable and serving the expected health payload. The runbook below walks through verifying the outage, validating the recorded metadata, and republishing a working distribution.

> **Break-glass override:** If CloudFront refuses to serve newly uploaded assets but you must move forward temporarily (for example, during an ongoing AWS outage), export `ALLOW_CLOUDFRONT_VERIFY_FAILURE=true` *or* pass `--allow-cloudfront-failure` to either `npm run verify:cloudfront` or `npm run verify:static`. The scripts will still attempt the CDN checks and log the failures, but they will exit successfully so the pipeline can continue. Remove the override and rerun the verifier as soon as the CDN stabilizes so production traffic is never switched to an unverified distribution.

To skip only the CDN probe while still validating the S3 upload, run `npm run verify:static -- --skip-cloudfront`. This flag mirrors the `SKIP_CLOUDFRONT_VERIFY` environment variable and can be useful when testing from environments that cannot reach CloudFront but where you still want the manifest and S3 checks to execute.

## Immediate response to hashed asset 404s

The most common customer-facing regression is CloudFront returning `404` for hashed bundles such as `/assets/index-<hash>.js` or `/assets/index-<hash>.css`. Treat this as an emergency publish/verify scenario:

```bash
npm run publish:cloudfront-url -- <stack-name>
npm run verify:static
```

Republishing refreshes `config/published-cloudfront.json` and issues cache invalidations so CloudFront stops serving stale manifests. The static verifier then confirms the manifest references objects that exist in S3 and that the CDN can fetch them. If your build generates uniquely hashed filenames on every deploy, re-upload the **entire** client build output (for example via `npm run upload:static`) so the new hashes are present alongside the `assets/index-latest.*` aliases—uploading only the `latest` alias will still leave references to the missing hashed bundles and cause 404s. If the verifier continues to report missing bundles after this cycle, escalate to the full repair workflow in step 3.

Starting in November 2024, `npm run verify:static` gained support for pruning stale `assets/index-*.css`/`assets/index-*.js` bundles that linger in the deployment prefix. To protect users that are still served an older cached `index.html`, the verifier now retains superseded bundles by default and only deletes them when explicitly requested. Opt into automatic cleanup by passing `--delete-stale-index-assets` (or setting `STATIC_VERIFY_DELETE_STALE_INDEX_ASSETS=true`) once cached HTML has refreshed. The retention window (72 hours by default) can be adjusted with the `STATIC_VERIFY_STALE_INDEX_RETENTION_*` environment variables whenever you enable pruning.

## 1. Run the verifier

```bash
npm run verify:cloudfront
```

- The command reads the canonical distribution metadata from `config/published-cloudfront.json` and probes the `/healthz` endpoint on the recorded URL.
- A successful check prints `status "ok"` with the fully-qualified URL.
- A failure such as `Failed to reach https://d3r7s5t9uvwx2.cloudfront.net/healthz: fetch failed` means the CDN cannot be reached from the current network or the distribution is offline. The helper now prints next steps that point to this runbook and remind you to redeploy if the metadata is stale.

### Example failure output

```text
Loaded CloudFront URL from config: https://d3r7s5t9uvwx2.cloudfront.net
CloudFront verification failed:
Failed to reach https://d3r7s5t9uvwx2.cloudfront.net/healthz: fetch failed

Next steps:
- Confirm the recorded domain in config/published-cloudfront.json matches the most recent deployment output (the current distribution fronts the `resume-forge-app-2025` bucket in region `ap-south-1` at origin path `/static/client/prod/latest`).
- Share the recorded API Gateway fallback (`https://a1b2c3d4e5.execute-api.ap-south-1.amazonaws.com/prod`) with stakeholders so support can route around the outage while CloudFront recovers.
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

If the CloudFront distribution was removed or replaced, redeploy the SAM stack and republish the fresh metadata. When the CDN
starts pointing at the wrong S3 bucket (for example, an older artifact bucket that no longer receives uploads), redeploy the
stack using the current bucket name so the CloudFront origin is wired back to the latest assets. After the redeploy, clear any
lingering distributions so traffic cannot fall back to the stale domain:

```bash
sam validate
sam build --use-container
sam deploy --guided # supply the current S3 bucket name when prompted for DataBucketName
npm run publish:cloudfront-url -- <stack-name> # publishes the active domain and invalidates the new distribution
aws cloudfront list-distributions --query 'DistributionList.Items[].Id' # confirm and remove or disable old distributions
```

This rebuilds the Lambda/API Gateway stack, updates `config/published-cloudfront.json`, and issues cache invalidations so the new CDN becomes the canonical entry point. Removing or disabling outdated distributions prevents browsers or DNS caches from resolving to the wrong bucket after the redeploy.

To automate the full workflow of rebuilding the client, uploading the refreshed static assets, publishing the distribution metadata, and re-running the health verification, use the repair helper:

```bash
npm run repair:cloudfront -- --stack <stack-name>
```

Skip individual steps by appending `--skip-build`, `--skip-upload`, `--skip-publish`, or `--skip-verify` when you only need part of the recovery process (for example, to retry verification after manually redeploying the stack).

## 4. Share the working domain

Once the verifier succeeds, broadcast the CloudFront URL recorded in `config/published-cloudfront.json` (also mirrored in [`docs/cloudfront-url.md`](cloudfront-url.md)) so the team and candidates use the active distribution.
