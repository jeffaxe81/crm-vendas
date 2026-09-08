const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001/api/v1";

type ApiErrorPayload = {
  message?: string | string[];
};

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

  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`;
  }

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const request: RequestInit = {
    method: options.method ?? "GET",
    headers,
  };

  if (options.body !== undefined) {
    request.body = JSON.stringify(options.body);
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
    throw new Error(errorMessage(payload, response.status));
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
