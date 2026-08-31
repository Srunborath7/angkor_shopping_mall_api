module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  verbose: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  collectCoverageFrom: [
    'src/utils/**/*.js',
    'src/middlewares/**/*.js',
    'src/services/**/*.js',
    '!src/views/**',
    '!src/config/**'
  ]
};
