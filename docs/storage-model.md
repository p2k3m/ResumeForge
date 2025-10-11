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
   canonical version. When an existing session is regenerated, the pipeline
   reuses this prefix and flags any superseded PDFs or JSON artefacts for
   deletion once the replacement upload succeeds.
3. **Metadata & logs** – DynamoDB receives a record containing the canonical key
   and contextual metadata. JSONL/JSON logs are written under
   `<prefix>/logs/processing.jsonl`, `<prefix>/logs/log.json`, and the session
   change log `<prefix>/logs/change-log.json` to capture the full processing
   trail without storing verbose change history in DynamoDB.

## Key structure

Canonical prefixes are built by `buildDocumentSessionPrefix()` using sanitised
segments to avoid unsafe characters and to keep paths deterministic for Ops.
Segments are appended in the following order: `cv/<owner>/<session>/`. Each
segment is optional except for the owner, which falls back to `candidate`. The
session segment is normally derived from the request id; when unavailable the
code falls back to sanitised job/date metadata to keep paths unique. All values
are lower-cased, trimmed, and truncated where appropriate.

Within each session the service writes:

* **PDF artefacts** – Enhanced CVs and cover letters are uploaded as
  `<sessionPrefix>/<template>/<variant>.pdf`. The helper
  `buildTemplateScopedPdfKey()` sanitises both the template id and variant (for
  example `version1` or `cover_letter2`) and appends numeric suffixes when a key
  would otherwise collide during the same request.
* **Text artefacts** – JSON snapshots (original text, generated versions, and
  change logs) live under `<sessionPrefix>/artifacts/*.json` so they are
  co-located with the PDFs that produced them. The session-wide change history
  is mirrored to `<sessionPrefix>/logs/change-log.json` after each update so
  DynamoDB retains only lightweight pointers.
* **Activity logs** – Structured log events for uploads, generation, and
  failures are appended to the JSONL file in the same session prefix for easy
  incident reconstruction.

## Retention expectations

* The relocation step deletes the temporary upload. When
  `ENABLE_GENERATION_STALE_ARTIFACT_CLEANUP=true`, the generation pipeline also
  prunes any superseded artefacts (PDFs and JSON exports) that were attached to
  the session so Ops do not have to sift through stale variants when debugging
  or exporting files.
* Because each template/variant combination maps to a stable key inside the
  session prefix, the latest run overwrites the previous PDF for that slot. When
  stale artefact cleanup is enabled, the routine removes any alternate keys
  (such as `*_2.pdf`) that might have been created in older runs. Historical
  activity is preserved via the session change log JSON; S3 retains superseded
  document bodies unless the cleanup flag is enabled.
* Set `ENABLE_DOWNLOAD_SESSION_LOG_CLEANUP=true` when operating at scale to drop
  `logs/change-log.json` once a download session expires. Leave the flag unset
  to retain the change log for audits and manual investigations.
* Set `ENABLE_GENERATION_STALE_ARTIFACT_CLEANUP=true` when reclaiming storage is
  more important than retaining previous generated documents. Leave the flag
  unset to keep prior artefact versions for audits and debugging.

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
  application never deletes completed sessions automatically.
* When triaging incidents, inspect the session prefix: the logs directory shows
  the processing trail (including `change-log.json`), the per-template folders
  hold the generated PDFs, and the `artifacts/` directory contains the JSON
  representation of what users saw.
