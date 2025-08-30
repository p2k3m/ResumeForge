# ResumeForge

## Overview
ResumeForge generates tailored cover letters by combining a candidate's résumé with a scraped job description. The service uses OpenAI for text generation and stores session artifacts in Amazon S3.

## Environment Variables
The server relies on the following environment variables:

```json
{
  "AWS_REGION": "ap-south-1",
  "SECRET_ID": "your-secret-id",
  "PORT": "3000",
  "ALLOW_DEV_PLAINTEXT": "0"
}
```

`SECRET_ID` is required in production and must reference an AWS Secrets Manager secret containing the values shown below. During
local development you may omit `SECRET_ID` and instead provide a `local-secrets.json` file at the project root with the same
JSON structure. If neither `SECRET_ID` nor `local-secrets.json` is present, the server will fail to start.

The AWS Secrets Manager secret referenced by `SECRET_ID` must contain:

```json
{
  "OPENAI_API_KEY": "sk-...",
  "S3_BUCKET": "resume-forge-data"
}
```

If `ALLOW_DEV_PLAINTEXT` is set to `1`, the server will read the OpenAI API key from the `OPENAI_API_KEY` environment variable for local development. In production, leave `ALLOW_DEV_PLAINTEXT` unset (or `0`) to ensure credentials are retrieved exclusively from AWS Secrets Manager.

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

## Local Development
1. Install dependencies in both the server and client directories:
   ```bash
   npm install
   npm install tiktoken
   cd client && npm install
   ```
   `tiktoken` is required for token counting and may require Node.js 18 or later.
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
- Allowed file types: `.pdf`
- Legacy `.doc` files are rejected.

## Edge Cases
- **Name extraction fallback:** If the résumé text lacks a detectable name, the generated content defaults to a generic placeholder such as "Candidate".
- **Job description scraping limitations:** The job description is retrieved with a simple HTTP GET request; dynamic or access-restricted pages may return empty or blocked content.

## API Response
The `/api/process-cv` endpoint returns JSON containing an array of generated files:

```json
{
  "urls": [
    { "type": "ats", "url": "https://<bucket>.s3.<region>.amazonaws.com/sessions/<id>/generated/ats.pdf" }
  ],
  "applicantName": "Jane Doe"
}
```

Each entry in `urls` points to a PDF stored in Amazon S3. If no cover letters are produced, the server responds with HTTP 500 and an error message.
