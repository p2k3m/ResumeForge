# ResumeForge

## Overview
ResumeForge generates tailored cover letters and enhanced CV versions by combining a candidate's résumé with a scraped job description. The service uses Google's Gemini generative AI for text generation. All files are now organized in Amazon S3 under a candidate-specific root with two clear subfolders:

- `<candidate>/cv/<date>/` – the original résumé upload.
- `<candidate>/enhanced/<date>/` – generated cover letters and improved CVs.

This hierarchy replaces older examples that stored documents directly under the candidate's name, and it clarifies the separation between uploaded and generated files.

Job descriptions are fetched with an initial Axios request and fall back to a Puppeteer-rendered page when direct access fails or requires client-side rendering. This approach cannot bypass authentication or strict anti-bot measures, so some postings may still be unreachable.

## Environment Variables
The server relies on the following environment variables:

```json
{
  "AWS_REGION": "ap-south-1",
  "PORT": "3000",
  "GEMINI_API_KEY": "<api-key>",
  "OPENAI_API_KEY": "<api-key>",
  "S3_BUCKET": "resume-forge-data",
  "DYNAMO_TABLE": "ResumeForgeLogs",
  "REQUEST_TIMEOUT_MS": "5000",
  "TRUST_PROXY": "1",
  "ENFORCE_HTTPS": "true"
}
```

`SECRET_ID` is required in production and must reference an AWS Secrets Manager secret containing the values shown below. During
local development you may omit `SECRET_ID` and instead provide a `local-secrets.json` file at the project root with the same
JSON structure. If both are absent, the server falls back to empty credentials so it can operate offline, though features
requiring external services will be disabled.

`S3_BUCKET` defines where uploads and logs are stored. If it is not set in the environment or secret, the server falls back to
`resume-forge-data`, which is suitable for local development.

`DYNAMO_TABLE` specifies the DynamoDB table used for logging. If absent from the environment or secret, it defaults to
`ResumeForgeLogs`.

`REQUEST_TIMEOUT_MS` sets the timeout in milliseconds for outbound HTTP requests when fetching external profiles and job descriptions. It defaults to `5000`.

When deploying behind a reverse proxy or load balancer, set `TRUST_PROXY` to the number of trusted hops (typically `1`) so Express honors `X-Forwarded-*` headers. Combine this with `ENFORCE_HTTPS=true` to redirect all HTTP requests to `https://`.


`GEMINI_API_KEY` and `OPENAI_API_KEY` supply the Google Gemini and OpenAI API keys. Set them directly in your environment for development or include them in the secret.

The AWS Secrets Manager secret referenced by `SECRET_ID` must contain:

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

## DynamoDB Table
Evaluation and session metadata are stored in a DynamoDB table (default name `ResumeForgeLogs`).
Each item includes:

- `jobId` – primary key for the log entry.
- `createdAt` – timestamp in milliseconds.
- `ipAddress` – IP address of the requester.
- `location` – city and country derived from the IP address.
- `userAgent` – raw user agent string.
- `browser`, `os`, `device` – parsed client details.
- Optional URLs like `jobDescriptionUrl`, `linkedinProfileUrl`, and `credlyProfileUrl`.
- Fields such as `docType`, `atsScore`, `improvement`, `cvKey`, and `coverLetterKey` when relevant.

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
