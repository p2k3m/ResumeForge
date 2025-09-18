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
  "S3_BUCKET": "resume-forge-data",
  "RESUME_TABLE_NAME": "ResumeForge"
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

### Required secrets and parameters for AWS deployment

Before deploying to AWS you must provision an AWS Secrets Manager secret (default name: `ResumeForge`) with the exact JSON stru
cture shown above. The fields are:

- `GEMINI_API_KEY` – Google Gemini API key used to generate resume content.
- `S3_BUCKET` – Optional override for the S3 bucket that stores uploads and generated PDFs. When omitted the application uses t
  he value passed as the `DataBucketName` parameter in the SAM template.

The Lambda function also relies on the following configuration parameters provided during deployment:

- `DataBucketName` – S3 bucket that stores original uploads, logs, and generated documents.
- `ResumeTableName` – DynamoDB table for metadata (defaults to `ResumeForge`).
- `SecretName` – Name of the Secrets Manager secret containing the JSON above (defaults to `ResumeForge`).

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

## Serverless deployment on AWS

The project now ships with an AWS SAM template (`template.yaml`) that deploys the Express API as an AWS Lambda function behind A
PI Gateway, using on-demand DynamoDB billing and a single S3 bucket to minimise cost for low traffic workloads.

### Prerequisites

1. Install the AWS SAM CLI and authenticate with the target AWS account.
2. Create the Secrets Manager secret described above (default name `ResumeForge`). Populate it with the required JSON values.
3. Ensure the chosen S3 bucket name is globally unique.

### Deploy

```bash
sam build --use-container
sam deploy --guided
```

During the guided deploy provide values for:

- `Stack Name` – e.g. `ResumeForge`
- `AWS Region` – e.g. `ap-south-1`
- `DataBucketName` – globally unique bucket name for uploads and generated files
- `ResumeTableName` – DynamoDB table name (defaults to `ResumeForge`)
- `SecretName` – Secrets Manager secret that stores the Gemini API key JSON payload

The deployment creates:

- `ResumeForgeHandler` Lambda function (Node.js 18) using `lambda.js`
- Regional REST API Gateway with binary support for `multipart/form-data`
- S3 bucket for uploads/logs and DynamoDB table with on-demand billing

After `sam deploy` completes it prints the `ApiBaseUrl` output. The production endpoint for the application is:

```
https://<api-id>.execute-api.<region>.amazonaws.com/<stage>
```

Using the default stage (`prod`), the `/api/process-cv` endpoint is reachable at:

```
https://<api-id>.execute-api.<region>.amazonaws.com/prod/api/process-cv
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
- **Job description scraping limitations:** The job description is retrieved with a simple HTTP GET request; dynamic or access-restricted pages may return empty or blocked content.

## API Response
The `/api/process-cv` endpoint returns JSON containing an array of generated files along with match statistics:

```json
{
  "urls": [
    { "type": "cover_letter1", "url": "https://<bucket>.s3.<region>.amazonaws.com/sessions/<id>/generated/cover_letter/cover_letter1.pdf" },
    { "type": "version1", "url": "https://<bucket>.s3.<region>.amazonaws.com/sessions/<id>/generated/cv/Jane_Doe.pdf" }
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
