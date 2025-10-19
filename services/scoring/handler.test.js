import { jest } from '@jest/globals';

const mockSend = jest.fn();
const mockPutObjectCommand = jest.fn((input) => ({ input }));

jest.unstable_mockModule('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: mockSend })),
  PutObjectCommand: mockPutObjectCommand,
}));

const mockScoreResumeAgainstJob = jest.fn();
const mockScoreResumeHttpResponse = jest.fn();

jest.unstable_mockModule('../../lib/resume/scoring.js', () => ({
  scoreResumeAgainstJob: mockScoreResumeAgainstJob,
  scoreResumeHttpResponse: mockScoreResumeHttpResponse,
}));

let handler;

beforeAll(async () => {
  ({ handler } = await import('./handler.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2024-01-02T03:04:05.678Z'));
  process.env.S3_BUCKET = 'audit-bucket';
  mockSend.mockResolvedValue({});
});

afterEach(() => {
  jest.useRealTimers();
});

function buildScoringResult(overrides = {}) {
  return {
    success: true,
    jobId: 'job-123',
    sessionId: 'session-xyz',
    score: 82,
    missingSkills: [],
    alignmentTable: [],
    match: { before: {}, after: {}, delta: {} },
    ats: { before: {}, after: {}, delta: {} },
    selection: { before: {}, after: {}, delta: {}, factors: [] },
    selectionProbabilityBefore: 30,
    selectionProbabilityAfter: 55,
    selectionProbabilityDelta: 25,
    selectionProbabilityFactors: [],
    ...overrides,
  };
}

test('persists scoring audit under the session prefix provided by the pointer', async () => {
  mockScoreResumeAgainstJob.mockReturnValue({
    ok: true,
    result: buildScoringResult(),
  });
  mockScoreResumeHttpResponse.mockImplementation((outcome) => ({
    statusCode: 200,
    body: JSON.stringify(outcome.result),
  }));

  const payload = {
    jobId: 'job-123',
    resumeText: 'resume content',
    jobSkills: ['JavaScript'],
    sessionPointer: {
      prefix: 'cv/test-owner/session-abc/',
      changeLogKey: 'cv/test-owner/session-abc/logs/change-log.json',
    },
  };

  await handler({ body: JSON.stringify(payload) }, {});

  expect(mockPutObjectCommand).toHaveBeenCalledTimes(1);
  const putArgs = mockPutObjectCommand.mock.calls[0][0];
  expect(putArgs.Bucket).toBe('audit-bucket');
  expect(putArgs.Key).toBe(
    'cv/test-owner/session-abc/logs/scoring/2024-01-02T03-04-05-678Z.json'
  );
  const storedPayload = JSON.parse(putArgs.Body);
  expect(storedPayload.context).toEqual({
    sessionPrefix: 'cv/test-owner/session-abc/',
    changeLogKey: 'cv/test-owner/session-abc/logs/change-log.json',
  });

  const outcome = mockScoreResumeHttpResponse.mock.calls[0][0];
  expect(outcome.result.audit).toEqual({
    bucket: 'audit-bucket',
    key: 'cv/test-owner/session-abc/logs/scoring/2024-01-02T03-04-05-678Z.json',
    context: {
      sessionPrefix: 'cv/test-owner/session-abc/',
      changeLogKey: 'cv/test-owner/session-abc/logs/change-log.json',
    },
  });
});

test('derives session prefix from change log key when pointer prefix is absent', async () => {
  mockScoreResumeAgainstJob.mockReturnValue({
    ok: true,
    result: buildScoringResult({ jobId: 'job-987', sessionId: 'session-555' }),
  });
  mockScoreResumeHttpResponse.mockImplementation((outcome) => ({
    statusCode: 200,
    body: JSON.stringify(outcome.result),
  }));

  const payload = {
    jobId: 'job-987',
    resumeText: 'updated resume',
    jobSkills: ['TypeScript'],
    sessionChangeLogKey: 'cv/candidate/session-555/logs/change-log.json',
  };

  await handler({ body: JSON.stringify(payload) }, {});

  const putArgs = mockPutObjectCommand.mock.calls[0][0];
  expect(putArgs.Key).toBe(
    'cv/candidate/session-555/logs/scoring/2024-01-02T03-04-05-678Z.json'
  );
  const storedPayload = JSON.parse(putArgs.Body);
  expect(storedPayload.context).toEqual({
    sessionPrefix: 'cv/candidate/session-555/',
    changeLogKey: 'cv/candidate/session-555/logs/change-log.json',
  });
});

test('falls back to sanitized segments when only job and session identifiers are provided', async () => {
  mockScoreResumeAgainstJob.mockReturnValue({
    ok: true,
    result: buildScoringResult({ jobId: 'Product Manager', sessionId: 'Session 123' }),
  });
  mockScoreResumeHttpResponse.mockImplementation((outcome) => ({
    statusCode: 200,
    body: JSON.stringify(outcome.result),
  }));

  const payload = {
    jobId: 'Product Manager',
    resumeText: 'resume content',
    jobSkills: ['Leadership'],
    userId: 'Jane.Doe@example.com',
  };

  await handler({ body: JSON.stringify(payload) }, {});

  const putArgs = mockPutObjectCommand.mock.calls[0][0];
  expect(putArgs.Key).toBe(
    'cv/jane-doe-example-com/session-123/logs/scoring/2024-01-02T03-04-05-678Z.json'
  );
  const storedPayload = JSON.parse(putArgs.Body);
  expect(storedPayload.context).toEqual({
    sessionPrefix: 'cv/jane-doe-example-com/session-123/',
  });
});

