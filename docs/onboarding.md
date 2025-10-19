# ResumeForge onboarding primer

This primer helps new teammates explain ResumeForge to "regular" users — candidates who sign in only to tailor their résumé and cover letter for a specific job.

## Quick narrative of the candidate loop

1. **Upload a résumé** – Candidates drop a PDF/DOC/DOCX file into the portal. The app validates the file immediately so users either move forward with confidence or see a blocking message that explains how to fix the issue.
2. **Paste the job description** – Candidates must paste the full vacancy text directly into the form. URLs are rejected so we never rely on brittle scraping or third-party authentication. The flow pauses here until non-empty text is supplied, guaranteeing the downstream analysis always has the authoritative job description.
3. **Evaluate** – Clicking **Evaluate me against the JD** runs the ATS analysis on the uploaded résumé plus the captured job description, surfacing alignment scores, probability of selection, and highlighted gaps.
4. **Accept or reject improvements** – Candidates choose which AI suggestions to apply section by section (or all at once). Every choice updates the working draft immediately while preserving a change log for transparency.
5. **Re-run the analysis** – With each accepted edit, the candidate can trigger **Evaluate me against the JD** again to see how the scores shift. They repeat steps 4–5 until satisfied with the ATS outcome.
6. **Download deliverables** – When the latest evaluation looks good, users export the refreshed résumé, tailored cover letter, and change log. Only the newest artefacts for the current session remain in storage.

## Talking points for support and success teams

- **Emphasise control:** The improvement loop is user-driven. ResumeForge never auto-applies changes or forces the next step; candidates decide when to accept edits and when to re-run scoring.
- **Highlight iteration:** Encourage users to evaluate, tweak, and re-evaluate multiple times. The dashboard updates instantly so they can observe the impact of each round of changes before downloading.
- **Set expectations on data retention:** Explain that uploads and generated files are scoped to the active session and are overwritten on subsequent iterations, keeping storage lean without manual cleanup.
- **Share the entry point:** Direct candidates to the active CloudFront domain listed in the README and `docs/cloudfront-url.md` so they always land on the latest deployment. Run `npm run verify:cloudfront` right after publishing to catch CDN regressions before sharing links.

## Where to learn more

- **Candidate journey details:** [`docs/user-journey.md`](./user-journey.md) provides a step-by-step view with behind-the-scenes notes.
- **System internals:** The main [README](../README.md) covers architecture, configuration, and deployment practices.

## Key API touchpoints in the onboarding loop

| Step | Endpoint | Purpose |
| --- | --- | --- |
| Upload résumé | `POST /api/process-cv` | Stores the résumé, manual job description, and session metadata. Kicks off scoring and orchestration events. |
| Evaluate fit | `POST /api/score-match` | Runs ATS scoring against the pasted job description for the current session. |
| Apply improvements | `POST /api/improve-all` for batch LLM passes, `POST /api/enhance-all` (alias: `POST /api/improve-ats`) and section-specific `POST /api/improve-*` routes | Generates targeted rewrites that the candidate can accept or reject. |
| Regenerate deliverables | `POST /api/generate-enhanced-docs` | Produces refreshed résumé variants and cover letters, tagging each artifact with template and session metadata. |
| Download artifacts | `POST /api/refresh-download-link` | Issues signed URLs for the current session’s files so the candidate can download the final package. |
