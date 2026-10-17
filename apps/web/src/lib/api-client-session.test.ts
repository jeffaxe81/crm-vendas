import { afterEach, describe, expect, it, vi } from "vitest";
import {
  apiRequest,
  resolveApiBaseUrl,
  SESSION_UNAUTHORIZED_EVENT,
} from "./api-client";

afterEach(() => vi.unstubAllGlobals());

describe("local refresh cookie site", () => {
  it("uses the browser loopback hostname while preserving API port and path", () => {
    expect(
      resolveApiBaseUrl("http://localhost:3001/api/v1", "http://127.0.0.1:3000")
    ).toBe("http://127.0.0.1:3001/api/v1");
  });

  it("does not rewrite a remote API or a relative proxy path", () => {
    expect(
      resolveApiBaseUrl(
        "https://api.example.com/api/v1",
        "http://127.0.0.1:3000"
      )
    ).toBe("https://api.example.com/api/v1");
    expect(resolveApiBaseUrl("/api/v1", "https://crm.example.com")).toBe(
      "/api/v1"
    );
    expect(
      resolveApiBaseUrl(
        "http://localhost:3001/api/v1",
        "https://crm.example.com"
      )
    ).toBe("http://localhost:3001/api/v1");
  });
});

describe("invalid authenticated session", () => {
  it("notifies the shell of a bearer 401 without replaying the request", async () => {
    const listener = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: "Autenticação necessária." }),
    });
    vi.stubGlobal("fetch", fetchMock);
    window.addEventListener(SESSION_UNAUTHORIZED_EVENT, listener);
    try {
      await expect(
        apiRequest("/me/onboarding", { accessToken: "expired" })
      ).rejects.toMatchObject({ status: 401 });
      expect(listener).toHaveBeenCalledOnce();
      expect(
        (listener.mock.calls[0]?.[0] as CustomEvent<string> | undefined)?.detail
      ).toBe("expired");
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener(SESSION_UNAUTHORIZED_EVENT, listener);
    }
  });

  it("does not treat a rejected login as expiration of an existing session", async () => {
    const listener = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ message: "Credenciais inválidas." }),
      })
    );
    window.addEventListener(SESSION_UNAUTHORIZED_EVENT, listener);
    try {
      await expect(
        apiRequest("/auth/login", { method: "POST" })
      ).rejects.toMatchObject({ status: 401 });
      expect(listener).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(SESSION_UNAUTHORIZED_EVENT, listener);
    }
  });
});
