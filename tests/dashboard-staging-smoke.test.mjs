import assert from "node:assert/strict";
import test from "node:test";

import { runDashboardStagingSmoke } from "../scripts/dashboard-staging-smoke.mjs";

const counts = [
  { companies: 1, contacts: 1, opportunities: 0, activities: 0 },
  { companies: 2, contacts: 1, opportunities: 1, activities: 0 },
  { companies: 3, contacts: 2, opportunities: 1, activities: 2 },
];
const tokens = ["opaque-token-A", "opaque-token-B", "opaque-token-C"];

function config() {
  return {
    baseUrl: "https://staging.example.test/api/v1",
    acknowledgment: "NON_PRODUCTION",
    tenants: counts.map((expectedCounts, index) => ({
      label: "ABC"[index],
      token: tokens[index],
      expectedCounts,
    })),
  };
}

function response(body, status = 200, noStore = true) {
  return new Response(JSON.stringify(body), {
    status,
    headers: noStore ? { "Cache-Control": "private, no-store" } : {},
  });
}

function fakeFetch(options = {}) {
  const calls = [];
  async function fetchStub(url, request = {}) {
    calls.push({ url, request });
    const index = tokens.indexOf(
      String(request.headers?.Authorization ?? "").replace("Bearer ", "")
    );
    if (index < 0) return response({}, 401);
    if (url.includes("?")) return response({}, 400);
    if (url.endsWith("/catalog")) {
      return response({
        version: 1,
        metrics: [
          "crm.companies.active",
          "crm.contacts.active",
          "crm.opportunities.active",
          "crm.activities.active",
        ].map(id => ({
          id,
          unit: "records",
          permission: "reports.read",
          label: id,
        })),
      });
    }
    const recordCounts = options.leakTenant ? counts[0] : counts[index];
    return response(
      {
        counts: recordCounts,
        totalActiveRecords: Object.values(recordCounts).reduce(
          (sum, value) => sum + value,
          0
        ),
      },
      200,
      !options.omitCacheHeader
    );
  }
  return { fetchStub, calls };
}

test("staging smoke validates three distinct tenants without mutation", async () => {
  const { fetchStub, calls } = fakeFetch();
  const result = await runDashboardStagingSmoke(config(), fetchStub);
  assert.deepEqual(result, { ok: true, tenantsChecked: 3, requests: 10 });
  assert.equal(calls.length, 10);
  assert(calls.every(call => call.request.method === "GET"));
  assert(calls.every(call => call.request.cache === "no-store"));
  assert(calls.every(call => call.request.redirect === "manual"));
  assert(calls.every(call => !call.url.includes("opaque-token-")));
});

test("staging smoke rejects tenant data leak and missing no-store", async () => {
  await assert.rejects(
    runDashboardStagingSmoke(
      config(),
      fakeFetch({ leakTenant: true }).fetchStub
    ),
    /DASHBOARD_TENANT_COUNTS_MISMATCH/
  );
  await assert.rejects(
    runDashboardStagingSmoke(
      config(),
      fakeFetch({ omitCacheHeader: true }).fetchStub
    ),
    /DASHBOARD_NO_STORE_HEADER_MISSING/
  );
});

test("staging smoke rejects production-like or ambiguous input", async () => {
  const candidate = config();
  candidate.acknowledgment = "";
  await assert.rejects(
    runDashboardStagingSmoke(candidate, fakeFetch().fetchStub),
    /STAGING_ACKNOWLEDGMENT_REQUIRED/
  );
  candidate.acknowledgment = "NON_PRODUCTION";
  candidate.baseUrl = "http://production.example.test/api/v1";
  await assert.rejects(
    runDashboardStagingSmoke(candidate, fakeFetch().fetchStub),
    /INVALID_STAGING_URL/
  );
  candidate.baseUrl = "https://staging.example.test/api/v1";
  candidate.tenants[1].token = candidate.tenants[0].token;
  await assert.rejects(
    runDashboardStagingSmoke(candidate, fakeFetch().fetchStub),
    /TENANT_CREDENTIALS_MUST_BE_DISTINCT/
  );
});

test("staging smoke checks that API keys and superusers are denied", async () => {
  const conf = config();
  conf.forbidden = [
    { label: "API_KEY", token: "opaque-api-key" },
    { label: "SUPERUSER", token: "opaque-superuser" },
  ];
  const { fetchStub, calls } = fakeFetch();
  const result = await runDashboardStagingSmoke(conf, async (url, request) => {
    const token = request.headers?.Authorization ?? "";
    if (
      token === "Bearer opaque-api-key" ||
      token === "Bearer opaque-superuser"
    ) {
      calls.push({ url, request });
      return response({}, 403);
    }
    return fetchStub(url, request);
  });
  assert.equal(result.requests, 14);
  assert.equal(
    calls.filter(call =>
      call.request.headers?.Authorization === "Bearer opaque-api-key"
    ).length, 2
  );
  assert.equal(
    calls.filter(call =>
      call.request.headers?.Authorization === "Bearer opaque-superuser"
    ).length, 2
  );
});

test("staging smoke fails closed when a privileged credential is accepted", async () => {
  const conf = config();
  conf.forbidden = [{ label: "API_KEY", token: "opaque-api-key" }];
  const { fetchStub } = fakeFetch();
  await assert.rejects(
    runDashboardStagingSmoke(conf, async (url, request) => {
      if (request.headers?.Authorization === "Bearer opaque-api-key") {
        return response({}, 200);
      }
      return fetchStub(url, request);
    }),
    /DASHBOARD_PRIVILEGED_CREDENTIAL_ALLOWED/
  );
});
