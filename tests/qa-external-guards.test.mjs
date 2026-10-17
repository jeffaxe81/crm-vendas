import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeApiUrl, normalizeWebUrl, assertWriteGuard, apiCall, expectHttp
} from "../qa-external/guards.mjs";

test("laboratório exige origem segura e caminho fixo da API", () => {
  assert.equal(normalizeApiUrl("https://qa.example.test/api/v1"), "https://qa.example.test/api/v1");
  assert.equal(normalizeApiUrl("http://127.0.0.1:3001/api/v1/"), "http://127.0.0.1:3001/api/v1");
  assert.throws(() => normalizeApiUrl("http://crm.example.test/api/v1"), /HTTPS/);
  assert.throws(() => normalizeApiUrl("https://qa.example.test/api/v1?token=abc"), /credenciais/);
  assert.throws(() => normalizeApiUrl("https://qa.example.test/api/v2"), /api\/v1/);
  assert.throws(() => normalizeApiUrl("https://user:pass@qa.example.test/api/v1"), /credenciais/);
  assert.equal(normalizeWebUrl("https://qa.example.test/"), "https://qa.example.test");
});

test("testes de escrita exigem três confirmações consistentes", () => {
  const url = "https://qa.example.test/api/v1";
  const env = { QA_TARGET_KIND: "isolated", QA_WRITE_ACK: "ACEITO_CRIAR_DADOS_SINTETICOS",
    QA_CONFIRM_ORIGIN: "https://qa.example.test" };
  assert.doesNotThrow(() => assertWriteGuard(env, url));
  assert.throws(() => assertWriteGuard({ ...env, QA_CONFIRM_ORIGIN: "https://prod.example.test" }, url), /bloqueada/);
  assert.throws(() => assertWriteGuard({ ...env, QA_TARGET_KIND: "production" }, url), /bloqueada/);
  assert.throws(() => assertWriteGuard({ ...env, QA_WRITE_ACK: "" }, url), /bloqueada/);
});

test("requisições recusam redirect e não enviam token a outra origem", async () => {
  let captured;
  const fake = async (url, opts) => {
    captured = { url, opts };
    return { status: 302, headers: new Headers({ location: "https://evil.test" }) };
  };
  await assert.rejects(apiCall("https://qa.example.test/api/v1", "/companies", {
    token: "fake-test-token"
  }, fake), /Redirecionamento/);
  assert.equal(captured.url, "https://qa.example.test/api/v1/companies");
  assert.equal(captured.opts.redirect, "manual");
  assert.throws(() => expectHttp({ status: 500 }, 200, "health"), /HTTP 500/);
  await assert.rejects(apiCall("https://qa.example.test/api/v1", "//evil.test", {}, fake), /não permitido/);
});
