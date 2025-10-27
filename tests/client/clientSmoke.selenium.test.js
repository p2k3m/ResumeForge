import { jest } from '@jest/globals';
import http from 'http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Builder, By, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import { setupTestServer } from '../utils/testServer.js';

const chromeBinaryPath = typeof process.env.CHROME_BIN === 'string' ? process.env.CHROME_BIN.trim() : '';
const chromeDriverPath = typeof process.env.CHROMEDRIVER_PATH === 'string' ? process.env.CHROMEDRIVER_PATH.trim() : '';
const hasChromeBinary = chromeBinaryPath.length > 0;
const describeIfSupported = hasChromeBinary ? describe : describe.skip;

const execFileAsync = promisify(execFile);
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const clientDistDir = path.join(projectRoot, 'client', 'dist');

let clientBuildPromise = null;

async function ensureClientBuild() {
  if (!clientBuildPromise) {
    clientBuildPromise = execFileAsync(npmCommand, ['run', 'build:client'], {
      cwd: projectRoot,
      env: { ...process.env },
    }).catch((error) => {
      clientBuildPromise = null;
      throw error;
    });
  }

  await clientBuildPromise;
}

async function removeClientDist() {
  await fs.rm(clientDistDir, { recursive: true, force: true });
}

async function startTestServer() {
  const { app } = await setupTestServer();
  const server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(0, resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;
  return { server, baseUrl };
}

async function stopTestServer(server) {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
}

jest.setTimeout(60000);

describeIfSupported('client application smoke test (selenium)', () => {
  let driver;
  let driverUnavailableReason = null;

  beforeAll(async () => {
    try {
      if (chromeDriverPath) {
        chrome.setDefaultService(new chrome.ServiceBuilder(chromeDriverPath).build());
      }

      const options = new chrome.Options()
        .setChromeBinaryPath(chromeBinaryPath)
        .addArguments('--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,720');

      driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
    } catch (error) {
      driverUnavailableReason = error instanceof Error ? error.message : String(error);
      if (driver) {
        await driver.quit();
      }
      driver = null;
    }
  });

  afterAll(async () => {
    if (driver) {
      await driver.quit();
    }
  });

  test('renders fallback UI with guidance when compiled assets are missing', async () => {
    if (!driver) {
      console.warn('Skipping selenium smoke test: %s', driverUnavailableReason || 'driver unavailable');
      return;
    }

    await removeClientDist();
    const { server, baseUrl } = await startTestServer();

    try {
      await driver.get(baseUrl);

      await driver.wait(until.titleIs('ResumeForge'), 10000);
      await driver.wait(until.elementLocated(By.css('main.fallback')), 10000);

      const root = await driver.findElement(By.css('#root'));
      const rootStatus = await root.getAttribute('data-status');
      expect(rootStatus).toBe('client-assets-missing');

      const heading = await driver.findElement(By.css('main.fallback h1'));
      const headingText = await heading.getText();
      expect(headingText).toContain('ResumeForge client rebuilding');

      const instructions = await driver.findElements(By.css('main.fallback li'));
      expect(instructions.length).toBeGreaterThanOrEqual(3);

      const scriptPlaceholder = await driver.findElement(By.css('script[data-placeholder="true"]'));
      const scriptSrc = await scriptPlaceholder.getAttribute('src');
      expect(scriptSrc.endsWith('/assets/index-dev.js')).toBe(true);

      const degradeSection = await driver.findElement(By.css('section.fallback__degraded'));
      const degradeVisibility = await degradeSection.getAttribute('data-visible');
      expect(degradeVisibility).toBe('false');
      const hiddenAttr = await degradeSection.getAttribute('hidden');
      expect(hiddenAttr === '' || hiddenAttr === 'true' || hiddenAttr === 'hidden').toBe(true);

      const backupInput = await degradeSection.findElement(By.css('[data-backup-api-base]'));
      const backupValue = await backupInput.getAttribute('value');
      expect(backupValue).toBe('');
    } finally {
      await stopTestServer(server);
    }
  });

  test('renders the primary UI when compiled assets are available', async () => {
    if (!driver) {
      console.warn('Skipping selenium smoke test: %s', driverUnavailableReason || 'driver unavailable');
      return;
    }

    await ensureClientBuild();
    const { server, baseUrl } = await startTestServer();

    try {
      await driver.get(baseUrl);

      await driver.wait(until.titleIs('ResumeForge'), 10000);

      const root = await driver.findElement(By.css('#root'));
      await driver.wait(async () => {
        const status = await root.getAttribute('data-status');
        return status !== 'client-assets-missing';
      }, 10000);

      const rootChildren = await root.findElements(By.xpath('./*'));
      expect(rootChildren.length).toBeGreaterThan(0);

      const warning = await driver.findElement(By.css('#static-asset-warning'));
      await driver.wait(async () => {
        const visible = await warning.getAttribute('data-visible');
        return visible === 'false';
      }, 10000);

      const warningVisibility = await warning.getAttribute('data-visible');
      expect(warningVisibility).toBe('false');

      const degradeBanner = await driver.findElement(By.css('#cloudfront-degraded-banner'));
      const degradeVisible = await degradeBanner.getAttribute('data-visible');
      expect(degradeVisible).toBe('false');

      const fallbackElements = await driver.findElements(By.css('main.fallback'));
      expect(fallbackElements.length).toBe(0);
    } finally {
      await stopTestServer(server);
    }
  });
});
