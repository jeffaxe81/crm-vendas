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
    calls.filter(
      call => call.request.headers?.Authorization === "Bearer opaque-api-key"
    ).length,
    2
  );
  assert.equal(
    calls.filter(
      call => call.request.headers?.Authorization === "Bearer opaque-superuser"
    ).length,
    2
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

test("performance mode excludes warmup and reports nearest-rank percentiles per tenant", async () => {
  const candidate = {
    ...config(),
    performance: { warmupIterations: 1, samplesPerTenant: 5 },
  };
  const { fetchStub, calls } = fakeFetch();
  let value = 0;
  let tick = 0;
  const clock = () => {
    if (tick++ % 2 === 0) return value;
    value += Math.ceil(tick / 2);
    return value;
  };
  const result = await runDashboardStagingSmoke(candidate, fetchStub, clock);
  assert.equal(result.requests, 28);
  assert.equal(result.performance.percentileMethod, "nearest-rank");
  assert.equal(result.performance.concurrency, 1);
  assert.deepEqual(
    result.performance.tenants.map(t => [
      t.label,
      t.sampleCount,
      t.minMs,
      t.p50Ms,
      t.p95Ms,
      t.maxMs,
    ]),
    [
      ["A", 5, 1, 7, 13, 13],
      ["B", 5, 2, 8, 14, 14],
      ["C", 5, 3, 9, 15, 15],
    ]
  );
  assert.deepEqual(
    calls.slice(10).map(c => c.request.headers.Authorization),
    Array.from({ length: 6 }, () => tokens.map(t => "Bearer " + t)).flat()
  );
  const report = JSON.stringify(result);
  for (const secret of [...tokens, candidate.baseUrl])
    assert(!report.includes(secret));
});

test("invalid performance budgets fail before the first request", async () => {
  for (const performance of [
    null,
    [],
    {},
    { warmupIterations: -1, samplesPerTenant: 5 },
    { warmupIterations: 11, samplesPerTenant: 5 },
    { warmupIterations: 1, samplesPerTenant: 4 },
    { warmupIterations: 1, samplesPerTenant: 101 },
    { warmupIterations: 1, samplesPerTenant: 5.5 },
    { warmupIterations: 1, samplesPerTenant: NaN },
    { warmupIterations: 1, samplesPerTenant: 5, parallel: 100 },
  ]) {
    const { fetchStub, calls } = fakeFetch();
    await assert.rejects(
      runDashboardStagingSmoke({ ...config(), performance }, fetchStub),
      /INVALID_PERFORMANCE_CONFIGURATION/
    );
    assert.equal(calls.length, 0);
  }
});

test("performance samples revalidate counts and cache rather than timing untrusted responses", async () => {
  for (const failure of [{ leakTenant: true }, { omitCacheHeader: true }]) {
    const good = fakeFetch();
    const bad = fakeFetch(failure);
    let n = 0;
    await assert.rejects(
      runDashboardStagingSmoke(
        {
          ...config(),
          performance: { warmupIterations: 0, samplesPerTenant: 5 },
        },
        (...args) =>
          ++n <= 10 ? good.fetchStub(...args) : bad.fetchStub(...args)
      ),
      /DASHBOARD_(TENANT_COUNTS_MISMATCH|NO_STORE_HEADER_MISSING)/
    );
  }
});

test("invalid clocks fail safely without reporting partial measurements", async () => {
  for (const clock of [
    () => NaN,
    () => -1,
    () => Infinity,
    (() => {
      let n = 2;
      return () => n--;
    })(),
    () => {
      throw Error("opaque-token-A private URL");
    },
  ]) {
    await assert.rejects(
      runDashboardStagingSmoke(
        {
          ...config(),
          performance: { warmupIterations: 0, samplesPerTenant: 5 },
        },
        fakeFetch().fetchStub,
        clock
      ),
      /^Error: INVALID_PERFORMANCE_CLOCK$/
    );
  }
});

test("a failed performance sample stops the run and never echoes a secret transport error", async () => {
  const good = fakeFetch();
  let calls = 0;
  await assert.rejects(
    runDashboardStagingSmoke(
      {
        ...config(),
        performance: { warmupIterations: 0, samplesPerTenant: 5 },
      },
      (...args) => {
        calls++;
        if (calls > 10) throw Error("opaque-token-A private URL");
        return good.fetchStub(...args);
      }
    ),
    /^Error: STAGING_NETWORK_FAILURE$/
  );
  assert.equal(calls, 11);
});
