import { jest } from '@jest/globals';

jest.unstable_mockModule('../../lib/uploads/s3StreamingStorage.js', () => ({
  default: jest.fn(),
}));

const { buildFallbackClientIndexHtml } = await import('../../server.js');

describe('buildFallbackClientIndexHtml', () => {
  test('hides degraded section when metadata is missing or not degraded', () => {
    const htmlWithoutMetadata = buildFallbackClientIndexHtml();
    expect(htmlWithoutMetadata).toContain('data-visible="false"');
    expect(htmlWithoutMetadata).toMatch(/<section[^>]*fallback__degraded[^>]*hidden/);

    const htmlWithInactiveMetadata = buildFallbackClientIndexHtml({
      degraded: false,
      apiGatewayUrl: 'https://example.execute-api.aws/prod',
    });
    expect(htmlWithInactiveMetadata).toContain('data-visible="false"');
    expect(htmlWithInactiveMetadata).toMatch(/<section[^>]*fallback__degraded[^>]*hidden/);
  });

  test('shows degraded section when metadata indicates degraded mode', () => {
    const html = buildFallbackClientIndexHtml({
      degraded: true,
      apiGatewayUrl: 'https://example.execute-api.aws/prod',
    });

    expect(html).toContain('data-visible="true"');
    expect(html).not.toMatch(/<section[^>]*fallback__degraded[^>]*hidden/);
  });

  test('uses configured API base as backup value when metadata is unavailable', () => {
    process.env.RESUMEFORGE_API_BASE_URL = 'https://example.execute-api.aws/prod';

    const html = buildFallbackClientIndexHtml();

    expect(html).toContain('value="https://example.execute-api.aws/prod"');
    expect(html).toContain(
      '<a href="https://example.execute-api.aws/prod" rel="noopener noreferrer">https://example.execute-api.aws/prod</a>'
    );

    delete process.env.RESUMEFORGE_API_BASE_URL;
  });
});
