import assert from "node:assert/strict";
import test from "node:test";

import { runDashboardStagingSmoke } from "../scripts/dashboard-staging-smoke.mjs";

const counts = [
  { companies: 100, contacts: 0, opportunities: 0, activities: 0 },
  { companies: 1000, contacts: 0, opportunities: 0, activities: 0 },
  { companies: 10000, contacts: 0, opportunities: 0, activities: 0 },
];
const tokens = [
  "concurrent-token-A",
  "concurrent-token-B",
  "concurrent-token-C",
];

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

test("performance mode supports bounded concurrent read-only samples", async () => {
  let active = 0;
  let maxActive = 0;
  const fetchStub = async (url, request = {}) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise(resolve => setTimeout(resolve, 2));
    try {
      const token = String(request.headers?.Authorization ?? "").replace(
        "Bearer ",
        ""
      );
      const index = tokens.indexOf(token);
      if (index < 0) return response({}, 401);
      if (url.includes("?")) return response({}, 400);
      if (url.endsWith("/catalog"))
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
      return response({
        counts: counts[index],
        totalActiveRecords: Object.values(counts[index]).reduce(
          (sum, value) => sum + value,
          0
        ),
      });
    } finally {
      active -= 1;
    }
  };

  const result = await runDashboardStagingSmoke(
    {
      baseUrl: "https://staging.example.test/api/v1",
      acknowledgment: "NON_PRODUCTION",
      tenants: counts.map((expectedCounts, index) => ({
        label: "ABC"[index],
        token: tokens[index],
        expectedCounts,
      })),
      performance: {
        warmupIterations: 0,
        samplesPerTenant: 5,
        concurrency: 3,
      },
    },
    fetchStub
  );

  assert.equal(result.requests, 25);
  assert.equal(result.performance.mode, "parallel");
  assert.equal(result.performance.concurrency, 3);
  assert.deepEqual(
    result.performance.tenants.map(item => item.sampleCount),
    [5, 5, 5]
  );
  assert(maxActive >= 2, "expected overlapping read-only requests");
  const serialized = JSON.stringify(result);
  for (const secret of tokens) assert(!serialized.includes(secret));
});

function configuration(concurrency) {
  return {
    baseUrl: "https://staging.example.test/api/v1",
    acknowledgment: "NON_PRODUCTION",
    tenants: counts.map((expectedCounts, index) => ({
      label: "ABC"[index],
      token: tokens[index],
      expectedCounts,
    })),
    performance: { warmupIterations: 0, samplesPerTenant: 7, concurrency },
  };
}

function countedFetch() {
  let active = 0;
  let peak = 0;
  const calls = [];
  const fetchStub = async (url, request) => {
    calls.push({ url, request });
    active++;
    peak = Math.max(peak, active);
    // Yield one microtask: all requests started in the same batch overlap,
    // with no wall-clock sleep or scheduler-dependent delay.
    await Promise.resolve();
    try {
      const index = tokens.indexOf(
        String(request.headers?.Authorization ?? "").replace("Bearer ", "")
      );
      if (index < 0) return response({}, 401);
      if (url.includes("?")) return response({}, 400);
      if (url.endsWith("/catalog"))
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
      return response({
        counts: counts[index],
        totalActiveRecords: counts[index].companies,
      });
    } finally {
      active--;
    }
  };
  return { fetchStub, calls, peak: () => peak, active: () => active };
}

for (const concurrency of [1, 2, 3, 7, 20]) {
  test(`concurrency ${concurrency} never exceeds its limit and preserves all tenant samples`, async () => {
    const transport = countedFetch();
    const result = await runDashboardStagingSmoke(
      configuration(concurrency),
      transport.fetchStub
    );
    assert.equal(transport.peak(), concurrency);
    assert.equal(transport.active(), 0);
    assert.equal(transport.calls.length, 31);
    assert.equal(result.requests, 31);
    assert.deepEqual(
      result.performance.tenants.map(t => [
        t.label,
        t.sampleCount,
        t.activeRecords,
      ]),
      [
        ["A", 7, 100],
        ["B", 7, 1000],
        ["C", 7, 10000],
      ]
    );
    for (const token of tokens)
      assert.equal(
        transport.calls
          .slice(10)
          .filter(c => c.request.headers.Authorization === "Bearer " + token)
          .length,
        7
      );
    assert(
      transport.calls.every(
        c => c.request.method === "GET" && c.request.cache === "no-store"
      )
    );
    for (const secret of [...tokens, configuration(concurrency).baseUrl])
      assert(!JSON.stringify(result).includes(secret));
  });
}

test("invalid concurrency is rejected before any network request", async () => {
  for (const concurrency of [
    0,
    -1,
    21,
    1.5,
    "3",
    null,
    NaN,
    Infinity,
    true,
    [],
    {},
  ]) {
    const transport = countedFetch();
    await assert.rejects(
      runDashboardStagingSmoke(configuration(concurrency), transport.fetchStub),
      /INVALID_PERFORMANCE_CONFIGURATION/
    );
    assert.equal(transport.calls.length, 0);
  }
});
