# ResumeForge

## Overview
ResumeForge generates tailored cover letters by combining a candidate's résumé with a scraped job description. The service uses OpenAI for text generation and stores session artifacts in Amazon S3.

## Environment Variables
The server relies on the following environment variables:

```json
{
  "AWS_REGION": "us-east-1",
  "SECRET_ID": "your-secret-id",
  "PORT": "3000",
  "ALLOW_DEV_PLAINTEXT": "0"
}
```

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

## Edge Cases
- **Name extraction fallback:** If the résumé text lacks a detectable name, the generated content defaults to a generic placeholder such as "Candidate".
- **Job description scraping limitations:** The job description is retrieved with a simple HTTP GET request; dynamic or access-restricted pages may return empty or blocked content.

