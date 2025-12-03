
const STATIC_PROXY_ALIAS_METADATA_SEPARATORS = [',,', ';;'];
const INDEX_ASSET_ALIAS_PATH_PATTERN = /^\/assets\/index-latest\.(css|js)$/i;
const HASHED_INDEX_ASSET_PATH_PATTERN = /^\/assets\/index-(?!latest(?:\.|$))[\w.-]+\.(?:css|js)(?:\.map)?$/i;

function normalizeManifestHashedAssetPath(path) {
    // Mock implementation or simplified version if needed, 
    // but for '../secrets.txt' it should probably return null/empty unless it matches specific patterns.
    // Assuming it returns null for secrets.txt
    return null;
}

function normalizeStaticProxyAssetPath(value) {
    if (typeof value !== 'string') {
        return '';
    }

    let candidate = value.trim();
    if (!candidate) {
        return '';
    }

    candidate = candidate.replace(/[#?].*$/, '');

    for (const separator of STATIC_PROXY_ALIAS_METADATA_SEPARATORS) {
        const metadataIndex = candidate.indexOf(separator);
        if (metadataIndex !== -1) {
            candidate = candidate.slice(0, metadataIndex).trim();
        }
    }

    // Mocking normalizeManifestHashedAssetPath behavior
    const normalizedHashed = normalizeManifestHashedAssetPath(candidate);
    if (normalizedHashed) {
        return normalizedHashed;
    }

    while (/^(?:\.\.\/|\.\/)/.test(candidate)) {
        candidate = candidate.replace(/^(?:\.\.\/|\.\/)/, '');
    }

    candidate = candidate.replace(/^\/+/, '').replace(/\\/g, '/');
    candidate = candidate.replace(/[,;]+$/, '');
    if (!candidate) {
        return '';
    }

    const withLeadingSlash = candidate.startsWith('/') ? candidate : `/${candidate}`;

    if (INDEX_ASSET_ALIAS_PATH_PATTERN.test(withLeadingSlash)) {
        return withLeadingSlash;
    }

    if (HASHED_INDEX_ASSET_PATH_PATTERN.test(withLeadingSlash)) {
        return withLeadingSlash;
    }

    return '';
}

console.log(`'../secrets.txt' -> '${normalizeStaticProxyAssetPath('../secrets.txt')}'`);
