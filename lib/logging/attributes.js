function toStringValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  return '';
}

function firstNonEmpty(...candidates) {
  for (const candidate of candidates) {
    const str = toStringValue(candidate);
    if (str) {
      return str;
    }
  }
  return '';
}

function resolveDefaultBuildId() {
  return (
    firstNonEmpty(
      process.env.RESUMEFORGE_BUILD_ID,
      process.env.BUILD_ID,
      process.env.DEPLOYMENT_BUILD_ID,
      process.env.GITHUB_RUN_ID,
      process.env.GITHUB_SHA,
      process.env.AWS_LAMBDA_FUNCTION_VERSION
    ) || 'local-dev'
  );
}

const DEFAULT_BUILD_ID = resolveDefaultBuildId();

export function resolveBuildId(overrides = {}) {
  return (
    firstNonEmpty(
      overrides.build,
      overrides.buildId,
      overrides.metadata?.build,
      overrides.metadata?.buildId
    ) || DEFAULT_BUILD_ID
  );
}

function resolveTemplate(context = {}) {
  const arrayCandidate = (value) => (Array.isArray(value) && value.length ? value[0] : '');
  return (
    firstNonEmpty(
      context.template,
      context.templateId,
      context.resumeTemplate,
      context.coverTemplate,
      context.preferredTemplate,
      context.canonicalSelectedTemplate,
      context.selectedTemplate,
      context.template1,
      context.template2,
      arrayCandidate(context.templates),
      arrayCandidate(context.availableCvTemplates),
      context.coverTemplate1,
      context.coverTemplate2
    ) || 'unknown'
  );
}

function resolveSession(context = {}) {
  return (
    firstNonEmpty(
      context.session,
      context.sessionId,
      context.jobId,
      context.requestId,
      context.detail?.sessionId,
      context.detail?.jobId,
      context.metadata?.session,
      context.metadata?.sessionId
    ) || 'unknown'
  );
}

function resolveArtifactType(context = {}) {
  const urls = Array.isArray(context.urls) ? context.urls : [];
  const firstUrlType = urls.length > 0 ? toStringValue(urls[0]?.type) : '';
  const inferredFromEvent = () => {
    const event = toStringValue(context.event);
    if (!event) {
      return '';
    }
    if (event.includes('cover_letter')) {
      return 'cover_letter';
    }
    if (event.includes('generation_artifacts')) {
      return 'generated_artifact';
    }
    if (event.includes('initial_upload')) {
      return 'upload_artifact';
    }
    return '';
  };
  return (
    firstNonEmpty(
      context.artifactType,
      context.metadata?.artifactType,
      context.type,
      context.cleanupEvent,
      firstUrlType,
      inferredFromEvent()
    ) || 'none'
  );
}

export function withRequiredLogAttributes(payload = {}, hints = {}, options = {}) {
  const { embedMetadata = true } = options;
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  const baseMetadata = {
    ...(typeof payload.metadata === 'object' && payload.metadata ? payload.metadata : {}),
    ...(typeof hints.metadata === 'object' && hints.metadata ? hints.metadata : {}),
  };
  const combined = {
    ...baseMetadata,
    ...payload,
    ...hints,
  };

  const template = resolveTemplate(combined);
  const session = resolveSession(combined);
  const build = resolveBuildId({
    ...combined,
    metadata: baseMetadata,
  });
  const artifactType = resolveArtifactType(combined);

  const next = { ...payload };

  if (!toStringValue(next.template)) {
    next.template = template;
  }
  if (!toStringValue(next.session)) {
    next.session = session;
  }
  if (!toStringValue(next.build)) {
    next.build = build;
  }
  if (!toStringValue(next.artifactType)) {
    next.artifactType = artifactType;
  }

  const nextMetadata = { ...baseMetadata };
  if (!toStringValue(nextMetadata.template)) {
    nextMetadata.template = template;
  }
  if (!toStringValue(nextMetadata.session)) {
    nextMetadata.session = session;
  }
  if (!toStringValue(nextMetadata.build)) {
    nextMetadata.build = build;
  }
  if (!toStringValue(nextMetadata.artifactType)) {
    nextMetadata.artifactType = artifactType;
  }
  if (!embedMetadata) {
    return nextMetadata;
  }

  if (Object.keys(nextMetadata).length > 0) {
    next.metadata = nextMetadata;
  }

  return next;
}

export function describeRequiredLogAttributes(context = {}) {
  const combined = withRequiredLogAttributes({}, context);
  return {
    template: combined.template,
    session: combined.session,
    build: combined.build,
    artifactType: combined.artifactType,
  };
}

export function withRequiredLogMetadata(metadata = {}, hints = {}) {
  const normalized = withRequiredLogAttributes(metadata, hints, { embedMetadata: false });
  if (!normalized || typeof normalized !== 'object') {
    return {};
  }
  return normalized;
}
