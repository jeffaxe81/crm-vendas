import { EventEmitter } from "node:events";
import type { ClientRequest, IncomingMessage, RequestOptions } from "node:http";
import type { LookupAddress } from "node:dns";
import {
  HttpsWebhookTransport,
  type WebhookTransportDependencies as Dependencies,
} from "./webhook-transport";
function fixture(
  addresses: LookupAddress[] = [{ address: "8.8.8.8", family: 4 }],
  status = 200
) {
  const calls: RequestOptions[] = [];
  let callback: ((response: IncomingMessage) => void) | undefined;
  let destroyed = false;
  let responseDestroyed = false;
  let sent: string | undefined;
  const response = Object.assign(new EventEmitter(), {
    statusCode: status,
    destroy: () => {
      responseDestroyed = true;
    },
  });
  const req = Object.assign(new EventEmitter(), {
    end: (body: string) => {
      sent = body;
      queueMicrotask(() => callback?.(response as unknown as IncomingMessage));
    },
    destroy: () => {
      destroyed = true;
    },
  });
  const deps: Dependencies = {
    resolve: async () => addresses,
    request: (opts, cb) => {
      calls.push(opts);
      callback = cb;
      return req as unknown as ClientRequest;
    },
  };
  const transport = new HttpsWebhookTransport(deps);
  return {
    transport,
    deps,
    calls,
    response,
    req,
    get destroyed() {
      return destroyed;
    },
    get responseDestroyed() {
      return responseDestroyed;
    },
    get sent() {
      return sent;
    },
  };
}
describe("pinned webhook HTTPS transport", () => {
  it("pins approved DNS while keeping Host, TLS hostname and certificate validation", async () => {
    const f = fixture();
    expect(
      await f.transport.send("https://hooks.example.com/events", "{}", {})
    ).toEqual({ responseStatus: 200, errorCode: null });
    expect(f.calls[0]).toMatchObject({
      hostname: "hooks.example.com",
      servername: "hooks.example.com",
      port: 443,
      method: "POST",
      rejectUnauthorized: true,
      agent: false,
    });
    let pinned: unknown[] = [];
    (f.calls[0]?.lookup as Function)?.(
      "hooks.example.com",
      {},
      (...values: unknown[]) => {
        pinned = values;
      }
    );
    expect(pinned).toEqual([null, "8.8.8.8", 4]);
    expect(f.sent).toBe("{}");
    expect(f.responseDestroyed).toBe(true);
    expect(f.response.listenerCount("data")).toBe(0);
  });
  it.each([
    [[{ address: "127.0.0.1", family: 4 }]],
    [
      [
        { address: "8.8.8.8", family: 4 },
        { address: "10.0.0.1", family: 4 },
      ],
    ],
    [[{ address: "::ffff:7f00:1", family: 6 }]],
    [[{ address: "::ffff:8.8.8.8", family: 6 }]],
    [[]],
  ])(
    "blocks private, mixed, mapped and empty DNS answers %j",
    async addresses => {
      const f = fixture(addresses);
      expect(
        await f.transport.send("https://hooks.example.com", "{}", {})
      ).toEqual({ responseStatus: null, errorCode: "SSRF_BLOCKED" });
      expect(f.calls).toHaveLength(0);
    }
  );
  it("re-resolves each attempt and blocks DNS rebinding", async () => {
    const f = fixture();
    let count = 0;
    f.deps.resolve = async () => [
      { address: ++count === 1 ? "8.8.8.8" : "192.168.0.1", family: 4 },
    ];
    expect(
      (await f.transport.send("https://hooks.example.com", "{}", {}))
        ?.responseStatus
    ).toBe(200);
    expect(
      await f.transport.send("https://hooks.example.com", "{}", {})
    ).toEqual({ responseStatus: null, errorCode: "SSRF_BLOCKED" });
    expect(f.calls).toHaveLength(1);
  });
  it("rejects redirects without a second request", async () => {
    const f = fixture(undefined, 302);
    expect(
      await f.transport.send("https://hooks.example.com", "{}", {})
    ).toEqual({ responseStatus: 302, errorCode: "REDIRECT_BLOCKED" });
    expect(f.calls).toHaveLength(1);
  });
  it("counts DNS in the overall deadline and ignores late DNS", async () => {
    const f = fixture();
    const started = Date.now();
    let finish: ((addresses: LookupAddress[]) => void) | undefined;
    f.deps.resolve = () =>
      new Promise(resolve => {
        finish = resolve;
      });
    expect(
      await f.transport.send("https://hooks.example.com", "{}", {})
    ).toEqual({ responseStatus: null, errorCode: "TIMEOUT" });
    expect(Date.now() - started).toBeGreaterThanOrEqual(4900);
    finish?.([{ address: "8.8.8.8", family: 4 }]);
    await Promise.resolve();
    expect(f.calls).toHaveLength(0);
  }, 10000);
  it("destroys a stalled request at the deadline", async () => {
    const f = fixture();
    f.req.end = () => {};
    expect(
      await f.transport.send("https://hooks.example.com", "{}", {})
    ).toEqual({ responseStatus: null, errorCode: "TIMEOUT" });
    expect(f.destroyed).toBe(true);
  }, 10000);
  it("returns controlled DNS and network errors", async () => {
    const dns = fixture();
    dns.deps.resolve = async () => {
      throw Error("secret.internal.example token");
    };
    expect(
      await dns.transport.send("https://hooks.example.com", "{}", {})
    ).toEqual({ responseStatus: null, errorCode: "DNS_ERROR" });
    const net = fixture();
    net.req.end = () => {
      net.req.emit("error", Error("credential"));
    };
    expect(
      await net.transport.send("https://hooks.example.com", "{}", {})
    ).toEqual({ responseStatus: null, errorCode: "NETWORK_ERROR" });
  });
});
