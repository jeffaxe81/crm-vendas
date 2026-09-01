module.exports = {
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
  },
  moduleFileExtensions: ["ts", "js", "json"],
  testEnvironment: "node",
};
