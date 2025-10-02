# Candidate journey guide

This guide walks a candidate through ResumeForge end to end so every action has a clearly defined outcome.

## 1. Upload a résumé
- **What to do:** Drag-and-drop or browse for a PDF, DOC, or DOCX résumé.
- **Behind the scenes:** The file is streamed straight to S3 and a DynamoDB session is created with hashed personal data. The portal immediately validates the file type and page structure.
- **Expected result:** If the document passes validation, the upload progress bar completes and the session status changes to **Résumé received**. When the file is rejected the UI surfaces a blocking alert (for example, “This looks like a presentation deck. Please upload a CV.”) and the candidate can try again without losing form progress.

## 2. Supply the job description
- **What to do:** Paste a public job-description URL or the raw description text.
- **Behind the scenes:** The backend attempts to fetch and clean the job description. If the host blocks the request (login walls, geo-fencing, expired links) the API flags `manualInputRequired`.
- **Expected result:** Successful fetches show a formatted preview so the candidate confirms the correct vacancy. When fetching fails, the interface automatically expands a text box with guidance to paste the full description manually.

## 3. Launch the ATS analysis
- **What to do:** Press **Evaluate me against the JD**.
- **Behind the scenes:** Lambda analyses the résumé and job description, runs ATS heuristics, and scores the submission across Layout & Searchability, Readability, Impact, Crispness, and Other Quality Metrics. It also compares the CV against the JD to detect gaps in designations, skills, experience, certifications, and highlights.
- **Expected result:** The dashboard populates with a total ATS score, probability of selection, and contextual insights (e.g., “Add Kubernetes to align with JD requirements”). Errors surface inline with instructions to retry or adjust inputs.

## 4. Iterate on improvements
- **What to do:** Use the **Improve** buttons on individual sections or click **Improve All** to accept every suggestion at once.
- **Behind the scenes:** AI-generated rewrites are staged per section. Accepting a suggestion persists the change; rejecting it restores the original text. The system keeps a change log so every modification is transparent.
- **Expected result:** The résumé preview updates in real time while a changelog panel details what changed and why. The candidate can continue tweaking until satisfied, confident that each accepted change moves the ATS score upward.

## 5. Download enhanced assets
- **What to do:** Once satisfied, select the download buttons for the updated résumé(s) and tailored cover letter.
- **Behind the scenes:** ResumeForge stores the generated PDFs alongside the session for 30 days and tracks download events for analytics.
- **Expected result:** The candidate receives ATS-optimised résumé PDFs (2025 design), a tailored cover letter, and a summary of the enhancements to reference during interviews. Sessions automatically expire after the retention window to satisfy GDPR requirements.

## Troubleshooting quick reference
- **Blocked job description:** Paste the content manually when prompted.
- **Missing configuration error:** Ask an administrator to supply the required environment variables or runtime config file (see README).
- **Need to restart:** Refreshing the browser restores the latest saved state from DynamoDB so the candidate never loses accepted improvements.
