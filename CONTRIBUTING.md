# Contributing to ResumeForge

Thank you for investing time in improving ResumeForge. This guide captures the non-negotiable engineering conventions we follow so changes remain production ready from the first pull request.

## Getting started

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Run the full automated test pack** (unit, integration, end-to-end).
   ```bash
   npm test --silent
   ```
   The Jest configuration bails on the first failure so resolve issues as they appear. When iterating locally you can target subsets of the suite:
   - Unit tests: `npm run test:unit`
   - Integration tests: `npm run test:integration`

3. **Launch the local stack** when a workflow requires manual QA.
   ```bash
   npm run dev
   ```

## Architecture and layering

ResumeForge is organised around a clear domain-core-infrastructure layering model:

- **Domain** (`lib/resume`, `lib/scoring`, `lib/pdf`): pure business rules, no side effects, deterministic output. New behaviour must be modelled here first with small, composable functions.
- **Core/application** (`services`, `lambdas`, `microservices`): orchestration, request handling, validation, and orchestration across domain services.
- **Infrastructure** (`lib/uploads`, `lib/cloudfrontHealthCheck.js`, `config/`, AWS SDK clients): all external system integrations. Always depend on these via dependency injection so callers can stub them in tests.

When introducing new code:
- Design outward-first—start with high-level workflow tests in `tests/` to describe the desired behaviour before drilling into domain units.
- Keep functions single-purpose and side-effect free unless they live in the infrastructure layer.
- Avoid leaking infrastructure details into the domain layer.

## TypeScript-first modules

Author any new modules in TypeScript (`.ts`/`.tsx`) whenever possible. Co-locate the compiled output alongside existing build tooling or extend the build scripts if a new compilation step is needed. If TypeScript is impractical (for example, when patching legacy CommonJS files), document the rationale in the pull request.

## Testing expectations

Every workflow must have:

- **Top-down documentation** describing the user journey or operational playbook in `docs/`. Update or create new files alongside code changes.
- **End-to-end coverage** in Jest (see `tests/**/*.e2e.test.js`). Add fixtures under `samples/` and prefer dependency injection for external services so mocks remain lightweight.
- **Contract/regression tests** for observable APIs in `tests/contract/`.

Never merge failing tests. If you need to pause a test temporarily, mark it with `test.skip` and open a follow-up issue with owner and deadline.

## Coding conventions

- Delete dead or duplicate code instead of commenting it out.
- Keep functions short—extract helpers whenever logic branches or external coordination expands.
- Inject AWS/Gemini/PDF clients and configuration via parameters rather than importing singletons. Reference existing factories in `lib/llm/` and `lib/uploads/` for examples.
- Use structured logging via `logger.js`. Ensure major errors surface in the dashboard footer telemetry pipeline (`client/src/components/DashboardFooter.jsx`).
- Normalise artefact names using utilities in `lib/uploads/` so S3 and CloudFront paths stay consistent across services.

## Observability and release hygiene

Before requesting review:

1. **Publish distribution URLs** – run `npm run publish:cloudfront-url` and include the output plus any generated download URLs in the deployment notes/PR description.
2. **Record uptime metrics** – ensure the CloudWatch dashboards that track CloudFront, API Gateway, and Lambda uptime are up to date. If changes affect monitoring, update the automation in `services/uptimePublisher` (or create it if missing).
3. **Document version information** – confirm the healthy dashboard footer surfaces the currently deployed frontend build, backend commit hash, and API health status.

## Pull request checklist

- [ ] Tests added or updated (unit, integration, e2e).
- [ ] Documentation refreshed for every affected workflow.
- [ ] Observability signals (logs, metrics, alerts) reviewed.
- [ ] CloudFront and artefact download URLs shared in commit/deploy notices.
- [ ] Reviewers have instructions to reproduce and validate the change locally.

Following these steps keeps ResumeForge fast, reliable, and ready for candidates at all times.
