import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readdirSync } from "node:fs";
const schema = readFileSync(
  join(process.cwd(), "prisma/schema.prisma"),
  "utf8"
);
const migrations = readdirSync(join(process.cwd(), "prisma/migrations"))
  .map(dir => {
    try {
      return readFileSync(
        join(process.cwd(), "prisma/migrations", dir, "migration.sql"),
        "utf8"
      );
    } catch {
      return "";
    }
  })
  .join("\n");
describe("webhook storage invariants", () => {
  it.each(["WebhookSubscription", "WebhookDispatch", "WebhookDelivery"])(
    "defines persistent %s",
    model => {
      expect(schema).toContain(`model ${model} {`);
    }
  );
  it.each([
    "webhook_subscriptions",
    "webhook_dispatches",
    "webhook_deliveries",
  ])("enforces FORCE RLS and the maintenance lock on %s", table => {
    expect(migrations).toContain(
      `ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY`
    );
    expect(migrations).toMatch(
      new RegExp(
        `CREATE TRIGGER crm_tenant_maintenance_guard[\\s\\S]*?ON public.${table}`
      )
    );
  });
  it("links child rows with composite tenant identities and prevents attempt mutation", () => {
    expect(migrations).toContain(
      'FOREIGN KEY ("subscription_id", "organization_id")'
    );
    expect(migrations).toContain(
      'FOREIGN KEY ("dispatch_id", "subscription_id", "organization_id")'
    );
    expect(migrations).toMatch(
      /BEFORE UPDATE OR DELETE ON public.webhook_deliveries/
    );
  });
});
