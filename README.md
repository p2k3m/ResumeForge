# ResumeForge

## Overview
ResumeForge generates tailored cover letters and enhanced CV versions by combining a candidate's résumé with the pasted job description text. The Express API is wrapped with `@vendia/serverless-express` and deployed to AWS Lambda behind API Gateway so the entire stack runs on demand. Persistent artifacts are stored in Amazon S3 while DynamoDB (on-demand billing) retains only lightweight session metadata, keeping the monthly infrastructure cost negligible for small user counts. The runtime follows the AWS best-practice flow of **API Gateway → Lambda → S3**, using environment variables for secrets and shifting change-log/audit data out of DynamoDB and into S3.

## User flow

| Step | User action | System response | Expected user outcome |
| --- | --- | --- | --- |
| 1. Upload résumé | Candidate drops a CV (PDF/DOC/DOCX) into the React portal. | File streams directly to S3 at `resume-forge-data/cv/<candidate>/<date>/<job-id>/original.pdf`; DynamoDB stores hashed personal data (IP, device, LinkedIn, Credly) and detected file type. Non-CV uploads trigger a validation error with remediation text. | The candidate immediately knows whether the résumé is valid and, if not, how to fix it before continuing. |
| 2. Provide job description | Candidate enters the job post URL or pastes the full job description text into the portal. | The backend fetches the JD when the URL is accessible; if the site blocks automated access the flow stops instantly, displays the paste box, and requires the candidate to provide the text manually. | The user either sees the JD captured automatically or receives a clear prompt to paste it before continuing, guaranteeing the analysis always runs on the actual JD content. |
| 3. Run ATS analysis | Candidate clicks **Evaluate me against the JD**. | Lambda analyses the CV + JD, generating ATS scores (Layout & Searchability, Readability, Impact, Crispness, Other Metrics) and alignment data (designation deltas, experience gaps, skill/task matches, certifications, highlights). | The dashboard surfaces quantified fit, missing elements, and probability of selection so the candidate understands current readiness. |
| 4. Apply improvements | Candidate uses **Improve** on specific sections or **Improve All**. | AI suggestions rewrite summaries, add skills, realign designations, adjust experience narratives, and highlight certifications. Accept/reject toggles persist the chosen edits and instantly update the working draft. | The résumé content evolves in-app with an audit trail explaining each enhancement, keeping the candidate in control of every accepted change. |
| 5. Re-evaluate and download deliverables | Candidate re-runs **Evaluate me against the JD** after accepting edits, then downloads regenerated assets. | The portal recalculates ATS scores on demand so candidates can see how each round of edits shifts readiness before exporting the enhanced ATS-ready CV PDFs (2025 design), tailored cover letter, and change log. Only the latest artefacts for the current session are retained so storage stays lean without background cleanup jobs. | Candidates iterate until satisfied, leave with ready-to-submit documents, and understand how the iterative improvements boosted hiring odds. |

Every interaction is processed via the serverless Express Lambda/API Gateway stack while the React frontend is delivered through CloudFront.

> Looking for a candidate-facing walkthrough? See [docs/user-journey.md](docs/user-journey.md) for triggers and expected outcomes at each step.

> Onboarding a new teammate? Point them at [docs/onboarding.md](docs/onboarding.md) for a narrative walkthrough of the regular candidate flow.

> Need the storage deep-dive? Share [docs/storage-model.md](docs/storage-model.md) with engineers and SystemOps to explain the S3 layout and download flow.
>
> Rolling out infrastructure or touching CI/CD? Review [docs/ci-cd-iac.md](docs/ci-cd-iac.md) for the authoritative guidance on pipelines, IaC, and local tooling expectations.

## Microservice layout

ResumeForge now deploys six discrete Lambda functions, each fronted by dedicated API Gateway resources. This keeps cold starts predictable and prevents resume upload traffic from competing with AI-heavy scoring or document generation flows. The microservice catalogue lives in [`microservices/services.js`](microservices/services.js) and is summarised below (see [docs/microservices.md](docs/microservices.md) for the architecture deep-dive):

| Service | Lambda handler | API surface |
| --- | --- | --- |
| Client delivery | `lambdas/clientApp.handler` | `GET /`, `GET /index.html`, `GET /favicon.ico`, `GET /manifest.webmanifest`, `GET /robots.txt`, `GET /service-worker.js`, `GET /assets/*`, `GET /fonts/*`, `GET /images/*`, `GET /cover-templates/*` |
| Resume upload | `lambdas/resumeUpload.handler` | `POST /api/process-cv` |
| Job description evaluation | `lambdas/jobEvaluation.handler` | `POST /api/jd/evaluate` |
| Scoring | `lambdas/scoring.handler` | `POST /api/score-match`, `POST /api/rescore-improvement` |
| Enhancement | `lambdas/enhancement.handler` | `POST /api/improve-*`, `POST /api/enhance-all` |
| Document generation | `lambdas/documentGeneration.handler` | `POST /api/generate-enhanced-docs`, `POST /api/render-cover-letter` |
| Auditing & metrics | `lambdas/auditing.handler` | `POST /api/change-log`, `POST /api/refresh-download-link`, `GET /api/published-cloudfront`, `GET /healthz` |

Each handler is created with `createServiceHandler`, which mounts the shared Express app but rejects out-of-scope routes with a `404` that includes the service name for observability. Because the SAM template wires every endpoint to its corresponding function, an upload failure never exhausts scoring capacity and vice versa.

### Multi-stage, user-driven improvement

ResumeForge is intentionally cyclical for regular users: upload a résumé, evaluate against the target job, accept or reject suggested edits, and immediately run the analysis again. Each evaluation pass uses the candidate's latest choices, so the updated ATS dashboard, probability of selection, and narrative insights always reflect their current draft. Because the candidate controls when to accept edits or trigger another analysis run, the improvement loop stays user-directed rather than automatic, making it easy to experiment with targeted changes before finalising downloads.

## Environment configuration
ResumeForge now relies exclusively on environment variables for sensitive and deployment-specific configuration. The Express server validates the presence of required values at startup and fails fast if any are missing, ensuring secrets are not shipped inline with the source code. During local development the server automatically loads variables from a `.env` file (when present) so personal credentials remain outside version control. For local development you can alternatively provide a `runtime-config.json`/`runtime-config.json5` file (or set `RUNTIME_CONFIG_PATH` to point at one) in the project root or inside the `config/` directory. The loader understands JSON5, so comments and trailing commas are allowed. An example file lives at `config/runtime-config.example.json5`—copy it to `config/runtime-config.json5`, fill in the secrets, and the server will load them automatically.

### Troubleshooting configuration errors

If the portal immediately displays **“Processing failed”** when you click **Evaluate me against the JD**, the backend has rejected the request because mandatory configuration is missing. The API now responds with a descriptive message such as:

```
ResumeForge is missing required configuration values: S3_BUCKET, GEMINI_API_KEY. Set them via environment variables or config/runtime-config.json5.
```

To resolve the error, either export the required environment variables before starting the server:

```bash
export S3_BUCKET="<your-s3-bucket>"
export GEMINI_API_KEY="<your-gemini-api-key>"
```

or copy `config/runtime-config.example.json5` to `config/runtime-config.json5` and populate the missing fields. Restart the server afterwards so the updated configuration is loaded.

The runtime looks for the following keys:

```json
{
  "AWS_REGION": "ap-south-1",
  "PORT": "3000",
  "GEMINI_API_KEY": "<api-key>",
  "S3_BUCKET": "resume-forge-data",
  "RESUME_TABLE_NAME": "ResumeForge",
  "CLOUDFRONT_ORIGINS": "https://d123example.cloudfront.net"
}
```

- `GEMINI_API_KEY` – Google Gemini API key. This value must be supplied via the environment; the server verifies a non-empty value is present and never logs the secret.
- `S3_BUCKET` – Destination bucket for uploads, logs, and generated PDFs. Provide the bucket name through the `S3_BUCKET` environment variable so artifacts are stored in the correct account and region.
- `CLOUDFRONT_ORIGINS` – Optional, comma-separated list of CloudFront origins that are permitted through the server's CORS middleware. Include your distribution domain to restrict browser calls to trusted hosts.
- `ENABLE_DOWNLOAD_SESSION_LOG_CLEANUP` – Optional toggle that removes the session change log from S3 when a download session expires. Enable this flag when aggressively reclaiming storage for large-scale environments; leave it unset to retain audit history.
- `ENABLE_GENERATION_STALE_ARTIFACT_CLEANUP` – Optional toggle that deletes superseded generated artifacts once a session completes. Enable this flag when reclaiming storage aggressively at scale; leave it unset to retain prior versions for troubleshooting.
- `AWS_REGION` – Region where AWS clients execute. It is required so Lambda functions and local development sessions resolve the correct endpoints.
- `STAGE_NAME` – Deployment stage identifier. Defaults to `dev` locally, `test` under automated tests, and `prod` in production unless overridden.
- `DEPLOYMENT_ENVIRONMENT` – Optional override for the environment tag applied to DynamoDB records and S3 object tags. Defaults to the resolved `STAGE_NAME`.
- `PORT` and `RESUME_TABLE_NAME` can continue to come from the environment or runtime configuration file. Reasonable defaults are provided for local development.

Because the configuration is loaded and cached once, the service reuses the same credentials across requests instead of recreating clients every time.

### Privacy and data handling

- DynamoDB stores candidate names, LinkedIn URLs, IP addresses, and user agents exactly as submitted (only trimmed for whitespace) so ongoing sessions can be resumed without any anonymisation or background cleanup processes.
- Generated PDFs, cover letters, and the canonical change log (`logs/change-log.json`) are stored in S3 only for the active session that produced them. Old keys are overwritten as users regenerate documents, so the bucket naturally keeps just the current versions without relying on scheduled deletion jobs. When `ENABLE_DOWNLOAD_SESSION_LOG_CLEANUP` is enabled, expired sessions also drop their change log file from S3 to free storage for large multi-tenant deployments. Enable `ENABLE_GENERATION_STALE_ARTIFACT_CLEANUP` to remove the superseded generated documents themselves after a session completes when large-scale storage reclamation is required.

### Required parameters for AWS deployment

Deployments still expect the following AWS SAM parameters:

- `DataBucketName` – S3 bucket that stores original uploads, logs, and generated documents.
- `GeminiApiKey` – Gemini API key securely injected into the Lambda function environment.
- `ResumeTableName` – DynamoDB table for metadata (defaults to `ResumeForge`).
- `CreateDataBucket` – set to `false` when pointing at an existing bucket so the stack does not try to create it again (defaults to `true`).
- `CreateResumeTable` – set to `false` when reusing a DynamoDB table created outside the stack (defaults to `true`).
- `WebAclArn` – optional ARN of an AWS WAFv2 web ACL to associate with the CloudFront distribution for upload abuse protection. Leave blank to skip WAF attachment.

Whether the stack creates the S3 bucket or reuses an existing one, it now attaches a bucket policy that allows the Lambda execution role to `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`, and `s3:ListBucket`. This ensures every artifact type (original uploads, generated PDFs, logs, and change histories) can be written without requiring out-of-band IAM changes.

## IAM Policy
Minimal permissions required by the server:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::S3_BUCKET/*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::S3_BUCKET"
    },
    {
      "Effect": "Allow",
      "Action": ["dynamodb:DescribeTable", "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem"],
      "Resource": "arn:aws:dynamodb:REGION:ACCOUNT_ID:table/RESUME_TABLE_NAME"
    },
    {
      "Effect": "Allow",
      "Action": ["wafv2:AssociateWebACL", "wafv2:DisassociateWebACL", "wafv2:GetWebACL"],
      "Resource": "*"
    }
  ]
}
```

## Serverless deployment on AWS

The project now ships with an AWS SAM template (`template.yaml`) that deploys the Express API as an AWS Lambda function behind A
PI Gateway, using on-demand DynamoDB billing and a single S3 bucket to minimise cost for low traffic workloads.

### Prerequisites

1. Install the AWS SAM CLI and authenticate with the target AWS account.
2. Set `S3_BUCKET` and (optionally) `CLOUDFRONT_ORIGINS` environment variables before building the deployment artifact. Provide the Gemini key at deployment time via the new `GeminiApiKey` parameter instead of exporting it directly.
3. Ensure the chosen S3 bucket name is globally unique.
4. Provision an IAM user or role for GitHub Actions with permissions to deploy the stack via CloudFormation, read/write to the S3 bucket, and manage the DynamoDB table, Lambda, and API Gateway resources created by the SAM template.

### Deploy

```bash
sam validate
sam build --use-container
sam deploy --guided
```

During the guided deploy provide values for:

- `Stack Name` – e.g. `ResumeForge`
- `AWS Region` – e.g. `ap-south-1`
- `DataBucketName` – globally unique bucket name for uploads and generated files
- `GeminiApiKey` – Gemini API key used by the Lambda runtime
- `ResumeTableName` – DynamoDB table name (defaults to `ResumeForge`)
- `StageName` – API Gateway stage identifier (defaults to `prod`);
  may include only letters, numbers, hyphens, and underscores and must be 30 characters or fewer
- `CreateDataBucket` – answer `false` if the bucket already exists and should be reused
- `CreateResumeTable` – answer `false` if the DynamoDB table already exists and should be reused

The deployment creates:

- `ResumeForgeHandler` Lambda function (Node.js 18) using `lambda.js`
- Regional REST API Gateway with binary support for `multipart/form-data`
- S3 bucket for uploads/logs and DynamoDB table with on-demand billing

After `sam deploy` completes it prints the `AppBaseUrl`, `ApiBaseUrl`, and `CloudFrontUrl` outputs. `AppBaseUrl` is the primary CloudFront front page and the canonical entry point for the hosted application. If you ever need to retrieve the CloudFront URL again, run:

```bash
npm run print:cloudfront-url -- <stack-name>
```

The script uses your configured AWS credentials/region to read the `CloudFrontUrl` output from the specified stack and prints the full distribution URL (for example, `https://d123456abcdef8.cloudfront.net`).

> **Active CloudFront domain:** `https://d3p8c4n7s9f0ab.cloudfront.net`

The canonical domain is tracked in `config/published-cloudfront.json` and mirrored here so anyone with repository access can retrieve the production URL without opening the app.

Run the verification helper whenever you update the distribution to confirm that the published domain responds with the expected health payload. If the check fails, follow the CloudFront troubleshooting guide in [docs/troubleshooting-cloudfront.md](docs/troubleshooting-cloudfront.md) to validate the recorded metadata and redeploy as needed.

```bash
npm run verify:cloudfront
```

Optionally pass a specific URL (for example, a freshly deployed stack) to validate before publishing it:

```bash
npm run verify:cloudfront -- https://d123456abcdef8.cloudfront.net
```

The REST API remains available directly via API Gateway if you need to integrate programmatically:

```
https://<api-id>.execute-api.<region>.amazonaws.com/<stage>
```

### Publish the active CloudFront URL

After each deployment, publish the fresh CloudFront domain so the team knows the canonical entry point for candidates. The helper script stores the URL in `config/published-cloudfront.json` and automatically invalidates both the previously published distribution (if any) and the active distribution using a `/*` path so caches stop serving stale assets immediately. A human-readable snapshot of the latest URL also lives in [`docs/cloudfront-url.md`](docs/cloudfront-url.md) so you can surface the current domain in changelogs or onboarding docs without digging through JSON.

```bash
npm run publish:cloudfront-url -- <stack-name>
```

- **`config/published-cloudfront.json`** is regenerated with the latest domain, distribution id, and timestamp. Commit this file (or surface it through your release notes) to broadcast the production URL.
- The script always issues `/*` invalidations for both the previously published distribution (when one exists) and the active distribution, even when the stack reuses the same distribution id, so caches are busted after every deploy.

The recorded CloudFront URL is the entry point shared with users; redirect any legacy bookmarks to this domain to keep traffic on the latest deployment. Keep this README (and `docs/cloudfront-url.md`) updated so support teams and new joiners can confirm the production endpoint without loading the app.

Once the metadata is published, the API exposes two helper endpoints:

- `GET /api/published-cloudfront` returns the currently published domain, distribution id, and timestamp so you can broadcast the canonical URL in release notes or chat.
- `GET /go/cloudfront` (alias `/redirect/latest`) issues a 308 redirect to the published CloudFront domain. Pass an optional `path` query parameter (for example `?path=api/process-cv`) to deep link to a specific route on the new domain, making it easy to update old bookmarks and onboarding docs.


### Accessing the ResumeForge portal

The SAM template deploys the API and a CloudFront distribution that forwards requests straight to API Gateway. Visiting the raw CloudFront domain now renders a lightweight HTML portal served directly by the API’s root route, so candidates can upload their CV, provide the job description, and receive enhanced documents without any additional hosting. CloudFront no longer rewrites `/` to `/healthz`; instead it forwards the viewer path verbatim so the portal is the default experience while the `/healthz` endpoint remains available for JSON health checks. CloudFront is configured to let AWS supply the `Host` header expected by API Gateway; forwarding the viewer’s `Host` would cause API Gateway to reject the request with a 403 because the CloudFront hostname is not mapped to the stage. If you omit the stage segment (for example, visiting `https://<api-id>.execute-api.<region>.amazonaws.com/`), API Gateway responds with `{"message":"Forbidden"}` because no resource matches that path.

The portal now enforces PDF uploads exclusively and immediately validates the document type. When Gemini or heuristic analysis determines that the uploaded PDF is not a CV, the API responds with a descriptive message such as “You have uploaded an invoice document. Please upload a CV only.” so users know exactly what went wrong before trying again. Successful evaluations render a 2025-inspired dashboard that highlights ATS scoring across Layout & Searchability, ATS Readability, Impact, Crispness, and Other Quality Metrics, alongside enhanced résumé and cover-letter download links.

If you prefer the full React application you can continue to host it separately:

1. **Run it locally**
   ```bash
   npm install --prefix client
   VITE_API_BASE_URL="https://<api-id>.execute-api.<region>.amazonaws.com/<stage>" \
     npm run dev --prefix client
   ```

   This starts the Vite dev server on <http://localhost:5173>. The client proxies `/api` requests to `VITE_API_BASE_URL`, so set that variable to the deployed API (or leave it unset to target a locally running Express server).

2. **Host the built assets yourself**
   ```bash
   npm install --prefix client
   VITE_API_BASE_URL="https://<api-id>.execute-api.<region>.amazonaws.com/<stage>" \
     npm run build --prefix client
   ```
   Upload the generated `client/dist` directory to an S3 static website bucket or another hosting service, and (optionally) front it with CloudFront. If the portal runs on a different origin than the API, ensure the API’s CORS configuration allows that origin.

Using the default stage (`prod`), the `/api/process-cv` endpoint is reachable either directly through API Gateway or via the CloudFront distribution:

```
https://<api-id>.execute-api.<region>.amazonaws.com/prod/api/process-cv
https://<cloudfront-id>.cloudfront.net/api/process-cv
```

The React portal now hydrates server-rendered markup and registers a service worker that queues uploads while offline. Users can
submit their CV without connectivity; the request is retried automatically as soon as the browser reconnects and the UI is
updated with the generated documents.

### Building artifacts

Run the aggregate build to produce both the static client bundle and an optimized Lambda artifact:

```bash
npm run build
```

This command invokes Vite to emit the production client into `client/dist` and bundles the Lambda entry point with `esbuild`
inside `dist/lambda`. Each artifact directory includes a `build-info.json` file that captures the Git SHA and build timestamp
for traceability. Individual steps remain available through `npm run build:client` and `npm run build:lambda`.

### Post-deployment verification

1. Confirm that the CloudFormation outputs include `ApiBaseUrl`. This is the canonical URL for the deployed serverless API.
2. Issue a quick health check once the stack finishes deploying:

   ```bash
   curl "$(aws cloudformation describe-stacks --stack-name ResumeForge --query 'Stacks[0].Outputs[?OutputKey==\`ApiBaseUrl\`].OutputValue' --output text)/healthz"
   ```

   A successful deployment returns `{ "status": "ok" }`.
3. Upload traffic, DynamoDB activity, and Lambda invocations are all billed on demand. With minimal user traffic the monthly AWS cost typically remains within the free tier.

## Local Development
1. Install dependencies in both the server and client directories:
   ```bash
   npm install
   cd client && npm install
   ```
2. Export `GEMINI_API_KEY` and `S3_BUCKET` (and optionally `CLOUDFRONT_ORIGINS`) in your shell before starting the server so runtime validation passes.
3. Start the server:
   ```bash
   npm run dev
   ```
4. In another terminal, start the client:
   ```bash
   cd client && npm run dev
   ```
5. The client issues requests to `/api`. During development the Vite dev server proxies these paths to `http://localhost:3000`.
   If the backend runs elsewhere (e.g., in production), set `VITE_API_BASE_URL` to the server's base URL before starting the client.

## Upload Restrictions
- Maximum file size: 5&nbsp;MB
- Allowed file types: `.pdf`
- Legacy `.doc` files are rejected.

## Templates
`/api/process-cv` supports several template parameters for selecting the resume layout:

- `template` – apply the same template to both generated CV versions.
- `template1` and `template2` – specify different templates for each version.
- `templates` – array of two template IDs, equivalent to providing `template1` and `template2`.

Available template values:
- `modern` – clean sans-serif look (default)
- `professional` – refined corporate styling with confident headings
- `classic` – timeless serif presentation with structured sections
- `ats` – single-column format prioritising ATS parsing and clarity
- `2025` – responsive grid layout with modern Inter font, blue accents, and spacious margins

Any missing or invalid ID falls back to `modern`.

### Template rotation and Q4 2025 palettes

Run `npm run refresh:templates` at the start of every Q4 to archive unsupported layouts and regenerate the seasonal `2025` palette files inside `templates/`. The script moves retired HTML into `templates/retired/` and rewrites the four Q4 variants (`2025-q4-slate`, `2025-q4-midnight`, `2025-q4-sunrise`, `2025-q4-emerald`) so downstream tooling always has the latest colour treatments for the Future Vision resume. Committing the refreshed assets keeps the repository aligned with the quarterly design refresh without manual copy/paste chores.


## Edge Cases
- **Name extraction fallback:** If the résumé text lacks a detectable name, the generated content defaults to a generic placeholder such as "Candidate".

## Continuous Deployment (GitHub Actions)

Automated testing and deployment run through the `CI and Deploy` workflow. It executes on pull requests targeting `main` (tests only), on pushes to `main` (tests followed by deployment), and via the "Run workflow" button in the Actions tab.

### What the workflow does

1. Checks out the repository and installs Node.js 18.
2. Installs dependencies and runs the Jest test suite for the Express server.
3. Installs client dependencies and builds the Vite bundle to verify the frontend compiles cleanly.
4. On pushes to `main`, validates that all required AWS credentials are present as GitHub repository secrets. Missing values cause the workflow to fail immediately with a descriptive error message.
5. Configures the AWS CLI using the provided access key and secret key, validates the template with `sam validate`, builds the AWS SAM package, and deploys the CloudFormation stack using `sam deploy --resolve-s3`.
6. Before deployment, checks whether the configured S3 bucket and DynamoDB table already exist. If they do, the workflow automatically passes `CreateDataBucket=false` and/or `CreateResumeTable=false` so CloudFormation reuses the resources instead of failing with `AlreadyExists` errors.

### Required GitHub repository secrets

Add the following secrets under **Settings → Secrets and variables → Actions** in your GitHub repository:

| Secret | Description |
| --- | --- |
| `AWS_ACCESS_KEY_ID` | Access key for the IAM user or role with deployment permissions. |
| `AWS_SECRET_ACCESS_KEY` | Corresponding secret access key. |
| `AWS_REGION` | Region that hosts the ResumeForge stack (e.g., `ap-south-1`). |
| `RESUMEFORGE_STACK_NAME` | CloudFormation stack name used by `sam deploy` (e.g., `ResumeForge`). |
| `RESUMEFORGE_DATA_BUCKET` | Globally unique S3 bucket name passed to the `DataBucketName` parameter. |
| `RESUMEFORGE_SECRET_NAME` | Name of the AWS Secrets Manager secret that stores runtime configuration. The secret must contain a `GEMINI_API_KEY` field. |

The Secrets Manager entry referenced by `RESUMEFORGE_SECRET_NAME` should store a JSON object, for example:

```json
{
  "GEMINI_API_KEY": "<api-key-value>"
}
```

If you prefer to supply the Gemini API key directly (for local testing or bespoke deployments), pass a value to the `GeminiApiKey` parameter instead of configuring a secret. The CloudFormation template enforces that at least one of these sources is provided.

Optional secrets:

- `RESUMEFORGE_STAGE_NAME` – API Gateway stage name (defaults to `prod`).
- `RESUMEFORGE_TABLE_NAME` – DynamoDB table name (defaults to `ResumeForge`).

GitHub stores these encrypted at rest. The workflow reads them at runtime to configure AWS and to populate the SAM template parameters.

### Granting deployment permissions

Assign the IAM user or role attached to the `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` secrets the ability to perform the following operations:

- `cloudformation:*` on the target stack.
- `s3:*` on the deployment bucket created by `--resolve-s3` and on the bucket referenced by `RESUMEFORGE_DATA_BUCKET`.
- `lambda:*`, `apigateway:*`, and `dynamodb:*` actions required by the SAM template.

Limiting the policy to the specific stack resources is recommended for production environments.
- **Job description input:** Candidates now paste the vacancy text directly, eliminating fragile scraping flows and authentication blockers. The API validates that non-empty text was supplied before processing the résumé.

## API Response
The `/api/process-cv` endpoint returns JSON containing an array of generated files along with match statistics. All presigned d
ownload URLs expire after one hour:

```json
{
  "success": true,
  "requestId": "a7f18d2e-91c9-4d10-8f44-e8f4ed6c2a5a",
  "jobId": "1fb6e8c6-7b2f-46dc-89c9-1dd2efdd8793",
  "urlExpiresInSeconds": 3600,
  "urls": [
    {
      "type": "original_upload",
      "url": "https://<bucket>.s3.<region>.amazonaws.com/cv/jane_doe/2025-01-15/1fb6e8c6-7b2f-46dc-89c9-1dd2efdd8793/original.pdf?X-Amz-Expires=3600&...",
      "expiresAt": "2025-01-15T12:00:00.000Z"
    },
    {
      "type": "cover_letter1",
      "url": "https://<bucket>.s3.<region>.amazonaws.com/cv/jane_doe/2025-01-15/1fb6e8c6-7b2f-46dc-89c9-1dd2efdd8793/cover_letter_refined.pdf?X-Amz-Expires=3600&...",
      "expiresAt": "2025-01-15T12:00:00.000Z"
    },
    {
      "type": "version1",
      "url": "https://<bucket>.s3.<region>.amazonaws.com/cv/jane_doe/2025-01-15/1fb6e8c6-7b2f-46dc-89c9-1dd2efdd8793/enhanced_modern_classic.pdf?X-Amz-Expires=3600&...",
      "expiresAt": "2025-01-15T12:00:00.000Z"
    }
  ],
  "applicantName": "Jane Doe",
  "originalScore": 50,
  "enhancedScore": 80,
  "table": [
    { "skill": "javascript", "matched": true },
    { "skill": "aws", "matched": true },
    { "skill": "python", "matched": false }
  ],
  "addedSkills": ["aws"],
  "missingSkills": ["python"]
}
```

`originalScore` represents the percentage match between the job description and the uploaded resume. `enhancedScore` is the best match achieved by the generated resumes. `table` details how each job skill matched, `addedSkills` shows skills newly matched in the enhanced resume, and `missingSkills` lists skills from the job description still absent.

S3 keys follow the pattern `cv/<candidate>/<session>/<template>/<variant>.pdf`, so every generated document is tagged by the template that produced it (for example, `cv/jane_doe/session-123/modern/version1.pdf` or `cv/jane_doe/session-123/cover_modern/cover_letter1.pdf`). Text artifacts produced during the same run live under `cv/<candidate>/<session>/artifacts/`, while the canonical session history is written to `cv/<candidate>/<session>/logs/change-log.json`. The API returns presigned download URLs along with an ISO 8601 timestamp (`expiresAt`) that indicates when each link will expire.

```
cv/jane_doe/session-123/
├── original.pdf
├── modern/
│   ├── version1.pdf
│   └── version2.pdf
├── cover_modern/
│   ├── cover_letter1.pdf
│   └── cover_letter2.pdf
├── artifacts/
│   ├── original.json
│   ├── version1.json
│   ├── version2.json
│   └── changelog.json
└── logs/
    └── processing.jsonl
```

Each entry in `urls` points to a PDF stored in Amazon S3. If no cover letters or CVs are produced, the server responds with HTTP 500 and an error message.

On failure, the endpoint responds with `success: false` and an `error` object containing a stable `code`, a human-readable `message`, the originating `requestId`, and (when available) the associated `jobId`. Additional context may be returned via `error.details`.
