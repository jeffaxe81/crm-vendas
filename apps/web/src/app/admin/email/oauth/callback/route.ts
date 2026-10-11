/**
 * Safe, deliberately inactive OAuth landing route (F4.3-04B3).
 *
 * This does NOT validate state, exchange codes or connect email accounts.
 * A future dedicated implementation must complete the full security review
 * before accepting grants. Redirect strips sensitive URL query parameters.
 */
export function GET(_request: Request): Response {
  return new Response(null, {
    status: 303,
    headers: {
      Location: "/?emailOAuth=not_connected",
      "Cache-Control": "no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
