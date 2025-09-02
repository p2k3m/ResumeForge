const mod = await import('../config/secrets.js');

test('exports getSecrets', () => {
  expect(typeof mod.getSecrets).toBe('function');
});
