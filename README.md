# ResumeForge

## Overview
ResumeForge generates tailored cover letters and enhanced CV versions by combining a candidate's résumé with a scraped job description. The service uses Google's Gemini generative AI for text generation. All files are now organized in Amazon S3 under a candidate-specific root with two clear subfolders:

- `<candidate>/cv/<date>/` – the original résumé upload.
- `<candidate>/enhanced/<date>/` – generated cover letters and improved CVs.

This hierarchy replaces older examples that stored documents directly under the candidate's name, and it clarifies the separation between uploaded and generated files.

Job descriptions are fetched with an initial Axios request and fall back to a Puppeteer-rendered page when direct access fails or requires client-side rendering. This approach cannot bypass authentication or strict anti-bot measures, so some postings may still be unreachable.

If a LinkedIn posting requires authentication, the server returns a `LINKEDIN_AUTH_REQUIRED` error. For these protected URLs, copy and paste the job description text directly instead of providing the link.

## Running locally

1. Install **Node.js 18+**.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Install Chromium for Puppeteer if the bundled binary is missing:

   ```bash
   npx puppeteer browsers install chromium
   ```

   On Debian-based systems you can instead run `apt-get install chromium`.
4. Start the server:

   ```bash
   node server.js
   ```

## Usage

Submit a résumé and job description to generate tailored documents:

```bash
curl -F "resume=@resume.pdf" -F "jobDescriptionUrl=https://example.com/job" \
  http://localhost:3000/api/process-cv
```

Monitor processing progress using the returned `jobId`:

```bash
curl http://localhost:3000/api/progress/<jobId>
```

Delete all stored files and logs for a session when finished:

```bash
curl -X DELETE http://localhost:3000/api/session/<jobId>
```

Uploaded data is retained for up to 30 days and is removed automatically afterwards. Use the delete endpoint above to purge a session immediately if needed.

## Environment Variables
Provide these variables either directly or through an AWS Secrets Manager secret. When using Secrets Manager, the `SECRET_ID` environment variable must be set to the name of the secret containing `OPENAI_API_KEY` and `GEMINI_API_KEY`. If `SECRET_ID` is absent, the server logs a warning and skips the AWS lookup:

- `AWS_REGION` – AWS region for S3 and DynamoDB.
- `PORT` – HTTP port (defaults to `3000`).
- `GEMINI_API_KEY` – Google Gemini API key.
- `OPENAI_API_KEY` – OpenAI API key.
- `MODEL_NAME` – OpenAI model name (`gpt-5` by default).
- `S3_BUCKET` – S3 bucket for uploads and generated files.
- `DYNAMO_TABLE` – DynamoDB table for logs.
- `REQUEST_TIMEOUT_MS` – timeout in ms for outbound HTTP requests (`5000`).
- `PROCESS_TIMEOUT_MS` – max processing time in ms for each job (`300000`).
- `TRUST_PROXY` – number of trusted reverse proxy hops.
- `ENFORCE_HTTPS` – redirect HTTP requests to HTTPS when set to `true`.
- `SECRET_ID` – required when using AWS Secrets Manager; name of the secret holding `OPENAI_API_KEY`, `GEMINI_API_KEY`, and `S3_BUCKET`.

Example configuration:

```json
{
  "AWS_REGION": "ap-south-1",
  "PORT": "3000",
  "GEMINI_API_KEY": "<api-key>",
  "OPENAI_API_KEY": "<api-key>",
  "MODEL_NAME": "gpt-5",
  "S3_BUCKET": "resume-forge-data",
  "DYNAMO_TABLE": "ResumeForgeLogs",
  "REQUEST_TIMEOUT_MS": "5000",
  "PROCESS_TIMEOUT_MS": "300000",
  "TRUST_PROXY": "1",
  "ENFORCE_HTTPS": "true"
}
```

During local development you may omit `SECRET_ID` and instead provide a `local-secrets.json` file at the project root with the same JSON structure. If both are absent, the server falls back to empty credentials so it can operate offline, though features requiring external services will be disabled.

`S3_BUCKET` defines where uploads and logs are stored. If it is not set in the environment or secret, the server falls back to `resume-forge-data`.

`DYNAMO_TABLE` specifies the DynamoDB table used for logging. If absent from the environment or secret, it defaults to `ResumeForgeLogs`.

`REQUEST_TIMEOUT_MS` sets the timeout in milliseconds for outbound HTTP requests when fetching external profiles and job descriptions.

`PROCESS_TIMEOUT_MS` defines the maximum time in milliseconds allowed for processing `/api/evaluate` and `/api/process-cv` requests.

When deploying behind a reverse proxy or load balancer, set `TRUST_PROXY` to the number of trusted hops (typically `1`) so Express honors `X-Forwarded-*` headers. Combine this with `ENFORCE_HTTPS=true` to redirect all HTTP requests to `https://`.

`GEMINI_API_KEY` and `OPENAI_API_KEY` supply the Google Gemini and OpenAI API keys. Set them directly in your environment for development or include them in the secret.

`MODEL_NAME` selects the OpenAI model used for résumé processing. It defaults to `gpt-5` and falls back to `gpt-4.1` or `gpt-4o` if the preferred model is unavailable.

The AWS Secrets Manager secret referenced by `SECRET_ID` must contain at least the API keys:

```json
{
  "GEMINI_API_KEY": "<api-key>",
  "OPENAI_API_KEY": "<api-key>",
  "S3_BUCKET": "resume-forge-data"
}
```

## IAM Policy
Minimal permissions required by the server:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["secretsmanager:GetSecretValue"],
      "Resource": "arn:aws:secretsmanager:REGION:ACCOUNT_ID:secret:SECRET_ID"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject"],
      "Resource": "arn:aws:s3:::S3_BUCKET/*"
    }
  ]
}
```

## EC2 Deployment

1. Launch an EC2 instance running Node.js 18 or newer.
2. Attach an IAM role with the policy above so the instance can read secrets and write to S3.
3. Set the `SECRET_ID` environment variable to reference the Secrets Manager JSON. The secret must include `OPENAI_API_KEY` and `GEMINI_API_KEY`.
4. Deploy the code and start the server (`node server.js` or via a process manager).
5. Front the S3 bucket with a CloudFront distribution and use its default domain `https://<distribution>.cloudfront.net` to serve downloads.
6. The application stores generated files in S3 and returns presigned URLs that point to the CloudFront domain for time‑limited access.

## DynamoDB Table
Evaluation and session metadata are stored in a DynamoDB table (default name `ResumeForgeLogs`).
Each item includes:

- `jobId` – primary key for the log entry.
- `createdAt` – timestamp in milliseconds.
- `ipAddress` – IP address of the requester.
- `location` – city and country derived from the IP address.
- `userAgent` – raw user agent string.
- `browser`, `os`, `device` – parsed client details.
- Optional URLs like `jobDescriptionUrl` and `credlyProfileUrl`.
- Fields such as `docType`, `atsScore`, `improvement`, `cvKey`, `coverLetterKey`, and `s3Prefix` when relevant.
- Additional evaluation details like `scores`, `selectionProbability`, `status`, and `error` may also be logged when available.

## Scheduled Cleanup
Old log records are pruned daily to keep the DynamoDB table manageable. Run the provided script which removes items older than a
retention window (30 days by default).

```bash
node scripts/cleanupOldRecords.js
```

### Cron example
```
0 0 * * * cd /path/to/ResumeForge && node scripts/cleanupOldRecords.js >> /var/log/resumeforge-cleanup.log 2>&1
```

### Terraform / Lambda example
```hcl
resource "aws_lambda_function" "cleanup" {
  filename = "cleanup.zip"
  handler  = "cleanupOldRecords.handler"
  runtime  = "nodejs18.x"
  environment {
    variables = {
      RETENTION_DAYS = "30"
      DYNAMO_TABLE   = "ResumeForgeLogs"
    }
  }
}

resource "aws_cloudwatch_event_rule" "daily" {
  schedule_expression = "rate(1 day)"
}

resource "aws_cloudwatch_event_target" "cleanup" {
  rule      = aws_cloudwatch_event_rule.daily.name
  target_id = "dynamo-cleanup"
  arn       = aws_lambda_function.cleanup.arn
}

resource "aws_lambda_permission" "allow_events" {
  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.cleanup.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.daily.arn
}
```

## CI/CD

Use GitHub Actions with OpenID Connect (OIDC) to assume an AWS role without storing long‑lived credentials:

```yaml
name: deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    permissions:
      id-token: write
      contents: read
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::ACCOUNT_ID:role/ResumeForgeDeploy
          aws-region: ap-south-1
      - run: npm ci
      - run: npm test
      - run: ssh ec2-user@your-server 'git pull && pm2 restart resumeforge'
```

If OIDC is unavailable, store `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` (and optionally `AWS_REGION`) as encrypted secrets and pass them to `aws-actions/configure-aws-credentials` instead.

## Local Development
1. Install dependencies in both the server and client directories:
   ```bash
   npm install
   cd client && npm install
   ```
2. Provide the environment variables and AWS secret as shown above. The server listens on
   `process.env.PORT` (defaults to `3000`). To change the port, set `PORT` before starting the
   server and update `client/vite.config.js` so the proxy target matches.
3. Start the server and verify the log output shows the expected port:
   ```bash
   PORT=3000 npm run dev
   # ... Server running on port 3000
   ```
4. In another terminal, start the client:
   ```bash
   cd client && npm run dev
   ```
   The Vite dev server runs on port `5173` and proxies `/api` requests to the backend.
5. Visit `http://localhost:5173` in the browser. If the backend runs elsewhere (e.g., in
   production), set `VITE_API_BASE_URL` to the server's base URL before starting the client.

### Viewing logs during development

Run the backend with `npm run dev` and watch the terminal output:

- If the server fails to bind to the port, an error like `Server failed to start: ...` is printed.
- Successful startup logs `Server running on port <port>`.
- Each request to `/api/evaluate` logs `Received /api/evaluate request`, confirming the backend saw the request.

These messages appear in the same terminal where `npm run dev` was executed.

### Diagnosing deprecation warnings

Node can emit deprecation warnings such as the removal of `util._extend`. To trace
where a warning originates, start the server with:

```bash
node --trace-deprecation server.js
```

The stack trace in the output points to the module triggering the warning. If the
reference lives in application code, replace `util._extend` with
`Object.assign`. When it comes from a third-party package, upgrade that
dependency or apply a patch so future runs start cleanly.

## Upload Restrictions
- Maximum file size: 5&nbsp;MB
- Allowed file types: `.pdf`, `.docx`
- Legacy `.doc` files are rejected.

## URL Validation
Any reachable `http://` or `https://` URL is accepted for job descriptions and profile links.

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

### Skill Icons
The `2025` template supports optional icons for skills. Define each skill using pipe-separated fields:

```
JavaScript | fa-brands fa-js | 90
Python | https://example.com/python.svg | 80
```

The middle field accepts a Font Awesome class name or an image URL. The last field is the proficiency percentage. If no icon is provided, common skills fall back to default Font Awesome classes:

- JavaScript → `fa-brands fa-js`
- Python → `fa-brands fa-python`
- HTML → `fa-brands fa-html5`
- CSS → `fa-brands fa-css3-alt`
- Node.js → `fa-brands fa-node-js`
- React → `fa-brands fa-react`
- Docker → `fa-brands fa-docker`
- AWS → `fa-brands fa-aws`


### PDFKit Fallback
When headless Chromium is unavailable, ResumeForge automatically renders the résumé using PDFKit. The fallback mirrors the 2025 template design by manually laying out two columns, drawing skill and language bars, embedding icons (Font Awesome classes or images), and inserting a LinkedIn QR code when provided. This keeps the generated PDF visually consistent even without Puppeteer.


## Edge Cases
- **Name extraction fallback:** If the résumé text lacks a detectable name, the generated content defaults to a generic placeholder such as "Candidate".
- **Job description scraping limitations:** ResumeForge first tries to fetch job descriptions with an Axios request and falls back to a Puppeteer-rendered page when direct access is blocked or requires client-side rendering. Sites requiring login or employing strict anti-bot measures may still return empty or restricted content.

## API Response
The `/api/process-cv` endpoint returns JSON containing the uploaded CV and any generated files along with match statistics and an estimated chance of selection. Files use candidate-based prefixes with separate `cv` and `enhanced` folders, each containing date-stamped subdirectories: the original résumé is stored at `<candidate>/cv/<date>/`, while enhanced CVs and cover letters live under `<candidate>/enhanced/<date>/`:

```json
{
  "urls": [
      { "type": "cv", "url": "https://<bucket>.s3.<region>.amazonaws.com/Jane_Doe/cv/<date>/Jane_Doe.pdf" },
      { "type": "cover_letter1", "url": "https://<bucket>.s3.<region>.amazonaws.com/Jane_Doe/enhanced/<date>/cover_letter1.pdf" },
      { "type": "version1", "url": "https://<bucket>.s3.<region>.amazonaws.com/Jane_Doe/enhanced/<date>/Jane_Doe.pdf" }
  ],
  "applicantName": "Jane Doe",
  "originalScore": 50,
  "enhancedScore": 80,
  "table": [
    { "skill": "javascript", "matched": true },
    { "skill": "aws", "matched": true },
    { "skill": "python", "matched": false }
  ],
  "newSkills": ["python"],
  "chanceOfSelection": 65
}
```

`originalScore` represents the percentage match between the job description and the uploaded resume. `enhancedScore` is the best match achieved by the generated resumes. `table` details how each job skill matched. `newSkills` lists job skills not found in the résumé, and `chanceOfSelection` averages the ATS score and skill match percentage to estimate selection likelihood.

S3 keys follow the pattern `<candidate>/<folder>/<date>/<file>.pdf`. This hierarchy keeps the uploaded résumé in the `cv` folder and AI-generated documents in the `enhanced` folder, each grouped by the processing date.

```
Jane_Doe/
├── cv/<date>/
│   └── Jane_Doe.pdf
└── enhanced/<date>/
    ├── cover_letter1.pdf
    ├── cover_letter2.pdf
    ├── Jane_Doe.pdf
    └── Jane_Doe_2.pdf
```

Each entry in `urls` points to a PDF stored in Amazon S3. If no cover letters or CVs are produced, the server responds with HTTP 500 and an error message.
