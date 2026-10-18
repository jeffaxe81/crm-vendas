module.exports = {
  // Database suites share fixtures: keep one worker, recycling its VM between
  // files when idle memory grows rather than retaining every suite in-process.
  maxWorkers: 1,
  workerIdleMemoryLimit: "1GB",
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: "<rootDir>/../tsconfig.spec.json",
      },
    ],
  },
  moduleNameMapper: {
    "^@axes/contracts$": "<rootDir>/../../../packages/contracts/src/index.ts",
    "^nestjs-pino$": "<rootDir>/../test/mocks/nestjs-pino.mock.ts",
  },
  moduleFileExtensions: ["ts", "js", "json"],
  testEnvironment: "node",
};
