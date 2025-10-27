import { resolveStageName, resolveDeploymentEnvironment } from '../config/stage.js';

const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  for (const key of Object.keys(process.env)) {
    if (!Object.prototype.hasOwnProperty.call(ORIGINAL_ENV, key)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value;
  }
  delete process.env.STAGE_NAME;
  delete process.env.DEPLOYMENT_ENVIRONMENT;
  delete process.env.NODE_ENV;
}

describe('stage environment resolution', () => {
  beforeEach(() => {
    resetEnv();
  });

  afterAll(() => {
    resetEnv();
  });

  test.each([
    ['production', 'prod'],
    ['Production', 'prod'],
    ['PROD', 'prod'],
    ['staging', 'stage'],
    ['Stage', 'stage'],
    ['development', 'dev'],
    ['DEV', 'dev'],
  ])('resolveStageName normalizes %s to %s', (input, expected) => {
    process.env.STAGE_NAME = input;
    expect(resolveStageName()).toBe(expected);
  });

  test('resolveStageName falls back to deployment environment alias', () => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'Production';
    expect(resolveStageName()).toBe('prod');
  });

  test('resolveDeploymentEnvironment normalizes aliases and falls back to stage name', () => {
    process.env.STAGE_NAME = 'Staging';
    delete process.env.DEPLOYMENT_ENVIRONMENT;
    expect(resolveDeploymentEnvironment()).toBe('stage');
  });

  test('resolveDeploymentEnvironment respects explicit deployment environment alias', () => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'Production';
    expect(resolveDeploymentEnvironment({ stageName: 'qa' })).toBe('prod');
  });

  test('resolveDeploymentEnvironment preserves custom stage names', () => {
    process.env.STAGE_NAME = 'qa';
    expect(resolveDeploymentEnvironment()).toBe('qa');
  });
});
