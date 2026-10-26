import { randomUUID } from "node:crypto";
/** No query is read on the server or embedded in HTML. The original tab keeps
 * its authenticated session; refreshing here would rotate its session ID. */
export function GET(_request: Request): Response {
  const nonce = randomUUID();
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>OAuth</title></head><body><p id="status"></p><script nonce="${nonce}">
  (() => {
    const query = window.location.search;
    window.history.replaceState(null, '', window.location.pathname);
    const language = navigator.language.slice(0, 2);
    const messages = {pt:'Volte à janela do CRM para concluir a conexão.',en:'Return to the CRM window to finish connecting.',es:'Vuelve a la ventana del CRM para finalizar la conexión.'};
    document.getElementById('status').textContent = messages[language] || messages.en;
    if (window.opener && query.length <= 10000) {
      window.opener.postMessage({ type: 'crm-email-oauth-callback', rawQuery: query }, window.location.origin);
      window.close();
    }
  })();</script></body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
    },
  });
}
