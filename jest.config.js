/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest/presets/default-esm', // Use ESM preset
  testEnvironment: 'node',
  moduleNameMapper: {
    // Handle module aliases if needed, and map .js extensions
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    // '^.+\\.[tj]sx?$' to process js/ts with `ts-jest`
    // '^.+\\.m?[tj]sx?$' to process js/ts/mjs/mts with `ts-jest`
    '^.+\\.m?[tj]sx?$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
  extensionsToTreatAsEsm: ['.ts'], // Treat .ts files as ESM
  // Optional: Specify test file patterns
  // testMatch: ['**/__tests__/**/*.+(ts|tsx|js)', '**/?(*.)+(spec|test).+(ts|tsx|js)'],
  // Optional: Specify directories to ignore
  // testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  // Optional: Setup files to run before tests
  // setupFilesAfterEnv: ['./jest.setup.ts'],
};
