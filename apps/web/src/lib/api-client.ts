const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001/api/v1";

type ApiErrorPayload = {
  message?: string | string[];
};

/** Erro de API com o status HTTP, para telas que tratam códigos específicos (ex.: 409). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type ApiRequestOptions = {
  accessToken?: string;
  method?: string;
  body?: unknown;
  credentials?: RequestCredentials;
};

function createRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function errorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as ApiErrorPayload).message;
    if (Array.isArray(message)) {
      return message.join(" ");
    }
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  return `A API retornou erro ${status}.`;
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "x-request-id": createRequestId(),
  };
  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;

  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`;
  }

  if (options.body !== undefined && !isFormData) {
    headers["Content-Type"] = "application/json";
  }

  const request: RequestInit = {
    method: options.method ?? "GET",
    headers,
  };

  if (options.body !== undefined) {
    request.body = isFormData
      ? (options.body as FormData)
      : JSON.stringify(options.body);
  }

  if (options.credentials) {
    request.credentials = options.credentials;
  }

  const response = await fetch(`${apiBaseUrl}${path}`, request);
  const payload =
    response.status === 204
      ? undefined
      : await response.json().catch(() => undefined);

  if (!response.ok) {
    throw new ApiError(errorMessage(payload, response.status), response.status);
  }

  return payload as T;
}

export function authApiRequest<T>(
  path: string,
  options: Omit<ApiRequestOptions, "credentials" | "accessToken"> = {}
): Promise<T> {
  return apiRequest<T>(path, {
    ...options,
    credentials: "include",
  });
}

/** Authorized file transfer. Do not expose bearer tokens in URLs or logs. */
export async function downloadApiFile(
  path: string,
  accessToken: string,
  filename: string
): Promise<void> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "x-request-id": createRequestId(),
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => undefined);
    throw new ApiError(errorMessage(payload, response.status), response.status);
  }

  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(href);
  }
}
