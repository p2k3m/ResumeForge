
const PROXY_NETWORK_ERROR_CODES = new Set([
    'ECONNREFUSED',
    'ECONNRESET',
    'ECONNABORTED',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'ETIMEDOUT',
    'EPIPE',
    'EAI_AGAIN',
    'ENOTFOUND',
]);

function extractErrorChain(error) {
    const queue = [];
    const seen = new Set();

    if (error) {
        queue.push(error);
    }

    const chain = [];

    while (queue.length > 0) {
        const current = queue.shift();
        if (!current || seen.has(current)) {
            continue;
        }
        seen.add(current);
        chain.push(current);

        if (Array.isArray(current.errors)) {
            for (const nested of current.errors) {
                queue.push(nested);
            }
        }

        if (current.cause) {
            queue.push(current.cause);
        }
    }

    return chain;
}

function isProxyNetworkError(error) {
    const chain = extractErrorChain(error);
    if (chain.length === 0) {
        return false;
    }

    for (const entry of chain) {
        const code = typeof entry?.code === 'string' ? entry.code.trim().toUpperCase() : '';
        if (code && PROXY_NETWORK_ERROR_CODES.has(code)) {
            return true;
        }
    }

    const combinedMessage = chain
        .map((entry) => (typeof entry?.message === 'string' ? entry.message : ''))
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

    if (!combinedMessage) {
        return false;
    }

    return /proxy|tunnel|mitm|blocked|policy|firewall/.test(combinedMessage);
}

const createNetworkError = () => {
    const cause = new Error('connect ENETUNREACH 0.0.0.0:443');
    cause.code = 'ENETUNREACH';
    const error = new TypeError('fetch failed');
    error.cause = cause;
    return error;
};

const error = createNetworkError();
const isProxy = isProxyNetworkError(error);
console.log('Is Proxy Network Error:', isProxy);

const chain = extractErrorChain(error);
console.log('Chain length:', chain.length);
chain.forEach((e, i) => {
    console.log(`Error ${i}:`, e.message, 'Code:', e.code);
});
