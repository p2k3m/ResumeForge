# ResumeForge API Gateway & Lambda Contract

This document captures the HTTP contract and operational guardrails for the ResumeForge serverless API. It consolidates every public endpoint exposed through API Gateway into a single OpenAPI specification and highlights the Lambda implementation practices that must be preserved when adding or modifying functionality.

## Gateway & Lambda Guardrails

- **Keep binary media types enabled for file workflows.** API Gateway is configured to pass through PDF, octet-stream, and multipart uploads so Lambda can stream uploads and downloads without base64 inflation. Do not remove these types or the per-service defaults when adding routes.【F:template.yaml†L104-L123】【F:microservices/routing.js†L1-L41】
- **Enforce strict upload validation.** Multer caps resume uploads at 5 MB and filters the extension/MIME type before the request reaches business logic; additions must keep the size limit and file filter in place.【F:server.js†L2639-L2718】
- **Validate user input at the Lambda edge.** Handlers reject requests missing required identifiers or content (e.g., `jobId`, `resumeText`, `manualJobDescription`) before downstream calls. Mirror this pattern in new handlers to avoid partial processing.【F:lib/resume/jobEvaluation.js†L20-L70】【F:lib/resume/scoring.js†L13-L54】【F:server.js†L19792-L19833】【F:server.js†L18638-L18669】
- **Restrict CORS to trusted origins via environment configuration.** Allowed origins resolve from runtime config or the `CLOUDFRONT_ORIGINS`/`ALLOWED_ORIGINS` environment variables and are evaluated per request. New deployments must continue sourcing CORS from environment-scoped allow lists.【F:server.js†L2408-L2466】【F:server.js†L2560-L2597】
- **Return structured errors with actionable guidance.** `sendError` normalises messages, appends request IDs, and injects retry metadata while surfacing user-facing suggestions (e.g., template retry messages when a PDF render fails). Follow this schema for all non-2xx outcomes, especially when user input is required to proceed.【F:server.js†L1906-L2093】【F:server.js†L8504-L8551】【F:client/src/shared/serviceErrorContracts.js†L1-L73】
- **Use non-200 statuses when user action is needed.** Missing uploads, absent job descriptions, expired downloads, or forbidden downloads intentionally emit 4xx responses so clients prompt users to re-submit context.【F:server.js†L19820-L19833】【F:server.js†L20004-L20024】【F:server.js†L19412-L19462】
- **Propagate tracing metadata end-to-end.** Every request receives a generated `requestId` that flows through logs and error payloads; reuse this identifier (or AWS X-Ray segments when enabled) in downstream calls so investigations stay correlated.【F:server.js†L2523-L2548】【F:server.js†L2055-L2093】
- **Log and relay actionable recovery tips.** When template rendering retries occur the user-facing message nudges them toward a fallback template (“Could not generate PDF… retrying with …”). Preserve these hints so the UI can guide users without manual support tickets.【F:server.js†L244-L276】【F:server.js†L8504-L8551】

## OpenAPI 3.1 Specification

```yaml
openapi: 3.1.0
info:
  title: ResumeForge API
  version: '1.0.0'
  description: |
    Serverless endpoints backing resume ingestion, scoring, enhancement,
    and document generation.
servers:
  - url: https://{apiId}.execute-api.{region}.amazonaws.com/{stage}
    variables:
      apiId:
        default: example
        description: API Gateway identifier
      region:
        default: us-east-1
      stage:
        default: prod
paths:
  /healthz:
    get:
      summary: Health probe
      operationId: getHealthz
      responses:
        '200':
          description: Service is healthy
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/HealthResponse'
        default:
          $ref: '#/components/responses/ErrorResponse'
  /api/published-cloudfront:
    get:
      summary: Retrieve published CloudFront metadata
      operationId: getPublishedCloudfront
      responses:
        '200':
          description: Published CloudFront deployment metadata
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PublishedCloudfrontResponse'
        '404':
          description: No metadata published yet
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        default:
          $ref: '#/components/responses/ErrorResponse'
  /api/process-cv:
    post:
      summary: Upload a resume and kick off end-to-end processing
      operationId: postProcessCv
      requestBody:
        required: true
        content:
          multipart/form-data:
            schema:
              $ref: '#/components/schemas/ProcessCvRequest'
      responses:
        '200':
          description: Upload accepted, resume analysed, and assets generated
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/EnhancedDocumentsResponse'
        '400':
          description: Invalid upload or missing required fields
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        default:
          $ref: '#/components/responses/ErrorResponse'
  /api/jd/evaluate:
    post:
      summary: Evaluate job description fit against a resume
      operationId: postEvaluateJobDescription
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JobEvaluationRequest'
      responses:
        '200':
          description: Job fit metrics
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/JobEvaluationResponse'
        '400':
          description: Missing resume, job ID, or skills
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        default:
          $ref: '#/components/responses/ErrorResponse'
  /api/score-match:
    post:
      summary: Score a resume against job skills
      operationId: postScoreMatch
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ScoreMatchRequest'
      responses:
        '200':
          description: Score calculation completed
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ScoreMatchResponse'
        '400':
          description: Missing resume, job ID, or skills
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        default:
          $ref: '#/components/responses/ErrorResponse'
  /api/rescore-improvement:
    post:
      summary: Recalculate scores after applying an improvement
      operationId: postRescoreImprovement
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/RescoreImprovementRequest'
      responses:
        '200':
          description: Rescored metrics
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/RescoreImprovementResponse'
        '400':
          description: Missing resume text
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        default:
          $ref: '#/components/responses/ErrorResponse'
  /api/improve-summary:
    post:
      summary: Targeted summary enhancement
      operationId: postImproveSummary
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/TargetedImprovementRequest'
      responses:
        '200':
          description: Summary improvement applied
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/TargetedImprovementResponse'
        default:
          $ref: '#/components/responses/ErrorResponse'
  /api/add-missing-skills:
    post:
      summary: Inject missing skills into the resume
      operationId: postAddMissingSkills
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/TargetedImprovementRequest'
      responses:
        '200':
          description: Skills improvement applied
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/TargetedImprovementResponse'
        default:
          $ref: '#/components/responses/ErrorResponse'
  /api/improve-skills:
    post:
      summary: Inject missing skills into the resume (alias)
      operationId: postImproveSkills
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/TargetedImprovementRequest'
      responses:
        '200':
          description: Skills improvement applied
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/TargetedImprovementResponse'
        default:
          $ref: '#/components/responses/ErrorResponse'
  /api/change-designation:
    post:
      summary: Update headline designation for the target role
      operationId: postChangeDesignation
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/TargetedImprovementRequest'
      responses:
        '200':
          description: Designation adjusted
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/TargetedImprovementResponse'
        default:
          $ref: '#/components/responses/ErrorResponse'
  /api/improve-designation:
    post:
      summary: Update headline designation for the target role (alias)
      operationId: postImproveDesignation
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/TargetedImprovementRequest'
      responses:
        '200':
          description: Designation adjusted
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/TargetedImprovementResponse'
        default:
          $ref: '#/components/responses/ErrorResponse'
  /api/align-experience:
    post:
      summary: Realign experience section for the target job
      operationId: postAlignExperience
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/TargetedImprovementRequest'
      responses:
        '200':
          description: Experience enhancement applied
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/TargetedImprovementResponse'
        default:
          $ref: '#/components/responses/ErrorResponse'
  /api/improve-experience:
    post:
      summary: Realign experience section for the target job (alias)
      operationId: postImproveExperience
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/TargetedImprovementRequest'
      responses:
        '200':
          description: Experience enhancement applied
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/TargetedImprovementResponse'
        default:
          $ref: '#/components/responses/ErrorResponse'
  /api/improve-certifications:
    post:
      summary: Enhance certifications section
      operationId: postImproveCertifications
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/TargetedImprovementRequest'
      responses:
        '200':
          description: Certifications improvement applied
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/TargetedImprovementResponse'
        default:
          $ref: '#/components/responses/ErrorResponse'
  /api/improve-projects:
    post:
      summary: Enhance projects section
      operationId: postImproveProjects
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/TargetedImprovementRequest'
      responses:
        '200':
          description: Projects improvement applied
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/TargetedImprovementResponse'
        default:
          $ref: '#/components/responses/ErrorResponse'
  /api/improve-highlights:
    post:
      summary: Improve highlights section
      operationId: postImproveHighlights
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/TargetedImprovementRequest'
      responses:
        '200':
          description: Highlights improvement applied
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/TargetedImprovementResponse'
        default:
          $ref: '#/components/responses/ErrorResponse'
  /api/improve-all:
    post:
      summary: Apply every targeted improvement in a single request
      operationId: postImproveAll
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/TargetedImprovementRequest'
      responses:
        '200':
          description: Batch improvements generated
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ImprovementBatchResponse'
        default:
          $ref: '#/components/responses/ErrorResponse'
  /api/enhance-all:
    post:
      summary: Apply holistic resume enhancement
      operationId: postEnhanceAll
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/TargetedImprovementRequest'
      responses:
        '200':
          description: Holistic enhancement applied
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/TargetedImprovementResponse'
        default:
          $ref: '#/components/responses/ErrorResponse'
  /api/improve-ats:
    post:
      summary: Apply holistic resume enhancement (alias)
      operationId: postImproveAts
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/TargetedImprovementRequest'
      responses:
        '200':
          description: Combined resume improvement applied
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/TargetedImprovementResponse'
        default:
          $ref: '#/components/responses/ErrorResponse'
  /api/generate-enhanced-docs:
    post:
      summary: Generate resume & cover letter PDFs from prepared content
      operationId: postGenerateEnhancedDocs
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenerateEnhancedDocsRequest'
      responses:
        '200':
          description: PDFs generated and links returned
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/EnhancedDocumentsResponse'
        default:
          $ref: '#/components/responses/ErrorResponse'
  /api/render-cover-letter:
    post:
      summary: Render a single cover letter PDF
      operationId: postRenderCoverLetter
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/RenderCoverLetterRequest'
      responses:
        '200':
          description: Cover letter PDF stream
          content:
            application/pdf:
              schema:
                type: string
                format: binary
        default:
          $ref: '#/components/responses/ErrorResponse'
  /api/change-log:
    post:
      summary: Persist resume change log activity
      operationId: postChangeLog
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ChangeLogRequest'
      responses:
        '200':
          description: Change log updated
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ChangeLogResponse'
        default:
          $ref: '#/components/responses/ErrorResponse'
  /api/refresh-download-link:
    post:
      summary: Regenerate a signed download URL for generated assets
      operationId: postRefreshDownloadLink
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/RefreshDownloadLinkRequest'
      responses:
        '200':
          description: New signed URL issued
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/RefreshDownloadLinkResponse'
        default:
          $ref: '#/components/responses/ErrorResponse'
components:
  responses:
    ErrorResponse:
      description: Error payload with actionable details
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
  schemas:
    HealthResponse:
      type: object
      properties:
        status:
          type: string
          example: ok
      required:
        - status
    PublishedCloudfrontResponse:
      type: object
      properties:
        success:
          type: boolean
          const: true
        cloudfront:
          type: object
          properties:
            url:
              type: string
              format: uri
            stackName:
              type: string
              nullable: true
            distributionId:
              type: string
              nullable: true
            updatedAt:
              type: string
              format: date-time
              nullable: true
          required:
            - url
        messages:
          type: array
          items:
            type: string
      required:
        - success
        - cloudfront
    ProcessCvRequest:
      type: object
      properties:
        resume:
          type: string
          format: binary
          description: PDF, DOC, or DOCX resume up to 5 MB
        manualJobDescription:
          type: string
          description: Raw job description text used for initial scoring
        jobId:
          type: string
        template:
          type: string
        templateId:
          type: string
        template1:
          type: string
        template2:
          type: string
        coverTemplate:
          type: string
        coverTemplate1:
          type: string
        coverTemplate2:
          type: string
        templateParams:
          oneOf:
            - type: object
            - type: string
        jobSkills:
          type: array
          items:
            type: string
        manualCertificates:
          type: array
          items:
            type: string
      required:
        - resume
        - manualJobDescription
    JobEvaluationRequest:
      type: object
      properties:
        jobId:
          type: string
        resumeText:
          type: string
        jobDescriptionText:
          type: string
        jobSkills:
          type: array
          items:
            type: string
        prioritySkills:
          type: array
          items:
            type: string
        requiredSkills:
          type: array
          items:
            type: string
        jobKeywords:
          type: array
          items:
            type: string
      required:
        - jobId
        - resumeText
        - jobSkills
    JobEvaluationResponse:
      type: object
      properties:
        success:
          type: boolean
          const: true
        jobId:
          type: string
        score:
          type: number
        missingSkills:
          type: array
          items:
            type: string
        matchedSkills:
          type: array
          items:
            type: string
        breakdown:
          type: array
          items:
            $ref: '#/components/schemas/ScoreBreakdownEntry'
      required:
        - success
        - jobId
        - score
        - missingSkills
        - matchedSkills
        - breakdown
    ScoreMatchRequest:
      type: object
      properties:
        jobId:
          type: string
        resumeText:
          type: string
        jobSkills:
          type: array
          items:
            type: string
      required:
        - jobId
        - resumeText
        - jobSkills
    ScoreMatchResponse:
      type: object
      properties:
        success:
          type: boolean
          const: true
        jobId:
          type: string
        score:
          type: number
        missingSkills:
          type: array
          items:
            type: string
        alignmentTable:
          type: array
          items:
            $ref: '#/components/schemas/SkillAlignmentEntry'
      required:
        - success
        - jobId
        - score
        - missingSkills
        - alignmentTable
    RescoreImprovementRequest:
      type: object
      properties:
        jobId:
          type: string
        resumeText:
          type: string
        jobDescriptionText:
          type: string
        jobSkills:
          type: array
          items:
            type: string
        previousMissingSkills:
          type: array
          items:
            type: string
        baselineScore:
          oneOf:
            - type: number
            - type: string
      required:
        - resumeText
    RescoreImprovementResponse:
      type: object
      properties:
        success:
          type: boolean
          const: true
        enhancedScore:
          type: number
        table:
          type: array
          items:
            $ref: '#/components/schemas/SkillAlignmentEntry'
        missingSkills:
          type: array
          items:
            type: string
        resumeSkills:
          type: array
          items:
            type: string
        atsSubScores:
          type: array
          items:
            $ref: '#/components/schemas/ScoreBreakdownEntry'
        scoreBreakdown:
          type: array
          items:
            $ref: '#/components/schemas/ScoreBreakdownEntry'
        coveredSkills:
          type: array
          items:
            type: string
        scoreDelta:
          type: number
          nullable: true
      required:
        - success
        - enhancedScore
        - table
        - missingSkills
        - resumeSkills
        - atsSubScores
        - scoreBreakdown
        - coveredSkills
    TargetedImprovementRequest:
      type: object
      description: Requires prior /api/process-cv run to populate Dynamo context
      properties:
        jobId:
          type: string
        jobTitle:
          type: string
        currentTitle:
          type: string
        resumeText:
          type: string
        jobDescription:
          type: string
        jobDescriptionText:
          type: string
        jobSkills:
          type: array
          items:
            type: string
        manualCertificates:
          type: array
          items:
            type: string
        credlyStatus:
          type: object
          additionalProperties: true
        templateContext:
          type: object
          additionalProperties: true
        sessionLogs:
          type: array
          items:
            $ref: '#/components/schemas/ActivityLogEntry'
        evaluationLogs:
          type: array
          items:
            $ref: '#/components/schemas/ActivityLogEntry'
        enhancementLogs:
          type: array
          items:
            $ref: '#/components/schemas/ActivityLogEntry'
        downloadLogs:
          type: array
          items:
            $ref: '#/components/schemas/ActivityLogEntry'
      required:
        - jobId
    TargetedImprovementResponse:
      type: object
      properties:
        success:
          type: boolean
          const: true
        type:
          type: string
        title:
          type: string
        beforeExcerpt:
          type: string
        afterExcerpt:
          type: string
        explanation:
          type: string
        confidence:
          type: number
          nullable: true
        updatedResume:
          type: string
        missingSkills:
          type: array
          items:
            type: string
        improvementSummary:
          type: object
          additionalProperties: true
        rescore:
          type: object
          additionalProperties: true
        selectionProbabilityBefore:
          type: number
        selectionProbabilityAfter:
          type: number
        selectionProbabilityDelta:
          type: number
        urlExpiresInSeconds:
          type: integer
        urls:
          type: array
          items:
            $ref: '#/components/schemas/DownloadUrl'
        templateContext:
          type: object
          additionalProperties: true
        llmTrace:
          type: object
          additionalProperties: true
      required:
        - success
        - type
        - title
        - beforeExcerpt
        - afterExcerpt
        - explanation
        - updatedResume
        - missingSkills
        - rescore
        - selectionProbabilityBefore
        - selectionProbabilityAfter
        - selectionProbabilityDelta
        - urlExpiresInSeconds
        - urls
    ImprovementBatchResult:
      type: object
      properties:
        success:
          type: boolean
          const: true
        type:
          type: string
        title:
          type: string
        beforeExcerpt:
          type: string
        afterExcerpt:
          type: string
        explanation:
          type: string
        confidence:
          type: number
          nullable: true
        updatedResume:
          type: string
        improvementSummary:
          type: object
          additionalProperties: true
        rescore:
          type: object
          additionalProperties: true
        originalTitle:
          type: string
        modifiedTitle:
          type: string
        llmTrace:
          type: object
          nullable: true
          additionalProperties: true
      required:
        - success
        - type
        - title
        - beforeExcerpt
        - afterExcerpt
        - explanation
        - updatedResume
        - rescore
        - originalTitle
        - modifiedTitle
    ImprovementBatchResponse:
      type: object
      properties:
        success:
          type: boolean
          const: true
        types:
          type: array
          items:
            type: string
        results:
          type: array
          items:
            $ref: '#/components/schemas/ImprovementBatchResult'
        updatedResume:
          type: string
        urls:
          type: array
          items:
            $ref: '#/components/schemas/DownloadUrl'
        urlExpiresAt:
          type: string
          format: date-time
          nullable: true
        generatedAt:
          type: string
          format: date-time
      required:
        - success
        - types
        - results
        - updatedResume
        - urls
        - generatedAt
    GenerateEnhancedDocsRequest:
      type: object
      properties:
        jobId:
          type: string
        resumeText:
          type: string
        originalResumeText:
          type: string
        jobDescriptionText:
          type: string
        jobSkills:
          type: array
          items:
            type: string
        manualCertificates:
          type: array
          items:
            type: string
        templateContext:
          type: object
          additionalProperties: true
        templateParams:
          oneOf:
            - type: object
            - type: string
        baseline:
          type: object
          additionalProperties: true
      required:
        - jobId
        - resumeText
        - jobDescriptionText
    EnhancedDocumentsResponse:
      type: object
      properties:
        success:
          type: boolean
          const: true
        requestId:
          type: string
        jobId:
          type: string
        urlExpiresInSeconds:
          type: integer
        urls:
          type: array
          items:
            $ref: '#/components/schemas/DownloadUrl'
        applicantName:
          type: string
        originalScore:
          type: number
        enhancedScore:
          type: number
        atsScoreBefore:
          type: number
        atsScoreAfter:
          type: number
        table:
          type: array
          items:
            $ref: '#/components/schemas/SkillAlignmentEntry'
        addedSkills:
          type: array
          items:
            type: string
        missingSkills:
          type: array
          items:
            type: string
        originalTitle:
          type: string
        modifiedTitle:
          type: string
        scoreBreakdown:
          type: array
          items:
            $ref: '#/components/schemas/ScoreBreakdownEntry'
        atsSubScores:
          type: array
          items:
            $ref: '#/components/schemas/ScoreBreakdownEntry'
        resumeText:
          type: string
        originalResumeText:
          type: string
        jobDescriptionText:
          type: string
        jobSkills:
          type: array
          items:
            type: string
        resumeSkills:
          type: array
          items:
            type: string
        certificateInsights:
          type: object
          additionalProperties: true
        manualCertificates:
          type: array
          items:
            type: string
        selectionProbability:
          type: number
          nullable: true
        selectionProbabilityBefore:
          type: number
          nullable: true
        selectionProbabilityAfter:
          type: number
          nullable: true
        selectionInsights:
          type: object
          additionalProperties: true
        changeLog:
          type: array
          items:
            $ref: '#/components/schemas/ChangeLogEntry'
        changeLogSummary:
          type: object
          additionalProperties: true
        sessionLogs:
          type: array
          items:
            $ref: '#/components/schemas/ActivityLogEntry'
        evaluationLogs:
          type: array
          items:
            $ref: '#/components/schemas/ActivityLogEntry'
        enhancementLogs:
          type: array
          items:
            $ref: '#/components/schemas/ActivityLogEntry'
        downloadLogs:
          type: array
          items:
            $ref: '#/components/schemas/ActivityLogEntry'
        coverLetterChangeLog:
          type: object
          properties:
            entries:
              type: array
              items:
                $ref: '#/components/schemas/ChangeLogEntry'
            dismissedEntries:
              type: array
              items:
                $ref: '#/components/schemas/ChangeLogEntry'
        templateContext:
          type: object
          additionalProperties: true
        coverLetterStatus:
          type: object
          additionalProperties: true
        messages:
          type: array
          items:
            type: string
        templateCreationMessages:
          type: array
          items:
            type: string
        documentPopulationMessages:
          type: array
          items:
            type: string
      required:
        - success
        - requestId
        - jobId
        - urlExpiresInSeconds
        - urls
        - table
        - addedSkills
        - missingSkills
        - scoreBreakdown
        - atsSubScores
        - resumeText
        - jobDescriptionText
        - jobSkills
        - resumeSkills
        - changeLog
        - changeLogSummary
    RenderCoverLetterRequest:
      type: object
      properties:
        text:
          type: string
        templateId:
          type: string
        template:
          type: string
        coverTemplate:
          type: string
        coverTemplates:
          type: array
          items:
            type: string
        applicantName:
          type: string
        jobTitle:
          type: string
        jobDescription:
          type: string
        jobSkills:
          type: array
          items:
            type: string
        contactDetails:
          type: object
          additionalProperties: true
      required:
        - text
    ChangeLogRequest:
      type: object
      properties:
        jobId:
          type: string
        changeLog:
          type: array
          items:
            $ref: '#/components/schemas/ChangeLogEntry'
        dismissedChangeLogEntries:
          type: array
          items:
            $ref: '#/components/schemas/ChangeLogEntry'
        coverLetters:
          type: object
          properties:
            entries:
              type: array
              items:
                $ref: '#/components/schemas/ChangeLogEntry'
            dismissedEntries:
              type: array
              items:
                $ref: '#/components/schemas/ChangeLogEntry'
        sessionLogs:
          type: array
          items:
            $ref: '#/components/schemas/ActivityLogEntry'
        evaluationLogs:
          type: array
          items:
            $ref: '#/components/schemas/ActivityLogEntry'
        enhancementLogs:
          type: array
          items:
            $ref: '#/components/schemas/ActivityLogEntry'
        downloadLogs:
          type: array
          items:
            $ref: '#/components/schemas/ActivityLogEntry'
      required:
        - jobId
    ChangeLogResponse:
      type: object
      properties:
        success:
          type: boolean
          const: true
        changeLog:
          type: array
          items:
            $ref: '#/components/schemas/ChangeLogEntry'
        changeLogSummary:
          type: object
          additionalProperties: true
        sessionLogs:
          type: array
          items:
            $ref: '#/components/schemas/ActivityLogEntry'
        evaluationLogs:
          type: array
          items:
            $ref: '#/components/schemas/ActivityLogEntry'
        enhancementLogs:
          type: array
          items:
            $ref: '#/components/schemas/ActivityLogEntry'
        downloadLogs:
          type: array
          items:
            $ref: '#/components/schemas/ActivityLogEntry'
        coverLetters:
          type: object
          properties:
            entries:
              type: array
              items:
                $ref: '#/components/schemas/ChangeLogEntry'
            dismissedEntries:
              type: array
              items:
                $ref: '#/components/schemas/ChangeLogEntry'
      required:
        - success
        - changeLog
        - changeLogSummary
    RefreshDownloadLinkRequest:
      type: object
      properties:
        jobId:
          type: string
        storageKey:
          type: string
      required:
        - jobId
        - storageKey
    RefreshDownloadLinkResponse:
      type: object
      properties:
        success:
          type: boolean
          const: true
        url:
          type: string
          format: uri
        expiresAt:
          type: string
          format: date-time
        storageKey:
          type: string
      required:
        - success
        - url
        - expiresAt
        - storageKey
    ErrorResponse:
      type: object
      properties:
        success:
          type: boolean
          const: false
        error:
          type: object
          properties:
            code:
              type: string
            message:
              type: string
            requestId:
              type: string
            jobId:
              type: string
            details:
              type: object
              additionalProperties: true
          required:
            - code
            - message
        messages:
          type: array
          items:
            type: string
      required:
        - success
        - error
    ScoreBreakdownEntry:
      type: object
      additionalProperties: true
    SkillAlignmentEntry:
      type: object
      additionalProperties: true
    ChangeLogEntry:
      type: object
      additionalProperties: true
    ActivityLogEntry:
      type: object
      additionalProperties: true
    DownloadUrl:
      type: object
      properties:
        url:
          type: string
          format: uri
        type:
          type: string
        templateType:
          type: string
        fileUrl:
          type: string
          format: uri
        typeUrl:
          type: string
          format: uri
      required:
        - url
```
