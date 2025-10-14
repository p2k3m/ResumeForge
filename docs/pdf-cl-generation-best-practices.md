# PDF and Cover Letter Generation Best Practices

## Environment and Deployment
- Run the document generator in an isolated AWS Lambda function with required font and template assets packaged as layers.
- Store all templates in S3 or as Lambda layers; do not ship dynamic templates within source bundles.
- Support quarterly template rotation via `npm run refresh:templates`, retiring outdated designs at the end of each Q4.

## Runtime Handling
- Create invocation-specific temporary files under `/tmp` using safe, unique names to avoid collisions.
- Log and inspect every failure, including the S3 object trace, to simplify debugging across distributed runs.
- If a requested template is unavailable, retry generation with the default `modern` template and surface all errors in logs and user interfaces.
- Ensure cover letter generation reuses the core CV generation logic, with differences expressed through parameters.

## Asset Management and Output Quality
- Embed all fonts and graphics in generated PDFs to guarantee cross-platform consistency.
- Validate produced PDFs for accessibility requirements such as searchable text, tagged structure, and single-column layouts compatible with ATS systems.

## Testing and Quality Assurance
- Unit test every new or modified template with a known-good input and compare output diffs to catch regressions.
- Verify that template refreshes keep assets synchronized and that fallback behaviors operate correctly when templates are missing.
