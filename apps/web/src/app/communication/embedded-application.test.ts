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
