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
  "S3_BUCKET": "resume-forge-data"
}
```

`SECRET_ID` is required in production and must reference an AWS Secrets Manager secret containing the values shown below. During
local development you may omit `SECRET_ID` and instead provide a `local-secrets.json` file at the project root with the same
JSON structure. If neither `SECRET_ID` nor `local-secrets.json` is present, the server will fail to start.

`S3_BUCKET` defines where uploads and logs are stored. If it is not set in the environment or secret, the server falls back to
`resume-forge-data`, which is suitable for local development.

`GEMINI_API_KEY` supplies the Google Gemini API key. Set it directly in your environment for development or include it in the
secret.

The AWS Secrets Manager secret referenced by `SECRET_ID` must contain:

```json
{
  "GEMINI_API_KEY": "<api-key>",
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
    { "type": "cover_letter1", "url": "https://<bucket>.s3.<region>.amazonaws.com/sessions/<id>/generated/cover_letter/cover_letter1.pdf" },
    { "type": "version1", "url": "https://<bucket>.s3.<region>.amazonaws.com/sessions/<id>/generated/cv/Jane_Doe.pdf" }
  ],
  "applicantName": "Jane Doe"
}
```

S3 keys follow the pattern `sessions/<id>/generated/<subdir>/<file>.pdf`, where `<subdir>` is `cover_letter/` or `cv/` depending on the file type.

```
sessions/<id>/generated/
├── cover_letter/
│   ├── cover_letter1.pdf
│   └── cover_letter2.pdf
└── cv/
    ├── Jane_Doe.pdf
    └── Jane_Doe_2.pdf
```

Each entry in `urls` points to a PDF stored in Amazon S3. If no cover letters or CVs are produced, the server responds with HTTP 500 and an error message.
