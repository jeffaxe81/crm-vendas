/** Fail closed before constructing drill clients; only local test databases. */
export function storageDrillConnections(env: NodeJS.ProcessEnv) {
  if (env.NODE_ENV !== "test") throw new Error("STORAGE_DRILL_TEST_ONLY");
  const owner = env.MIGRATION_DATABASE_URL ?? env.DATABASE_URL;
  const restricted = env.RLS_DATABASE_URL;
  if (!owner || !restricted) throw new Error("STORAGE_DRILL_URLS_REQUIRED");
  const ownerUrl = new URL(owner);
  const restrictedUrl = new URL(restricted);
  for (const url of [ownerUrl, restrictedUrl]) {
    if (
      !["postgresql:", "postgres:"].includes(url.protocol) ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      url.pathname.length < 2 ||
      url.search.length > 0
    )
      throw new Error("STORAGE_DRILL_LOCAL_DATABASE_REQUIRED");
  }
  if (
    ownerUrl.host !== restrictedUrl.host ||
    ownerUrl.pathname !== restrictedUrl.pathname
  )
    throw new Error("STORAGE_DRILL_DATABASE_MISMATCH");
  return { owner, restricted };
}
