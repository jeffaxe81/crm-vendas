import { ApiError } from "./api-client";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001/api/v1";

/** Extrai o nome do arquivo de um `Content-Disposition: attachment; filename="..."`. */
export function filenameFromDisposition(
  header: string | null,
  fallback: string
): string {
  const match = header?.match(/filename="([^"]+)"/);
  return match?.[1] ?? fallback;
}

/**
 * Baixa um arquivo autenticado (Bearer) e dispara o download no navegador por
 * meio de um blob e de um link temporário. Devolve o nome usado.
 */
export async function downloadAuthenticatedFile(
  path: string,
  accessToken: string,
  fallbackFilename: string
): Promise<string> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as
      { message?: string | string[] } | undefined;
    const message = Array.isArray(payload?.message)
      ? payload.message.join(" ")
      : payload?.message || `A API retornou erro ${response.status}.`;
    throw new ApiError(message, response.status);
  }

  const filename = filenameFromDisposition(
    response.headers.get("Content-Disposition"),
    fallbackFilename
  );
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
  return filename;
}
