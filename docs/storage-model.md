# Storage model

This document captures how ResumeForge organises artefacts in Amazon S3, how long
those artefacts live, and how download links are produced. Share this with new
engineers or System Operations so they can reason about the storage workflow
without reverse-engineering `server.js`.

## Bucket configuration

* The application reads the bucket name from secrets or environment variables
  via `getSecrets()`; the runtime value is exposed as `S3_BUCKET`. If the bucket
  is missing the service immediately returns `STORAGE_UNAVAILABLE`.
* All write/read operations reuse a single regional bucket. There is no
  secondary archive bucket.

## Upload lifecycle

1. **Initial staging** – Uploaded files stream into a short-lived
   `job/<jobId>/incoming/<ISO-date>/` prefix. The raw object lands at
   `original.<ext>` alongside a processing log seed. This provides a predictable
   location even before the résumé is classified.  The upload is rejected if the
   PUT fails.
2. **Canonical relocation** – After validation, the service derives a canonical
   prefix by normalising the candidate, date, job, and request id segments (see
   [Key structure](#key-structure) below). The raw upload is copied into that
   prefix and the temporary object is deleted so storage only retains the
   canonical version.
3. **Metadata & logs** – DynamoDB receives a record containing the canonical key
   and contextual metadata. JSONL/JSON logs are written under
   `<prefix>/logs/processing.jsonl` and `<prefix>/logs/log.json` to capture the
   full processing trail.

## Key structure

Canonical prefixes are built by `buildDocumentSessionPrefix()` using sanitised
segments to avoid unsafe characters and to keep paths deterministic for Ops.
Segments are appended in the following order: `cv/<owner>/<ISO-date>/<job>/<session>/`.
Each segment is optional except for the owner, which falls back to `candidate`.
All values are lower-cased, trimmed, and truncated where appropriate.

Generation runs add a secondary `runs/<request-id>/` directory under the session
prefix. Every call to the generator computes a `generationRunSegment` by
sanitising the request id or falling back to a random identifier. That ensures a
new run never overwrites artefacts from prior attempts in the same session.

Within each run the service writes:

* **PDF artefacts** – Enhanced CVs and cover letters are uploaded as
  `<generatedPrefix>/<slug>.pdf`. The slug is derived from the template id and
  document type and is deduplicated with `ensureUniqueFileBase()` so collisions
  append `_2`, `_3`, etc.
* **Text artefacts** – JSON snapshots (original text, generated versions, and
  change log) live under `<generatedPrefix>/artifacts/*.json` so they are
  co-located with the PDFs that produced them.
* **Activity logs** – Structured log events for uploads, generation, and
  failures are appended to the JSONL file in the same session prefix for easy
  incident reconstruction.

## Retention expectations

* The relocation step deletes the temporary upload, but canonical prefixes are
  never pruned in application code. S3 therefore retains a full history of runs
  per candidate/job until a lifecycle policy deletes them manually.
* Because each generation uses a unique `runs/<request-id>/` directory and file
  slugs are deduplicated, regenerated résumés accumulate instead of overwriting
  older ones. Operations can safely archive or expire entire prefixes without
  risking cross-run conflicts.

## Download logic

* The API signs downloads with `@aws-sdk/s3-request-presigner`. URLs expire one
  hour after issuance (`URL_EXPIRATION_SECONDS = 3600`). Both the canonical
  upload and each generated PDF receive presigned URLs with ISO 8601
  `expiresAt` timestamps so clients know when to refresh.
* `ensureOutputFileUrls()` normalises every response entry so the client always
  receives consistent `url`, `fileUrl`, and `typeUrl` fields. It also injects the
  document type into the URL fragment, which keeps analytics and download UX in
  sync regardless of which field a consumer reads.
* If no allowed download origins are configured, the service still uploads the
  artefacts but flags the restriction in logs for visibility.

## Operational considerations

* Apply S3 lifecycle policies at the prefix level to manage growth; the
  application never deletes completed runs automatically.
* When triaging incidents, inspect the session prefix: the logs directory shows
  the processing trail, the `runs/` subfolders enumerate each attempt, and the
  `artifacts/` directory contains the JSON representation of what users saw.
