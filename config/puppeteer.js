export const PUPPETEER_HEADLESS =
  process.env.PUPPETEER_HEADLESS === 'false' ? false : 'new';

export const PUPPETEER_ARGS = ['--no-sandbox', '--disable-setuid-sandbox'];
