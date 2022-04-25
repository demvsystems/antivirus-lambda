module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: {
    '^.+\\.(ts)?$': 'ts-jest',
  },
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/**/*.spec.ts',
  ],
  transformIgnorePatterns: ['<rootDir>/node_modules/'],
};
