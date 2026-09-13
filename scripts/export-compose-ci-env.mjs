import { appendFileSync } from "node:fs";

const githubEnvironmentFile = process.env.GITHUB_ENV;

if (githubEnvironmentFile) {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required to prepare the Compose CI environment."
    );
  }

  const parsedDatabaseUrl = new URL(databaseUrl);
  const appDatabaseUser = decodeURIComponent(parsedDatabaseUrl.username);
  const appDatabasePassword = decodeURIComponent(parsedDatabaseUrl.password);

  if (!appDatabaseUser || !appDatabasePassword) {
    throw new Error(
      "DATABASE_URL must include application database credentials for Compose CI checks."
    );
  }

  if (/\r|\n/.test(appDatabaseUser) || /\r|\n/.test(appDatabasePassword)) {
    throw new Error("Database credentials cannot contain line breaks.");
  }

  appendFileSync(
    githubEnvironmentFile,
    `APP_DB_USER=${appDatabaseUser}\nAPP_DB_PASSWORD=${appDatabasePassword}\n`,
    "utf8"
  );
}
