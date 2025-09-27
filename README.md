# ResumeForge

## Overview
ResumeForge generates tailored cover letters and enhanced CV versions by combining a candidate's résumé with a scraped job description. The Express API is wrapped with `@vendia/serverless-express` and deployed to AWS Lambda behind API Gateway so the entire stack runs on demand. Persistent artifacts are stored in Amazon S3 while DynamoDB (on-demand billing) retains processing metadata, keeping the monthly infrastructure cost negligible for small user counts.

## Environment configuration
ResumeForge now keeps its required configuration alongside the code. The `INLINE_SECRETS` constant in `server.js` defines defaults for the values that previously lived in AWS Secrets Manager. Update those entries (or override them through environment variables) before running locally or deploying to AWS.

The runtime looks for the following keys:

```json
{
  "AWS_REGION": "ap-south-1",
  "PORT": "3000",
  "GEMINI_API_KEY": "<api-key>",
  "S3_BUCKET": "resume-forge-data",
  "RESUME_TABLE_NAME": "ResumeForge"
}
```

- `GEMINI_API_KEY` – Google Gemini API key. A placeholder is shipped in `INLINE_SECRETS`; replace it with a valid key or set the `GEMINI_API_KEY` environment variable. The server validates that a non-empty value is present at startup.
- `S3_BUCKET` – Destination bucket for uploads, logs, and generated PDFs. Edit `INLINE_SECRETS.S3_BUCKET` or set the `S3_BUCKET` environment variable to match your deployment.
- `AWS_REGION`, `PORT`, and `RESUME_TABLE_NAME` can continue to come from the environment. Reasonable defaults are provided for local development.

Because the configuration is loaded and cached once, the service reuses the same credentials across requests instead of recreating clients every time.

### Required parameters for AWS deployment

Deployments still expect the following AWS SAM parameters:

- `DataBucketName` – S3 bucket that stores original uploads, logs, and generated documents.
- `ResumeTableName` – DynamoDB table for metadata (defaults to `ResumeForge`).
- `CreateDataBucket` – set to `false` when pointing at an existing bucket so the stack does not try to create it again (defaults to `true`).
- `CreateResumeTable` – set to `false` when reusing a DynamoDB table created outside the stack (defaults to `true`).

## IAM Policy
Minimal permissions required by the server:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::S3_BUCKET/*"
    },
    {
      "Effect": "Allow",
      "Action": ["dynamodb:DescribeTable", "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem"],
      "Resource": "arn:aws:dynamodb:REGION:ACCOUNT_ID:table/RESUME_TABLE_NAME"
    }
  ]
}
```

## Serverless deployment on AWS

The project now ships with an AWS SAM template (`template.yaml`) that deploys the Express API as an AWS Lambda function behind A
PI Gateway, using on-demand DynamoDB billing and a single S3 bucket to minimise cost for low traffic workloads.

### Prerequisites

1. Install the AWS SAM CLI and authenticate with the target AWS account.
2. Update `INLINE_SECRETS` (or set the corresponding environment variables) with production-ready values for `GEMINI_API_KEY` and `S3_BUCKET` before building the deployment artifact.
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
- `ResumeTableName` – DynamoDB table name (defaults to `ResumeForge`)
- `CreateDataBucket` – answer `false` if the bucket already exists and should be reused
- `CreateResumeTable` – answer `false` if the DynamoDB table already exists and should be reused

The deployment creates:

- `ResumeForgeHandler` Lambda function (Node.js 18) using `lambda.js`
- Regional REST API Gateway with binary support for `multipart/form-data`
- S3 bucket for uploads/logs and DynamoDB table with on-demand billing

After `sam deploy` completes it prints the `AppBaseUrl`, `ApiBaseUrl`, and `CloudFrontUrl` outputs. `AppBaseUrl` is the primary CloudFront front page and the canonical entry point for the hosted application. The production endpoint for the application is:

```
https://<api-id>.execute-api.<region>.amazonaws.com/<stage>
```

Using the default stage (`prod`), the `/api/process-cv` endpoint is reachable either directly through API Gateway or via the CloudFront distribution:

```
https://<api-id>.execute-api.<region>.amazonaws.com/prod/api/process-cv
https://<cloudfront-id>.cloudfront.net/api/process-cv
```

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
2. Ensure `INLINE_SECRETS` (or the corresponding environment variables) contains valid values for `GEMINI_API_KEY` and `S3_BUCKET`.
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
| `GEMINI_API_KEY` | Gemini API key provided to the runtime via environment variable overrides. |

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
