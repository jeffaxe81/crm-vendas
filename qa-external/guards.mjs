/**
 * Limites de segurança do laboratório externo: sem dependências do CRM.
 * A confirmação de ambiente isolado é uma declaração do operador; o runner
 * não consegue inspecionar se a instalação contém dados reais.
 */
export function normalizeApiUrl(value) {
  if (!value) throw new Error("QA_API_URL é obrigatório.");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("QA_API_URL inválido.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("QA_API_URL não pode conter credenciais ou parâmetros.");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error(
      "Exija HTTPS fora de localhost; não use -k ou TLS inseguro."
    );
  }
  if (url.pathname.replace(/\/+$/, "") !== "/api/v1") {
    throw new Error("QA_API_URL deve terminar exatamente em /api/v1.");
  }
  return url.origin + "/api/v1";
}

export function normalizeWebUrl(value) {
  if (!value) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("QA_WEB_URL inválido.");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error(
      "QA_WEB_URL deve ser a origem HTTP local ou HTTPS, sem path/segredos."
    );
  }
  return url.origin;
}

export function assertWriteGuard(env, apiUrl) {
  const origin = new URL(apiUrl).origin;
  if (
    env.QA_TARGET_KIND !== "isolated" ||
    env.QA_WRITE_ACK !== "ACEITO_CRIAR_DADOS_SINTETICOS" ||
    env.QA_CONFIRM_ORIGIN !== origin
  ) {
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
  let response;
  try {
    response = await fetcher(target, {
      method: options.method || "GET",
      headers: {
        accept: "application/json",
        ...(options.body === undefined
          ? {}
          : { "content-type": "application/json" }),
        ...(options.token ? { authorization: "Bearer " + options.token } : {}),
      },
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    // Erros nativos podem incluir URL, headers ou partes do corpo enviado.
    throw new Error(
      "Falha de transporte na API; verifique rede e confiança TLS."
    );
  }
  if (response.status >= 300 && response.status < 400) {
    throw new Error(
      "Redirecionamento inesperado recusado (" + response.status + ")."
    );
  }
  const contentType = response.headers.get("content-type") || "";
  let body = null;
  if (contentType.includes("application/json")) {
    try {
      body = await response.json();
    } catch {
      // SyntaxError de JSON pode reproduzir o payload remoto, inclusive segredos.
      throw new Error("Resposta JSON inválida da API.");
    }
  }
  return { status: response.status, body };
}

/** Política usada antes de toda navegação/request do Playwright, sem dependê-lo. */
export function createBrowserGuard(webValue, apiValue) {
  const webUrl = normalizeWebUrl(webValue);
  if (!webUrl)
    throw new Error("Informe QA_WEB_URL explícita. Não use o fallback.");
  const apiUrl = apiValue ? normalizeApiUrl(apiValue) : null;
  const api = apiUrl ? new URL(apiUrl) : null;
  let blockedReason = null;

  async function deny(route, reason) {
    blockedReason ||= reason;
    await route.abort("blockedbyclient");
  }

  return {
    assertSafe() {
      if (blockedReason) throw new Error(blockedReason);
    },
    async route(route) {
      if (blockedReason) return deny(route, blockedReason);
      const request = route.request();
      if (request.redirectedFrom()) {
        return deny(route, "Redirecionamento de navegador recusado.");
      }
      let target;
      try {
        target = new URL(request.url());
      } catch {
        return deny(route, "URL de requisição do navegador inválida.");
      }
      const allowedApi =
        api &&
        target.origin === api.origin &&
        (target.pathname === api.pathname ||
          target.pathname.startsWith(api.pathname + "/"));
      if (
        target.username ||
        target.password ||
        target.hash ||
        (target.origin !== webUrl && !allowedApi)
      ) {
        return deny(
          route,
          "Requisição fora das origens QA explícitas recusada."
        );
      }
      let response;
      try {
        // Não use continue(): o navegador seguiria 3xx e poderia repetir POST.
        response = await route.fetch({
          maxRedirects: 0,
          maxRetries: 0,
          timeout: 15000,
        });
        if (response.status() >= 300 && response.status() < 400) {
          return await deny(route, "Redirecionamento de navegador recusado.");
        }
        if (blockedReason) return await deny(route, blockedReason);
        await route.fulfill({ response });
      } catch {
        return deny(
          route,
          "Falha de transporte no navegador; verifique rede e confiança TLS."
        );
      } finally {
        if (response) await response.dispose();
      }
    },
  };
}

export function expectHttp(result, expected, label) {
  const statuses = Array.isArray(expected) ? expected : [expected];
  if (!statuses.includes(result.status)) {
    throw new Error(
      label + ": HTTP " + result.status + "; esperado " + statuses.join("/")
    );
  }
  return result.body;
}
