import { describe, expect, it } from "vitest";
import {
  readCommunicationApplication,
  parseFrameMessage,
  resolveFrameDimensions,
} from "./embedded-application";

describe("NEO communication configuration", () => {
  it("stays disabled until an environment URL is configured", () => {
    expect(readCommunicationApplication({})).toEqual({ status: "disabled" });
  });
  it("derives the exact allowed origin from the configured HTTPS URL", () => {
    expect(
      readCommunicationApplication({
        NEO_INTERACT_URL: "https://neo.example.test/neo/",
      })
    ).toEqual({
      status: "ready",
      application: {
        id: "neo-interact",
        name: "NEO Interact",
        src: "https://neo.example.test/neo/",
        origin: "https://neo.example.test",
        defaultHeight: 800,
        minHeight: 320,
        maxHeight: 1600,
        maxWidth: 1600,
      },
    });
  });
  it.each([
    "http://neo.example.test/",
    "javascript:alert(1)",
    "https://user:password@neo.example.test/",
    "https://neo.example.test/?token=secret",
    "https://neo.example.test/#token",
    "invalid",
  ])("rejects an unsafe configured URL: %s", value => {
    expect(readCommunicationApplication({ NEO_INTERACT_URL: value })).toEqual({
      status: "invalid",
    });
  });
  it.each([
    "https://crm.example.test/",
    "https://CRM.EXAMPLE.TEST",
    "https://crm.example.test:443/",
    " https://crm.example.test/ ",
  ])("rejects equivalent CRM origins: %s", WEB_ORIGIN => {
    expect(
      readCommunicationApplication({
        NEO_INTERACT_URL: "https://crm.example.test/neo",
        WEB_ORIGIN,
      })
    ).toEqual({ status: "invalid" });
  });
  it("treats a whitespace-only URL as disabled", () => {
    expect(readCommunicationApplication({ NEO_INTERACT_URL: "   " })).toEqual({
      status: "disabled",
    });
  });
  it("fails closed when the CRM origin is malformed", () => {
    expect(
      readCommunicationApplication({
        NEO_INTERACT_URL: "https://neo.example.test/",
        WEB_ORIGIN: "invalid",
      })
    ).toEqual({ status: "invalid" });
  });
  it("accepts a different HTTPS port", () => {
    expect(
      readCommunicationApplication({
        NEO_INTERACT_URL: "https://crm.example.test:8443/neo",
        WEB_ORIGIN: "https://crm.example.test",
      }).status
    ).toBe("ready");
  });
  it("rejects embedding the CRM's own origin", () => {
    expect(
      readCommunicationApplication({
        NEO_INTERACT_URL: "https://crm.example.test/neo",
        WEB_ORIGIN: "https://crm.example.test",
      })
    ).toEqual({ status: "invalid" });
  });
});

describe("Dispatch-compatible iframe protocol", () => {
  it("accepts only valid resize messages", () => {
    expect(
      parseFrameMessage({
        type: "TOGGLE_IFRAME_SIZE",
        isExpanded: true,
        width: 600,
        height: 900,
      }).success
    ).toBe(true);
    for (const value of [
      { type: "init", timestamp: 1 },
      { type: "TOGGLE_IFRAME_SIZE", isExpanded: "true" },
      { type: "TOGGLE_IFRAME_SIZE", isExpanded: true, width: Infinity },
      { type: "TOGGLE_IFRAME_SIZE", isExpanded: true, height: -1 },
    ]) {
      expect(parseFrameMessage(value).success).toBe(false);
    }
  });
  it.each([NaN, Infinity, -Infinity, 0, -1, 10001, "600", null])(
    "rejects invalid numeric dimensions: %s",
    width => {
      expect(
        parseFrameMessage({
          type: "TOGGLE_IFRAME_SIZE",
          isExpanded: true,
          width,
        }).success
      ).toBe(false);
    }
  );
  it.each([null, undefined, [], "TOGGLE_IFRAME_SIZE", {}])(
    "rejects malformed messages: %s",
    value => {
      expect(parseFrameMessage(value).success).toBe(false);
    }
  );
  it("uses defaults when an expansion omits dimensions", () => {
    expect(resolveFrameDimensions({ isExpanded: true }, 390)).toEqual({
      width: "390px",
      height: 800,
    });
  });
  it.each([0, -1, NaN, Infinity])(
    "bounds width when the container measurement is unavailable: %s",
    width => {
      expect(
        resolveFrameDimensions({ isExpanded: true, width: 5000 }, width)
      ).toEqual({ width: "1600px", height: 800 });
    }
  );
  it("bounds expanded dimensions to the container and resets on collapse", () => {
    expect(
      resolveFrameDimensions(
        { isExpanded: true, width: 1400, height: 5000 },
        390
      )
    ).toEqual({ width: "390px", height: 1600 });
    expect(
      resolveFrameDimensions(
        { isExpanded: true, width: 300, height: 100 },
        1200
      )
    ).toEqual({ width: "300px", height: 320 });
    expect(
      resolveFrameDimensions(
        { isExpanded: false, width: 1400, height: 1200 },
        390
      )
    ).toEqual({ width: "100%", height: 800 });
  });
});
