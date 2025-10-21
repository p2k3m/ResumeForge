# Microservice architecture

ResumeForge deploys discrete, domain-scoped Lambda functions that reuse a shared Express middleware stack. Each function exposes only the endpoints required for its domain so we can scale traffic hotspots independently while keeping the codebase familiar for teams used to Express. There is no monolithic catch-all handler—API Gateway always invokes the specific function for the requested route.

## Service catalogue

| Key | Description | Endpoints |
| --- | --- | --- |
| `clientApp` | Serves the compiled React client and static assets (HTML, JS, fonts, icons). | `GET /`, `GET /index.html`, `GET /favicon.ico`, `GET /manifest.webmanifest`, `GET /robots.txt`, `GET /service-worker.js`, `GET /assets/*`, `GET /fonts/*`, `GET /images/*`, `GET /cover-templates/*` |
| `resumeUpload` | Accepts résumé uploads, persists session metadata, and kicks off preprocessing. | `POST /api/process-cv` |
| `jobEvaluation` | Consumes résumé text plus a job description and returns fit analysis. | `POST /api/jd/evaluate` |
| `scoring` | Calculates match scores and supports re-scoring after enhancements. | `POST /api/score-match`, `POST /api/rescore-improvement` |
| `enhancementImproveSummary` | Runs Gemini-powered improvements for résumé summaries. | `POST /api/improve-summary` |
| `enhancementImproveSkills` | Adds and refines skills to match the target JD. | `POST /api/add-missing-skills`, `POST /api/improve-skills` |
| `enhancementImproveDesignation` | Aligns designations and job titles with the JD. | `POST /api/change-designation`, `POST /api/improve-designation` |
| `enhancementImproveExperience` | Reframes experience bullets to match responsibilities. | `POST /api/align-experience`, `POST /api/improve-experience` |
| `enhancementImproveCertifications` | Refreshes certification highlights and narratives. | `POST /api/improve-certifications` |
| `enhancementImproveProjects` | Enhances project write-ups and outcomes. | `POST /api/improve-projects` |
| `enhancementImproveHighlights` | Polishes key highlights and achievements. | `POST /api/improve-highlights` |
| `enhancementImproveAts` | Executes whole-resume ATS uplift passes. | `POST /api/enhance-all`, `POST /api/improve-ats` |
| `enhancementImproveAll` | Runs every targeted improvement in a single batch request. | `POST /api/improve-all` |
| `documentGeneration` | Generates downloadable CV variants and cover letters. API requests are enqueued to a FIFO queue and processed by a dedicated worker Lambda. | `POST /api/generate-enhanced-docs`, `POST /api/render-cover-letter` |
| `auditing` | Publishes change logs, download refreshes, CloudFront metadata and health checks. | `POST /api/change-log`, `POST /api/refresh-download-link`, `GET /api/published-cloudfront`, `GET /healthz` |

See [`microservices/services.js`](../microservices/services.js) for the source of truth used by all Lambda entrypoints.

## Handler factory

[`microservices/createServiceHandler.js`](../microservices/createServiceHandler.js) wraps the shared Express middleware with `@vendia/serverless-express`. The factory accepts a service configuration (name, routes, and optional binary media types) and returns the Lambda handler. Requests that miss the declared route list receive a structured `404` response containing the service name and the attempted path/method, which simplifies API Gateway log searches when a client accidentally calls the wrong microservice while ensuring no request falls back to a monolithic Lambda.

```js
import { createServiceHandler } from '../microservices/createServiceHandler.js';
import { getServiceConfig } from '../microservices/services.js';

export const handler = createServiceHandler(getServiceConfig('resumeUpload'));
```

## Infrastructure wiring

`template.yaml` registers each endpoint as an independent `AWS::Serverless::Function` wired to `ResumeForgeApi`. Provisioned concurrency, IAM policies, and environment configuration stay identical across microservices thanks to YAML anchors. Operations teams can dial up concurrency for AI-heavy services (enhancement, document generation) without touching lightweight auditing flows.

Because every function mounts the same Express app, we still share validation, logging, and retry helpers. When a feature spans services—for example, resume enhancement writing audit entries consumed by the auditing Lambda—it does so through shared modules, not cross-service HTTP calls. This keeps latency low while retaining microservice isolation at the deployment level.

## Orchestration state machine

Large workflows—uploading a resume, scoring it, applying improvements, and emitting updated artefacts—are now coordinated by an AWS Step Functions state machine. The `ResumeForgeWorkflowStateMachine` listens to `resumeForge.workflow` events on the dedicated EventBridge bus and runs the pipeline below:

1. **Score** – `WorkflowScoreFunction` reuses the scoring service to calculate ATS alignment and determine missing skills. The results feed downstream steps.
2. **Enhancement fan-out** – Step Functions executes a `Map` state that invokes `WorkflowEnhancementSectionFunction` in parallel for each section (summary, skills, designation, experience, certifications, projects, highlights). Each invocation returns a deterministic patch describing the proposed change.
3. **Combine** – `WorkflowCombineFunction` deterministically applies the patches to the base résumé so the final document captures every section-level change.
4. **Generate PDF** – `WorkflowGenerateFunction` renders the refreshed résumé into a PDF and pushes it to S3. The object key is shared with downstream consumers through the state machine output.

`services/orchestration/eventBridgePublisher.js` publishes the initial event from the synchronous upload path without blocking the user. Because the orchestration is asynchronous, slow enhancement or generation work never delays the API response while still guaranteeing the state machine receives the same payload the frontend used for the initial submission.
