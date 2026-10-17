import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { defaultBranding } from "@axes/contracts";
import { useTenantBranding, brandingStorageKey } from "./use-tenant-branding";
import type { AuthSessionResponse } from "@axes/contracts";
const chosen = { ...defaultBranding, primaryColor: "#aa2244" };
const session = (id: string) =>
  ({
    accessToken: id,
    organization: { id, slug: id, name: id },
  }) as AuthSessionResponse;
beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("starts with defaults and remembers the last tenant only for presentation", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => chosen }))
  );
  const { result, rerender } = renderHook(
    ({ current }) => useTenantBranding(current),
    { initialProps: { current: null as AuthSessionResponse | null } }
  );
  expect(result.current.branding).toEqual(defaultBranding);
  rerender({ current: session("a") });
  await waitFor(() => expect(result.current.branding).toEqual(chosen));
  rerender({ current: null });
  expect(result.current.branding).toEqual(chosen);
  expect(JSON.parse(localStorage.getItem(brandingStorageKey)!)).toMatchObject({
    organizationId: "a",
    branding: chosen,
  });
});
it("clears old tenant styling while another tenant loads and ignores stale responses", async () => {
  let finishA!: (value: unknown) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (url: string, options: RequestInit) =>
        new Promise(resolve => {
          if (
            (options.headers as Record<string, string>).Authorization ===
            "Bearer a"
          )
            finishA = resolve;
          else
            resolve({
              ok: true,
              status: 200,
              json: async () => defaultBranding,
            });
        })
    )
  );
  const { result, rerender } = renderHook(
    ({ current }) => useTenantBranding(current),
    { initialProps: { current: session("a") } }
  );
  rerender({ current: session("b") });
  expect(result.current.branding).toEqual(defaultBranding);
  await act(async () =>
    finishA({ ok: true, status: 200, json: async () => chosen })
  );
  await waitFor(() => expect(result.current.branding).toEqual(defaultBranding));
  expect(JSON.parse(localStorage.getItem(brandingStorageKey)!)).toMatchObject({
    organizationId: "b",
  });
});
it("ignores malformed or executable cached branding and disabled storage", () => {
  localStorage.setItem(
    brandingStorageKey,
    JSON.stringify({
      organizationId: "a",
      branding: { ...chosen, logo: "javascript:alert(1)" },
    })
  );
  const { result } = renderHook(() => useTenantBranding(null));
  expect(result.current.branding).toEqual(defaultBranding);
});
it("ignores a save from a previous session after tenant switch", async () => {
  let finishSave!: (response: unknown) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, options: RequestInit) => {
      if (options.method === "PUT")
        return new Promise(resolve => {
          finishSave = resolve;
        });
      return { ok: true, status: 200, json: async () => defaultBranding };
    })
  );
  const { result, rerender } = renderHook(
    ({ current }) => useTenantBranding(current),
    { initialProps: { current: session("a") } }
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  let save!: Promise<unknown>;
  act(() => {
    save = result.current.save(chosen).catch(() => undefined);
  });
  rerender({ current: session("b") });
  await waitFor(() =>
    expect(JSON.parse(localStorage.getItem(brandingStorageKey)!)).toMatchObject(
      { organizationId: "b" }
    )
  );
  await act(async () => {
    finishSave({ ok: true, status: 200, json: async () => chosen });
    await save;
  });
  expect(result.current.loading).toBe(false);
  expect(result.current.branding).toEqual(defaultBranding);
  expect(JSON.parse(localStorage.getItem(brandingStorageKey)!)).toMatchObject({
    organizationId: "b",
  });
});
