/**
 * Limites de segurança do laboratório externo: sem dependências do CRM.
 * A confirmação de ambiente isolado é uma declaração do operador; o runner
 * não consegue inspecionar se a instalação contém dados reais.
 */
export function normalizeApiUrl(value) {
  if (!value) throw new Error("QA_API_URL é obrigatório.");
  let url;
  try { url = new URL(value); } catch { throw new Error("QA_API_URL inválido."); }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("QA_API_URL não pode conter credenciais ou parâmetros.");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error("Exija HTTPS fora de localhost; não use -k ou TLS inseguro.");
  }
  if (url.pathname.replace(/\/+$/, "") !== "/api/v1") {
    throw new Error("QA_API_URL deve terminar exatamente em /api/v1.");
  }
  return url.origin + "/api/v1";
}

export function normalizeWebUrl(value) {
  if (!value) return null;
  let url;
  try { url = new URL(value); } catch { throw new Error("QA_WEB_URL inválido."); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("QA_WEB_URL deve ser a origem HTTP local ou HTTPS, sem path/segredos.");
  }
  return url.origin;
}

export function assertWriteGuard(env, apiUrl) {
  const origin = new URL(apiUrl).origin;
  if (env.QA_TARGET_KIND !== "isolated" ||
      env.QA_WRITE_ACK !== "ACEITO_CRIAR_DADOS_SINTETICOS" ||
      env.QA_CONFIRM_ORIGIN !== origin) {
    throw new Error(
      "Escrita bloqueada: exija QA_TARGET_KIND=isolated, " +
      "QA_WRITE_ACK=ACEITO_CRIAR_DADOS_SINTETICOS e " +
      "QA_CONFIRM_ORIGIN idêntico à origem da API. " +
      "Confirme que a instalação é DESCARTÁVEL e sem dados reais."
    );
  }
}

export async function apiCall(apiUrl, path, options = {}, fetcher = fetch) {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("..")) {
    throw new Error("Caminho de API não permitido.");
  }
  const target = apiUrl + path;
  const response = await fetcher(target, {
    method: options.method || "GET",
    headers: {
      accept: "application/json",
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(options.token ? { authorization: "Bearer " + options.token } : {})
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    redirect: "manual",
    signal: AbortSignal.timeout(15000)
  });
  if (response.status >= 300 && response.status < 400) {
    throw new Error("Redirecionamento inesperado recusado (" + response.status + ").");
  }
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json() : null;
  return { status: response.status, body };
}

export function expectHttp(result, expected, label) {
  const statuses = Array.isArray(expected) ? expected : [expected];
  if (!statuses.includes(result.status)) {
    throw new Error(label + ": HTTP " + result.status + "; esperado " + statuses.join("/"));
  }
  return result.body;
}
