import { afterEach, describe, expect, it, vi } from "vitest";
import {
  apiRequest,
  resolveApiBaseUrl,
  SESSION_UNAUTHORIZED_EVENT,
} from "../lib/api-client";

afterEach(() => {
  vi.unstubAllGlobals();
});
const localHosts = ["localhost", "127.0.0.1", "[::1]"];
const browsers = [...localHosts, "crm.example.com"];
const urls = localHosts.flatMap(apiHost =>
  browsers.flatMap(browser => [
    {
      configured: `http://${apiHost}:3001/api/v1`,
      origin: `http://${browser}:3000`,
      expected: `http://${browser === "crm.example.com" ? apiHost : browser}:3001/api/v1`,
    },
    {
      configured: `https://${apiHost}:8443/api/v1`,
      origin: `https://${browser}:443`,
      expected: `https://${browser === "crm.example.com" ? apiHost : browser}:8443/api/v1`,
    },
    {
      configured: `/api/v1?upstream=${apiHost}`,
      origin: `https://${browser}`,
      expected: `/api/v1?upstream=${apiHost}`,
    },
    {
      configured: `https://api.example.com/api/v1?host=${apiHost}`,
      origin: `https://${browser}`,
      expected: `https://api.example.com/api/v1?host=${apiHost}`,
    },
  ])
);
describe("PR222: 48 address combinations", () => {
  it.each(urls)(
    "$configured from $origin",
    ({ configured, origin, expected }) => {
      expect(resolveApiBaseUrl(configured, origin)).toBe(expected);
    }
  );
});
const requests = [200, 204, 401, 403, 500].flatMap(status =>
  ["GET", "POST", "PUT", "PATCH"].flatMap(method =>
    [undefined, "current-session"].map(token => ({ status, method, token }))
  )
);
describe("PR222: 40 authenticated response combinations", () => {
  it.each(requests)(
    "$method status=$status token=$token",
    async ({ status, method, token }) => {
      const payload = { message: "Mensagem original", data: "confirmed" };
      const fetchMock = vi.fn().mockResolvedValue({
        ok: status < 400,
        status,
        json: async () => payload,
      });
      vi.stubGlobal("fetch", fetchMock);
      const listener = vi.fn();
      window.addEventListener(SESSION_UNAUTHORIZED_EVENT, listener);
      try {
        const request = apiRequest("/validation", {
          method,
          accessToken: token,
          ...(method === "GET" ? {} : { body: { name: "draft" } }),
        });
        if (status >= 400)
          await expect(request).rejects.toMatchObject({
            status,
            message: payload.message,
          });
        else
          expect(await request).toEqual(status === 204 ? undefined : payload);
        expect(fetchMock).toHaveBeenCalledOnce();
        expect(fetchMock.mock.calls[0]?.[1]?.method).toBe(method);
        expect(listener).toHaveBeenCalledTimes(status === 401 && token ? 1 : 0);
        if (status === 401 && token)
          expect((listener.mock.calls[0]?.[0] as CustomEvent)?.detail).toBe(
            token
          );
      } finally {
        window.removeEventListener(SESSION_UNAUTHORIZED_EVENT, listener);
      }
    }
  );
});
