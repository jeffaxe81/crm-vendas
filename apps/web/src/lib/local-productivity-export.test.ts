import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  downloadLoadedCalendar,
  downloadLoadedVcards,
} from "./local-productivity-export";

let downloaded: Blob;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubGlobal("URL", {
    createObjectURL: (blob: Blob) => {
      downloaded = blob;
      return "blob:local-export";
    },
    revokeObjectURL: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  vi.runAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function readDownload() {
  // FileReader exercises the same UTF-8 blob consumed by contact/calendar apps.
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(downloaded, "utf-8");
  });
}

describe("contact and calendar export interoperability", () => {
  it("folds long vCard properties within 75 UTF-8 octets without losing text", async () => {
    const name = "João 🚀 東京 ".repeat(20);
    downloadLoadedVcards("contacts.vcf", [{ fullName: name }]);
    const text = await readDownload();
    for (const line of text.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(text.replace(/\r\n[ \t]/g, "")).toContain(`FN:${name}\r\n`);
    expect(text).not.toContain("\uFFFD");
    expect(text).toContain("BEGIN:VCARD\r\nVERSION:3.0\r\n");
  });

  it("folds ICS summaries after escaping newlines and delimiters", async () => {
    const title = "Reunião 🗓️ 東京; cliente,\n".repeat(15);
    downloadLoadedCalendar("agenda.ics", [
      { id: "activity-1", title, dueAt: "2026-10-25T15:00:00Z" },
    ]);
    const text = await readDownload();
    for (const line of text.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    const unfolded = text.replace(/\r\n[ \t]/g, "");
    expect(unfolded).toContain(
      `SUMMARY:${"Reunião 🗓️ 東京\\; cliente\\,\\n".repeat(15)}\r\n`
    );
    expect(unfolded).toContain("DTSTART:20261025T150000Z\r\n");
    expect(unfolded).toContain("STATUS:TENTATIVE\r\n");
    expect(text).not.toContain("\uFFFD");
  });
});
