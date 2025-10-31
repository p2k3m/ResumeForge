const normalizeName = (name) => {
  if (typeof name !== 'string') {
    return '';
  }
  return name.startsWith('/') ? name.slice(1) : name;
};

const toBuffer = (value) => {
  if (!value) {
    return Buffer.alloc(0);
  }
  if (Buffer.isBuffer(value)) {
    return Buffer.from(value);
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  return Buffer.from(String(value));
};

const createCfb = (entries = []) => {
  const store = new Map(
    entries.map(([name, content]) => [normalizeName(name), toBuffer(content)]),
  );
  return {
    get FullPaths() {
      return Array.from(store.keys());
    },
    get Files() {
      return Array.from(store.values());
    },
    get _entries() {
      return store;
    },
  };
};

export function read(data) {
  if (!data) {
    return createCfb();
  }
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (buffer.length === 0) {
    return createCfb();
  }
  try {
    const decoded = JSON.parse(buffer.toString('utf8'));
    const entries = Array.isArray(decoded?.entries) ? decoded.entries : [];
    return createCfb(
      entries.map(([name, base64]) => [name, Buffer.from(base64, 'base64')]),
    );
  } catch {
    return createCfb();
  }
}

export function write(cfb) {
  const entries = Array.from(cfb?._entries?.entries?.() || []).map(([name, content]) => [
    name,
    toBuffer(content).toString('base64'),
  ]);
  const payload = JSON.stringify({ entries });
  return Buffer.from(payload, 'utf8');
}

export const utils = {
  cfb_new() {
    return createCfb();
  },
  cfb_add(cfb, name, content) {
    if (!cfb || typeof cfb !== 'object') {
      throw new Error('Invalid CFB container');
    }
    const normalized = normalizeName(name);
    cfb._entries.set(normalized, toBuffer(content));
    return cfb;
  },
  cfb_del(cfb, name) {
    if (!cfb || typeof cfb !== 'object') {
      throw new Error('Invalid CFB container');
    }
    const normalized = normalizeName(name);
    const existed = cfb._entries.delete(normalized);
    if (!existed) {
      throw new Error(`Entry not found: ${name}`);
    }
    return cfb;
  },
};

export default {
  read,
  write,
  utils,
};
