import assert from "node:assert/strict";
import test from "node:test";

import * as guards from "../qa-external/guards.mjs";

const webUrl = "https://qa.example.test";
const apiUrl = "https://api.qa.example.test/api/v1";

function guardFor(web = webUrl, api = apiUrl) {
  assert.equal(
    typeof guards.createBrowserGuard,
    "function",
    "Política de navegador ausente"
  );
  return guards.createBrowserGuard(web, api);
}

function fakeRoute(
  url,
  responses,
  { redirected = false, method = "GET", body } = {}
) {
  const sent = [];
  let delivered = null;
  let aborted = null;
  const route = {
    request: () => ({
      url: () => url,
      redirectedFrom: () => (redirected ? {} : null),
    }),
    async fetch(options) {
      let target = url;
      for (let index = 0; ; index++) {
        sent.push({ url: target, method, body });
        const response = responses.get(target);
        assert.ok(
          response,
          "Nenhum tráfego fora das respostas locais de teste"
        );
        if (
          response.status >= 300 &&
          response.status < 400 &&
          options.maxRedirects !== 0
        ) {
          assert.ok(index < 5, "Loop de redirect no teste");
          target = new URL(response.location, target).href;
          continue;
        }
        return { status: () => response.status, dispose: async () => {} };
      }
    },
    async fulfill({ response }) {
      delivered = response.status();
    },
    async abort(reason) {
      aborted = reason;
    },
  };
  return {
    route,
    sent,
    get delivered() {
      return delivered;
    },
    get aborted() {
      return aborted;
    },
  };
}

test("navegador recusa userinfo, parâmetros, paths e HTTP remoto antes de navegar", () => {
  for (const value of [
    "https://user:QA_SECRET_SENTINEL@qa.example.test",
    "https://qa.example.test/?token=QA_SECRET_SENTINEL",
    "https://qa.example.test/#QA_SECRET_SENTINEL",
    "https://qa.example.test/login",
    "http://qa.example.test",
  ])
    assert.throws(() => guardFor(value));
  assert.throws(() => guards.createBrowserGuard(undefined, apiUrl));
  assert.throws(() =>
    guardFor(webUrl, "https://user:password@api.qa.example.test/api/v1")
  );
  assert.doesNotThrow(() =>
    guardFor("http://127.0.0.1:3000", "http://[::1]:3001/api/v1")
  );
});

test("navegador permite somente origens QA explícitas e o prefixo da API", async () => {
  for (const url of [webUrl + "/", webUrl + "/login", apiUrl + "/auth/login"]) {
    const guard = guardFor();
    const request = fakeRoute(url, new Map([[url, { status: 200 }]]));
    await guard.route(request.route);
    assert.equal(request.delivered, 200);
    assert.equal(request.aborted, null);
    assert.equal(request.sent.length, 1);
    assert.doesNotThrow(() => guard.assertSafe());
  }
  for (const url of [
    "https://foreign.example.test/login",
    "http://qa.example.test/login",
    "https://user:password@qa.example.test/login",
    "https://api.qa.example.test/private",
  ]) {
    const guard = guardFor();
    const request = fakeRoute(url, new Map());
    await guard.route(request.route);
    assert.equal(request.sent.length, 0);
    assert.ok(request.aborted);
    assert.equal(request.delivered, null);
    assert.throws(() => guard.assertSafe());
  }
});

test("todo 3xx bloqueia antes de repetir POST ou seguir cadeia até outra origem", async () => {
  for (const status of [300, 301, 302, 303, 304, 305, 307, 308, 399]) {
    const guard = guardFor();
    const target = apiUrl + "/auth/login";
    const next = apiUrl + "/auth/continue";
    const foreign = "https://foreign.example.test/collect";
    const request = fakeRoute(
      target,
      new Map([
        [target, { status, location: next }],
        [next, { status: 307, location: foreign }],
        [foreign, { status: 200 }],
      ]),
      { method: "POST", body: "password=QA_SECRET_SENTINEL" }
    );
    await guard.route(request.route);
    assert.deepEqual(request.sent, [
      { url: target, method: "POST", body: "password=QA_SECRET_SENTINEL" },
    ]);
    assert.ok(request.aborted);
    assert.equal(request.delivered, null);
    assert.throws(() => guard.assertSafe(), /Redirecionamento/);
    const later = fakeRoute(target, new Map([[target, { status: 200 }]]), {
      method: "POST",
    });
    await guard.route(later.route);
    assert.equal(
      later.sent.length,
      0,
      "Bloqueio anterior impede envio posterior de credenciais"
    );
  }
});

test("navegador não envia requisição já redirecionada nem expõe erro de transporte", async () => {
  const guard = guardFor();
  const request = fakeRoute(webUrl + "/", new Map(), { redirected: true });
  await guard.route(request.route);
  assert.equal(request.sent.length, 0);
  assert.ok(request.aborted);
  assert.throws(() => guard.assertSafe(), /Redirecionamento/);

  const transportGuard = guardFor();
  const failed = fakeRoute(webUrl + "/", new Map());
  failed.route.fetch = async () => {
    throw new Error("QA_SECRET_SENTINEL");
  };
  await transportGuard.route(failed.route);
  assert.ok(failed.aborted);
  assert.throws(
    () => transportGuard.assertSafe(),
    error => {
      assert.equal(error.message.includes("QA_SECRET_SENTINEL"), false);
      assert.match(error.message, /transporte/);
      return true;
    }
  );
});
