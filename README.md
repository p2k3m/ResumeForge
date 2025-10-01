# ResumeForge

## Overview
ResumeForge generates tailored cover letters and enhanced CV versions by combining a candidate's résumé with a scraped job description. The Express API is wrapped with `@vendia/serverless-express` and deployed to AWS Lambda behind API Gateway so the entire stack runs on demand. Persistent artifacts are stored in Amazon S3 while DynamoDB (on-demand billing) retains processing metadata, keeping the monthly infrastructure cost negligible for small user counts.

## Environment configuration
ResumeForge now relies exclusively on environment variables for sensitive and deployment-specific configuration. The Express server validates the presence of required values at startup and fails fast if any are missing, ensuring secrets are not shipped inline with the source code. For local development you can alternatively provide a `runtime-config.json`/`runtime-config.json5` file (or set `RUNTIME_CONFIG_PATH` to point at one) in the project root or inside the `config/` directory. The loader understands JSON5, so comments and trailing commas are allowed. An example file lives at `config/runtime-config.example.json5`—copy it to `config/runtime-config.json5`, fill in the secrets, and the server will load them automatically.

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
  "CLOUDFRONT_ORIGINS": "https://d123example.cloudfront.net",
  "PII_HASH_SECRET": "<random-string>",
  "SESSION_RETENTION_DAYS": "30"
}
```

- `GEMINI_API_KEY` – Google Gemini API key. This value must be supplied via the environment; the server verifies a non-empty value is present and never logs the secret.
- `S3_BUCKET` – Destination bucket for uploads, logs, and generated PDFs. Provide the bucket name through the `S3_BUCKET` environment variable so artifacts are stored in the correct account and region.
- `CLOUDFRONT_ORIGINS` – Optional, comma-separated list of CloudFront origins that are permitted through the server's CORS middleware. Include your distribution domain to restrict browser calls to trusted hosts.
- `PII_HASH_SECRET` – Optional salt used when hashing personal data before writing DynamoDB records. Configure a deployment-specific value to make hashes non-reversible if the table leaks.
- `SESSION_RETENTION_DAYS` – Optional override for the automated S3 clean-up job. Defaults to 30 days when unset.
- `AWS_REGION`, `PORT`, and `RESUME_TABLE_NAME` can continue to come from the environment. Reasonable defaults are provided for local development.

Because the configuration is loaded and cached once, the service reuses the same credentials across requests instead of recreating clients every time.

### Privacy, GDPR, and data retention

- DynamoDB inserts now hash candidate names, LinkedIn URLs, IP addresses, and user agents with SHA-256 (plus the optional `PII_HASH_SECRET` salt) before persisting them. The table retains browser, OS, and device metadata for aggregate analytics without storing raw personally identifiable information.
- An EventBridge rule can invoke the Lambda on a schedule to remove generated sessions from S3 that are older than `SESSION_RETENTION_DAYS` (30 days by default). The scheduled handler deletes entire `<candidate>/cv/<ISO-date>/...` prefixes so no PDFs or logs linger past the retention window.

Implementation snippet:

```ts
// cron expression example: run daily at 01:00 UTC
const rule = new events.Rule(this, 'SessionRetentionRule', {
  schedule: events.Schedule.cron({ minute: '0', hour: '1' }),
});
rule.addTarget(new targets.LambdaFunction(resumeForgeLambda, {
  event: events.RuleTargetInput.fromObject({
    source: 'resume-forge.gdpr',
    detail: { retentionDays: 30 },
  }),
}));
```

The Lambda automatically calls the retention routine when invoked by EventBridge (checks for `aws.events` and `Scheduled Event` sources), so attaching the rule is enough to enforce rolling deletion.

### Required parameters for AWS deployment

Deployments still expect the following AWS SAM parameters:

- `DataBucketName` – S3 bucket that stores original uploads, logs, and generated documents.
- `GeminiApiKey` – Gemini API key securely injected into the Lambda function environment.
- `ResumeTableName` – DynamoDB table for metadata (defaults to `ResumeForge`).
- `CreateDataBucket` – set to `false` when pointing at an existing bucket so the stack does not try to create it again (defaults to `true`).
- `CreateResumeTable` – set to `false` when reusing a DynamoDB table created outside the stack (defaults to `true`).
- `WebAclArn` – optional ARN of an AWS WAFv2 web ACL to associate with the CloudFront distribution for upload abuse protection. Leave blank to skip WAF attachment.

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
sam build --use-container
sam deploy --guided
```

During the guided deploy provide values for:

- `Stack Name` – e.g. `ResumeForge`
- `AWS Region` – e.g. `ap-south-1`
- `DataBucketName` – globally unique bucket name for uploads and generated files
- `GeminiApiKey` – Gemini API key used by the Lambda runtime
- `ResumeTableName` – DynamoDB table name (defaults to `ResumeForge`)
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

The script uses your configured AWS credentials/region to read the `CloudFrontUrl` output from the specified stack and prints the full distribution URL (for example, `https://d123456abcdef8.cloudfront.net`). The production endpoint for the application is:

```
https://<api-id>.execute-api.<region>.amazonaws.com/<stage>
```

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
inside `dist/lambda`. Individual steps remain available through `npm run build:client` and `npm run build:lambda`.

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
- `ucmo` – classic serif styling
- `professional` – centered header with subtle dividers
- `vibrant` – bold color accents with contemporary typography
- `2025` – responsive grid layout with modern Inter font, blue accents, and spacious margins

Any missing or invalid ID falls back to `modern`.


## Edge Cases
- **Name extraction fallback:** If the résumé text lacks a detectable name, the generated content defaults to a generic placeholder such as "Candidate".

## Continuous Deployment (GitHub Actions)

Automated testing and deployment run through the `CI and Deploy` workflow. It executes on pull requests targeting `main` (tests only), on pushes to `main` (tests followed by deployment), and via the "Run workflow" button in the Actions tab.

### What the workflow does

1. Checks out the repository and installs Node.js 18.
2. Installs dependencies and runs the Jest test suite for the Express server.
3. Installs client dependencies and builds the Vite bundle to verify the frontend compiles cleanly.
4. On pushes to `main`, validates that all required AWS credentials are present as GitHub repository secrets. Missing values cause the workflow to fail immediately with a descriptive error message.
5. Configures the AWS CLI using the provided access key and secret key, builds the AWS SAM package, and deploys the CloudFormation stack using `sam deploy --resolve-s3`.
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
- **Job description scraping limitations:** The job description is retrieved with a simple HTTP GET request; dynamic or access-restricted pages may return empty or blocked content. When this occurs the API returns `JOB_DESCRIPTION_FETCH_FAILED` with `details.manualInputRequired = true` so the frontend can prompt the candidate to paste the full text manually.

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
      "type": "cover_letter1",
      "url": "https://<bucket>.s3.<region>.amazonaws.com/jane_doe/cv/2025-01-15/generated/cover_letter/cover_letter1.pdf?X-Amz-Expires=3600&...",
      "expiresAt": "2025-01-15T12:00:00.000Z"
    },
    {
      "type": "version1",
      "url": "https://<bucket>.s3.<region>.amazonaws.com/jane_doe/cv/2025-01-15/generated/cv/Jane_Doe.pdf?X-Amz-Expires=3600&...",
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

S3 keys follow the pattern `<candidate>/cv/<ISO-date>/generated/<subdir>/<file>.pdf`, where `<subdir>` is `cover_letter/` or `cv/` depending on the file type. The API now returns presigned download URLs along with an ISO 8601 timestamp (`expiresAt`) that indicates when each link will expire.

```
jane_doe/cv/2025-01-15/generated/
├── cover_letter/
│   ├── cover_letter1.pdf
│   └── cover_letter2.pdf
└── cv/
    ├── Jane_Doe.pdf
    └── Jane_Doe_2.pdf
```

Each entry in `urls` points to a PDF stored in Amazon S3. If no cover letters or CVs are produced, the server responds with HTTP 500 and an error message.

On failure, the endpoint responds with `success: false` and an `error` object containing a stable `code`, a human-readable `message`, the originating `requestId`, and (when available) the associated `jobId`. Additional context may be returned via `error.details`.
