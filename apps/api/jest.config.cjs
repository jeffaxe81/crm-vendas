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
  moduleFileExtensions: ["ts", "js", "json"],
  testEnvironment: "node",
};
