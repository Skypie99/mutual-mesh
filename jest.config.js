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
};
