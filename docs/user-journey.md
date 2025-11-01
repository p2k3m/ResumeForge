# Candidate journey guide

This guide walks a candidate through ResumeForge end to end so every action has a clearly defined outcome.

> **Start here:** [`https://d109hwmzrqr39w.cloudfront.net`](https://d109hwmzrqr39w.cloudfront.net) is the active CloudFront entry point (fronting the `resume-forge-app-2025` bucket in `ap-south-1` at origin path `/static/client/prod/latest`). Share this link with candidates so they always land on the latest deployment. Run `npm run verify:cloudfront` after each publish to confirm the CDN is still answering `/healthz` before sending traffic. If CloudFront is degraded, route urgent requests through the API Gateway fallback at [`https://a1b2c3d4e5.execute-api.ap-south-1.amazonaws.com/prod`](https://a1b2c3d4e5.execute-api.ap-south-1.amazonaws.com/prod) until the CDN recovers.
>
> Last verified: 18 March 2025 at 09:45 UTC per [`config/published-cloudfront.json`](../config/published-cloudfront.json).

## 1. Upload a résumé
- **What to do:** Drag-and-drop or browse for a PDF, DOC, or DOCX résumé.
- **Behind the scenes:** The file is streamed straight to S3 and a DynamoDB session is created with hashed personal data. The portal immediately validates the file type and page structure.
- **Expected result:** If the document passes validation, the upload progress bar completes and the session status changes to **Résumé received**. When the file is rejected the UI surfaces a blocking alert (for example, “This looks like a presentation deck. Please upload a CV.”) and the candidate can try again without losing form progress.

## 2. Supply the job description
- **What to do:** Paste the entire job description into the textbox. URLs are no longer accepted.
- **Behind the scenes:** The backend validates that non-empty text was provided, strips unsafe markup, and stores the raw description alongside the session. Because we removed URL scraping, we never rely on external authentication or brittle DOM automation.
- **Expected result:** The candidate sees the character counter update and cannot proceed until the paste box contains real content, guaranteeing every analysis run uses the pasted job description.

## 3. Launch the ATS analysis
- **What to do:** Press **Evaluate me against the JD**.
- **Behind the scenes:** Lambda analyses the résumé and job description, runs ATS heuristics, and scores the submission across Layout & Searchability, Readability, Impact, Crispness, and Other. It also compares the CV against the JD to detect gaps in designations, skills, experience, certifications, and highlights.
- **Expected result:** The dashboard populates with a total ATS score, probability of selection, and contextual insights (e.g., “Add Kubernetes to align with JD requirements”). Errors surface inline with instructions to retry or adjust inputs.

## 4. Iterate on improvements
- **What to do:** Use the **Improve** buttons on individual sections or click **Improve All** to accept every suggestion at once. Revisit sections as many times as needed before progressing.
- **Behind the scenes:** AI-generated rewrites are staged per section. Accepting a suggestion persists the change; rejecting it restores the original text. The system keeps a change log so every modification is transparent and reversible.
- **Expected result:** The résumé preview updates in real time while a changelog panel details what changed and why. The candidate can continue tweaking until satisfied, confident that each accepted change moves the ATS score upward.

### Loop and reassess
- **What to do:** After applying edits, trigger **Evaluate me against the JD** again to refresh the ATS dashboard before locking in downloads.
- **Behind the scenes:** The analysis re-runs on the candidate’s latest accepted content, recalculating section and overall scores so the user can see how their choices shifted readiness.
- **Expected result:** Each pass tightens alignment with the job description. Candidates decide when the scores and copy feel right, then proceed to export the final artefacts.

## 5. Download enhanced assets
- **What to do:** Once satisfied, select the download buttons for the updated résumé(s) and tailored cover letter.
- **Behind the scenes:** ResumeForge stores the generated PDFs alongside the session and tracks download events for analytics, overwriting older artefacts whenever new versions are produced so only current files remain.
- **Expected result:** The candidate receives ATS-optimised résumé PDFs (2025 design), a tailored cover letter, and a summary of the enhancements to reference during interviews. The platform retains only the current artefacts generated during the session so stored data stays tidy without automated expiry jobs.

## Troubleshooting quick reference
- **Job description missing:** Paste the full JD text. The system blocks the workflow until the textbox is populated so analysis never runs without the complete description.
- **Missing configuration error:** Ask an administrator to supply the required environment variables or runtime config file (see README).
- **Need to restart:** Refreshing the browser restores the latest saved state from DynamoDB so the candidate never loses accepted improvements.
