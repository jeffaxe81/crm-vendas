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
