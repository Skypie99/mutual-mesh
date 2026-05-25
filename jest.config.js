// Jest config — jest-expo preset.
//
// AccessMap lesson baked in from Day 0: testPathIgnorePatterns includes
// '/.claude/'. When the orchestrator spawns worktrees under .claude/worktrees/,
// stale native-module paths there would otherwise break `npm test`. Don't
// remove '/.claude/' from this list.
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['./jest.setup.js'],
  testPathIgnorePatterns: ['/node_modules/', '/.expo/', '/.claude/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // Coverage thresholds — proposed by Gary Phase 4 audit (2026-05-25).
  //
  // Baseline (2026-05-25, 384 tests, 22 suites):
  //   global lines:          ~74% across imported files
  //   src/lib/** aggregate:  ~87% across imported lib files
  //
  // IMPORTANT: Jest's coverageThreshold glob (e.g. './src/lib/**') applies
  // per-file, not as a directory aggregate. Many lib files (supabase.ts,
  // auth.tsx, photos.ts) are integration wrappers that cannot be unit-tested
  // without native runtime; they have 0% coverage on purpose. Setting a per-
  // directory glob would fail CI on those files.
  //
  // Strategy: use a modest global threshold that accounts for untestable
  // native-wrapper files. Raise it as coverage of pure helpers grows.
  // Phase 4 Gary audit target: 40% global (realistic), 80% for pure helpers
  // listed explicitly below.
  coverageThreshold: {
    global: {
      lines: 40,
    },
    // Pure helpers with full test coverage — guard against regression.
    './src/lib/errors.ts': { lines: 100 },
    './src/lib/handleValidator.ts': { lines: 100 },
    './src/lib/handleGenerator.ts': { lines: 90 },
    './src/lib/resourcesRealtime.ts': { lines: 100 },
    './src/lib/verification.ts': { lines: 100 },
    './src/lib/contactHandle.ts': { lines: 100 },
    './src/lib/categories.ts': { lines: 100 },
    './src/lib/policyText.ts': { lines: 100 },
    './src/lib/onboardingCopy.ts': { lines: 100 },
    './src/lib/typedConfirmation.ts': { lines: 100 },
  },
};
