import "reflect-metadata";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { EmailModule } from "./email.module";
import { DisabledEmailProvider, EMAIL_PROVIDER } from "./email-provider";

/**
 * RC 1.0 regression gate: provider selection in administration must never
 * silently activate outbound email in the Nest application container.
 * A future transport switch needs a separately reviewed and tested change.
 */
describe("CRM 1.0 email transport release guard", () => {
  it("binds exactly one outbound provider and keeps it fail-closed", () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      EmailModule
    ) as unknown[];
    const providerBindings = providers.filter(
      (candidate): candidate is Record<PropertyKey, unknown> =>
        candidate !== null &&
        typeof candidate === "object" &&
        "provide" in candidate &&
        (candidate as { provide: unknown }).provide === EMAIL_PROVIDER
    );

    expect(providerBindings).toHaveLength(1);
    const binding = providerBindings[0] as {
      useFactory: (runtime: unknown) => unknown;
    };
    const original = process.env.EMAIL_OAUTH_SEND_ENABLED;
    delete process.env.EMAIL_OAUTH_SEND_ENABLED;
    try {
      expect(binding.useFactory({})).toBeInstanceOf(DisabledEmailProvider);
    } finally {
      if (original === undefined) delete process.env.EMAIL_OAUTH_SEND_ENABLED;
      else process.env.EMAIL_OAUTH_SEND_ENABLED = original;
    }
  });

  it("does not export the transport binding for unreviewed consumers", () => {
    const exports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      EmailModule
    ) as unknown[];
    expect(exports).not.toContain(EMAIL_PROVIDER);
  });
});
