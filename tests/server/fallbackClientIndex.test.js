import { buildFallbackClientIndexHtml } from '../../server.js';

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
});
