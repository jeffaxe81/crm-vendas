import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const METRICS = [
  ["crm.companies.active", "companies"],
  ["crm.contacts.active", "contacts"],
  ["crm.opportunities.active", "opportunities"],
  ["crm.activities.active", "activities"],
];
const COUNT_KEYS = METRICS.map(([, key]) => key);

function requireCondition(condition, code) {
  if (!condition) throw new Error(code);
}

function validateCounts(value) {
  requireCondition(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).sort().join(",") ===
        [...COUNT_KEYS].sort().join(",") &&
      COUNT_KEYS.every(
        key => Number.isSafeInteger(value[key]) && value[key] >= 0
      ),
    "INVALID_EXPECTED_COUNTS"
  );
}

function validateConfiguration(config) {
  requireCondition(
    config && config.acknowledgment === "NON_PRODUCTION",
    "STAGING_ACKNOWLEDGMENT_REQUIRED"
  );
  let target;
  try {
    target = new URL(config.baseUrl);
  } catch {
    throw new Error("INVALID_STAGING_URL");
  }
  const localHost = ["localhost", "127.0.0.1", "[::1]"].includes(
    target.hostname
  );
  requireCondition(
    (target.protocol === "https:" ||
      (target.protocol === "http:" && localHost)) &&
      !target.username &&
      !target.password &&
      !target.search &&
      !target.hash &&
      target.pathname.replace(/\/$/, "").endsWith("/api/v1"),
    "INVALID_STAGING_URL"
  );
  requireCondition(
    Array.isArray(config.tenants) && config.tenants.length === 3,
    "THREE_TENANTS_REQUIRED"
  );
  const fingerprints = new Set();
  for (const tenant of config.tenants) {
    requireCondition(
      tenant &&
        typeof tenant.token === "string" &&
        tenant.token.length >= 8 &&
        typeof tenant.label === "string" &&
        /^[A-C]$/.test(tenant.label),
      "INVALID_STAGING_TENANT"
    );
    validateCounts(tenant.expectedCounts);
    fingerprints.add(JSON.stringify(tenant.expectedCounts));
  }
  requireCondition(
    config.tenants.map(item => item.label).sort().join("") === "ABC",
    "TENANT_LABELS_MUST_BE_ABC"
  );
  requireCondition(
    new Set(config.tenants.map(item => item.token)).size === 3,
    "TENANT_CREDENTIALS_MUST_BE_DISTINCT"
  );
  requireCondition(
    fingerprints.size === 3,
    "DISTINCT_TEST_FIXTURES_REQUIRED"
  );
  return target.href.replace(/\/$/, "");
}

async function get(fetchImpl, url, token) {
  try {
    return await fetchImpl(url, {
      method: "GET",
      cache: "no-store",
      redirect: "manual",
      headers: token ? { Authorization: "Bearer " + token } : {},
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    // A transport error may include tokens/URLs; never echo its details.
    throw new Error("STAGING_NETWORK_FAILURE");
  }
}

function requireNoStore(response) {
  const directive = response.headers.get("cache-control") ?? "";
  requireCondition(
    directive.includes("private") && directive.includes("no-store"),
    "DASHBOARD_NO_STORE_HEADER_MISSING"
  );
}

async function json(response) {
  try {
    return await response.json();
  } catch {
    throw new Error("DASHBOARD_INVALID_JSON");
  }
}

async function readCatalog(fetchImpl, baseUrl, token) {
  const response = await get(fetchImpl, baseUrl + "/dashboards/catalog", token);
  requireCondition(response.status === 200, "DASHBOARD_CATALOG_NOT_AVAILABLE");
  requireNoStore(response);
  const payload = await json(response);
  requireCondition(
    payload?.version === 1 &&
      Array.isArray(payload.metrics) &&
      payload.metrics.length === METRICS.length &&
      METRICS.every(
        ([id], index) =>
          payload.metrics[index]?.id === id &&
          payload.metrics[index]?.unit === "records" &&
          payload.metrics[index]?.permission === "reports.read"
      ),
    "DASHBOARD_CATALOG_CHANGED"
  );
}

async function readVolume(fetchImpl, baseUrl, tenant) {
  const response = await get(
    fetchImpl,
    baseUrl + "/dashboards/volume",
    tenant.token
  );
  requireCondition(response.status === 200, "DASHBOARD_VOLUME_NOT_AVAILABLE");
  requireNoStore(response);
  const payload = await json(response);
  requireCondition(
    payload &&
      !Object.hasOwn(payload, "organizationId") &&
      !Object.hasOwn(payload, "items"),
    "DASHBOARD_UNEXPECTED_DATA"
  );
  validateCounts(payload.counts);
  const total = COUNT_KEYS.reduce((sum, key) => sum + payload.counts[key], 0);
  requireCondition(
    payload.totalActiveRecords === total &&
      COUNT_KEYS.every(
        key => payload.counts[key] === tenant.expectedCounts[key]
      ),
    "DASHBOARD_TENANT_COUNTS_MISMATCH"
  );
}

/**
 * Read-only, opt-in staging smoke test. Credentials are accepted only in
 * process memory, and failures never print HTTP payloads or bearer tokens.
 */
export async function runDashboardStagingSmoke(config, fetchImpl = fetch) {
  const baseUrl = validateConfiguration(config);
  for (const tenant of config.tenants) {
    await readCatalog(fetchImpl, baseUrl, tenant.token);
    await readVolume(fetchImpl, baseUrl, tenant);
  }
  // Recheck A after B and C to detect tenant-context carryover.
  await readVolume(fetchImpl, baseUrl, config.tenants[0]);

  const anonymous = await get(fetchImpl, baseUrl + "/dashboards/volume");
  requireCondition(anonymous.status === 401, "DASHBOARD_ANONYMOUS_ALLOWED");
  const anonymousCatalog = await get(
    fetchImpl,
    baseUrl + "/dashboards/catalog"
  );
  requireCondition(
    anonymousCatalog.status === 401,
    "DASHBOARD_CATALOG_ANONYMOUS_ALLOWED"
  );
  const override = await get(
    fetchImpl,
    baseUrl + "/dashboards/volume?organizationId=other-tenant",
    config.tenants[0].token
  );
  requireCondition(override.status === 400, "DASHBOARD_TENANT_OVERRIDE_ALLOWED");
  return { ok: true, tenantsChecked: 3, requests: 10 };
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    let tenants;
    try {
      tenants = JSON.parse(
        process.env.DASHBOARD_STAGING_TENANTS_JSON ?? "null"
      );
    } catch {
      throw new Error("INVALID_STAGING_INPUT");
    }
    const result = await runDashboardStagingSmoke({
      baseUrl: process.env.DASHBOARD_STAGING_BASE_URL,
      acknowledgment: process.env.DASHBOARD_STAGING_ACK,
      tenants,
    });
    console.log(
      "Dashboard staging: approved " +
        result.tenantsChecked +
        " synthetic tenants (" +
        result.requests +
        " read-only requests)."
    );
  } catch (cause) {
    // Never include the HTTP URL, payload or credentials in diagnostic output.
    console.error(
      cause instanceof Error ? cause.message : "DASHBOARD_STAGING_FAILED"
    );
    process.exitCode = 1;
  }
}
