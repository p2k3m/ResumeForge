import { jest } from '@jest/globals';
import http from 'http';
import { Builder, By, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import { setupTestServer } from '../utils/testServer.js';

const chromeBinaryPath = typeof process.env.CHROME_BIN === 'string' ? process.env.CHROME_BIN.trim() : '';
const chromeDriverPath = typeof process.env.CHROMEDRIVER_PATH === 'string' ? process.env.CHROMEDRIVER_PATH.trim() : '';
const hasChromeBinary = chromeBinaryPath.length > 0;
const describeIfSupported = hasChromeBinary ? describe : describe.skip;

jest.setTimeout(60000);

describeIfSupported('client application smoke test (selenium)', () => {
  let server;
  let baseUrl;
  let driver;
  let driverUnavailableReason = null;

  beforeAll(async () => {
    const { app } = await setupTestServer();
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, resolve);
    });
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;

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
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('renders fallback UI with guidance when compiled assets are missing', async () => {
    if (!driver) {
      console.warn('Skipping selenium smoke test: %s', driverUnavailableReason || 'driver unavailable');
      return;
    }

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
  });
});
