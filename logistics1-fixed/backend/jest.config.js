// jest.config.js — separate config for integration tests
module.exports = {
  testEnvironment: 'node',
  testTimeout: 30000, // 30s for E2E tests
  runInBand: true,    // Sequential — no parallel DB conflicts
  forceExit: true,
  verbose: true,
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/__tests__/integration/**/*.test.js',
  ],
  globalSetup: undefined,
  globalTeardown: undefined,
}
