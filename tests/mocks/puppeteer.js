let puppeteer = {
  launch: async () => {
    throw new Error('puppeteer-core is not available in this environment');
  },
  connect: async () => {
    throw new Error('puppeteer-core is not available in this environment');
  },
  executablePath: async () => {
    throw new Error('puppeteer-core is not available in this environment');
  },
};

try {
  const core = await import('puppeteer-core');
  const resolved = core.default ?? core;
  puppeteer = {
    ...resolved,
    launch: (...args) => resolved.launch(...args),
    connect: (...args) => resolved.connect?.(...args),
    executablePath: (...args) => resolved.executablePath?.(...args),
  };
} catch (err) {
  if (err?.code !== 'ERR_MODULE_NOT_FOUND' && err?.code !== 'MODULE_NOT_FOUND') {
    throw err;
  }
}

export const launch = (...args) => puppeteer.launch(...args);
export const connect = (...args) => puppeteer.connect?.(...args);
export const executablePath = (...args) => puppeteer.executablePath?.(...args);
export default puppeteer;
