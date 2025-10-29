# CI/CD Pipeline and Infrastructure as Code Strategy

This document outlines the shared expectations for automating ResumeForge deployments and managing infrastructure through code. It is intended for platform engineers, application developers, and operations staff who build, test, and ship updates to production.

## Infrastructure as Code

* **Source-controlled stacks** – All AWS infrastructure (Amazon S3 buckets, Lambda functions, DynamoDB tables, API Gateway resources, and CloudFront distributions) must be defined in version-controlled AWS SAM or AWS CDK projects. Inline console changes are considered out of process and must be captured through a pull request to keep environments reproducible.
* **Runtime standards** – Lambda functions that run Node.js use the latest AWS-supported LTS runtime (Node.js 18 today, or Node.js 20 once generally available). When runtimes are upgraded, update the SAM/CDK definition and rebuild bundles to pick up security fixes.
* **Artifact hygiene** – Prior to packaging or publishing artifacts, ensure build directories and `node_modules` are removed. CD workflows should run clean installs and create fresh deployment bundles to prevent stale dependencies or build cache drift.
* **Build tooling** – Bundle Lambda sources with `esbuild` to optimise cold start performance and minimise package size. SAM build hooks or CDK bundling options should invoke `esbuild` with minification enabled and the platform targeted to the Lambda runtime.

## Continuous Integration

* **Static analysis** – All JavaScript and TypeScript code paths are linted during CI. Pipelines must run `npm run lint` (or the workspace equivalent) and fail the build on unfixable issues. Auto-fixable problems should be corrected within the pipeline before packaging artifacts.
* **Automated testing** – CI executes unit and integration test suites. Infrastructure templates are validated with `sam validate` or `cdk synth` as part of the workflow to catch configuration issues before deployment.
* **GitHub Actions automation** – `.github/workflows/ci.yml` installs dependencies with `npm ci`, runs the aggregated `npm run test:ci` suite (lint, unit, integration, e2e, and template verification), and validates the SAM template with `sam validate --lint`. Coverage reports are uploaded as build artifacts and the workflow writes a concise job summary so failing checks surface actionable diagnostics inside the pull request.

## Continuous Delivery

* **Staged deployments** – Deployments flow through sandbox and staging environments before production. Each stage uses the same SAM/CDK stack definitions to guarantee parity.
* **Post-deploy verification** – After a stack update completes, the pipeline invokes `/healthz` and `/api/process-cv` endpoints to confirm application readiness. Failures trigger an automatic rollback or raise an incident before traffic is shifted.
* **CloudFront cache management** – Every production deployment issues a CloudFront invalidation (`/*`) to flush cached assets and API responses. Automate this as part of the release pipeline so new code and configuration are visible immediately. All post-deploy cache is invalidated with a `/*` path after each deployment to guarantee the CDN stops serving stale artifacts before traffic returns to the site.
* **GitHub Actions deployment workflow** – `.github/workflows/deploy.yml` performs manual (`workflow_dispatch`) deployments. The workflow assumes the configured AWS role, rebuilds Lambda and client assets, deploys the SAM stack, and issues a CloudFront invalidation. Passing the resolved distribution domain directly into `npm run verify:cloudfront` keeps CDN health checks inside the pipeline. Inputs allow operators to skip the pre-deploy tests during emergency fixes or temporarily ignore CloudFront verification errors while an incident is mitigated.

## Operations and observability enhancements

The GitHub Actions workflows publish job summaries so responders can review failure context without downloading artifacts. CI uploads the LCOV coverage file for local inspection when tests fail, while the deployment job records the target environment and CloudFront domain in its summary. Together these additions shorten the feedback loop for triaging build failures and verifying production readiness.

## Operational Guardrails

* **Observability hooks** – Pipelines publish deployment metadata (commit SHA, artifact version, environment) to CloudWatch Logs and monitoring dashboards to provide traceability for operational responders.
* **Secrets management** – Sensitive configuration stays in AWS Secrets Manager or SSM Parameter Store. The CI/CD system retrieves secrets at deploy time and never commits secrets to the repository.

## Local Development Experience

* **Hot reload** – The local development environment exposes hot-reload for front-end and API components so engineers can iterate quickly without manual restarts.
* **Lambda emulation** – Provide a local Lambda emulator (SAM CLI, `serverless offline`, or similar) to mirror production handlers while developing.
* **Local S3 toggle** – Developers can switch between AWS S3 and a LocalStack-backed S3 endpoint to test object operations without incurring cloud costs.

By adhering to these guidelines, teams keep infrastructure definitions consistent, deployments reliable, and developer feedback loops fast.
