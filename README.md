# ResumeForge

## Overview
ResumeForge generates tailored cover letters and enhanced CV versions by combining a candidate's résumé with a scraped job description. The service uses Google's Gemini generative AI for text generation and stores session artifacts in Amazon S3.

## Environment Variables
The server relies on the following environment variables:

```json
{
  "AWS_REGION": "ap-south-1",
  "SECRET_ID": "your-secret-id",
  "PORT": "3000",
  "GEMINI_API_KEY": "<api-key>",
  "OPENAI_API_KEY": "<api-key>",
  "S3_BUCKET": "resume-forge-data",
  "REQUEST_TIMEOUT_MS": "5000",
  "TRUST_PROXY": "1",
  "ENFORCE_HTTPS": "true"
}
```

`SECRET_ID` is required in production and must reference an AWS Secrets Manager secret containing the values shown below. During
local development you may omit `SECRET_ID` and instead provide a `local-secrets.json` file at the project root with the same
JSON structure. If neither `SECRET_ID` nor `local-secrets.json` is present, the server will fail to start.

`S3_BUCKET` defines where uploads and logs are stored. If it is not set in the environment or secret, the server falls back to
`resume-forge-data`, which is suitable for local development.

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
Evaluation and session metadata are stored in a DynamoDB table (default name `ResumeForge`).
Each item includes:

- `jobId` – primary key for the log entry.
- `createdAt` – timestamp in milliseconds.
- `ipAddress` – IP address of the requester.
- `location` – city and country derived from the IP address.
- `userAgent` – raw user agent string.
- `browser`, `os`, `device` – parsed client details.
- Optional URLs like `jobDescriptionUrl`, `linkedinProfileUrl`, and `credlyProfileUrl`.
- Fields such as `docType`, `atsScore`, `improvement`, `cvKey`, and `coverLetterKey` when relevant.

## Local Development
1. Install dependencies in both the server and client directories:
   ```bash
   npm install
   cd client && npm install
   ```
2. Provide the environment variables and AWS secret as shown above.
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
- Allowed file types: `.pdf`, `.docx`
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


## Edge Cases
- **Name extraction fallback:** If the résumé text lacks a detectable name, the generated content defaults to a generic placeholder such as "Candidate".
- **Job description scraping limitations:** The job description is retrieved with a simple HTTP GET request; dynamic or access-restricted pages may return empty or blocked content.

## API Response
The `/api/process-cv` endpoint returns JSON containing an array of generated files along with match statistics and an estimated chance of selection:

```json
{
  "urls": [
    { "type": "cover_letter1", "url": "https://<bucket>.s3.<region>.amazonaws.com/sessions/Jane_Doe/<id>/generated/cover_letter/cover_letter1.pdf" },
    { "type": "version1", "url": "https://<bucket>.s3.<region>.amazonaws.com/sessions/Jane_Doe/<id>/generated/cv/Jane_Doe.pdf" }
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

S3 keys follow the pattern `sessions/<name>/<id>/generated/<subdir>/<file>.pdf`, where `<subdir>` is `cover_letter/` or `cv/` depending on the file type.

```
sessions/Jane_Doe/<id>/generated/
├── cover_letter/
│   ├── cover_letter1.pdf
│   └── cover_letter2.pdf
└── cv/
    ├── Jane_Doe.pdf
    └── Jane_Doe_2.pdf
```

Each entry in `urls` points to a PDF stored in Amazon S3. If no cover letters or CVs are produced, the server responds with HTTP 500 and an error message.
