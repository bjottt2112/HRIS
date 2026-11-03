// Default: string kosong -> request relatif ke origin web sendiri, lalu
// diteruskan oleh rewrite di next.config.ts ke API. Isi NEXT_PUBLIC_API_URL
// hanya jika API di-host terpisah dan bisa diakses langsung dari browser.
export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(
  /\/+$/,
  "",
);

export const AUTH_TOKEN_KEY = "hris_token";

const REFRESH_EXCLUDED_PATHS = [
  "/api/v1/auth/login",
  "/api/v1/auth/register",
  "/api/v1/auth/refresh",
  "/api/v1/auth/logout",
  "/api/v1/auth/forgot-password",
  "/api/v1/auth/reset-password",
];

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function authorizationHeader(token?: string | null): Record<string, string> {
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

function isFormData(body: BodyInit | null | undefined): boolean {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

async function sendRequest(
  path: string,
  init: RequestInit | undefined,
  token?: string | null,
): Promise<Response> {
  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      // Cookie refresh token (httpOnly) harus ikut terkirim.
      credentials: "include",
      headers: {
        // Biarkan browser menentukan boundary multipart untuk FormData.
        ...(isFormData(init?.body ?? null)
          ? {}
          : { "Content-Type": "application/json" }),
        ...(init?.headers ?? {}),
        ...authorizationHeader(token),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;

    throw new ApiError(
      "Tidak dapat terhubung ke server API. Pastikan API sudah berjalan (npm run dev).",
      0,
    );
  }
}

let refreshInFlight: Promise<string | null> | null = null;

/**
 * Rotasi refresh token (cookie httpOnly) dan simpan access token baru.
 * Single-flight agar banyak request 401 bersamaan hanya memicu satu rotasi.
 */
function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const response = await sendRequest("/api/v1/auth/refresh", {
          method: "POST",
          body: "{}",
        });

        if (!response.ok) return null;

        const data = (await response.json()) as { token?: string };
        if (!data.token) return null;

        window.localStorage.setItem(AUTH_TOKEN_KEY, data.token);
        return data.token;
      } catch {
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }

  return refreshInFlight;
}

async function requestWithRefresh(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const storedToken =
    typeof window === "undefined"
      ? null
      : window.localStorage.getItem(AUTH_TOKEN_KEY);

  let response = await sendRequest(path, init, storedToken);

  const mayRefresh = !REFRESH_EXCLUDED_PATHS.some((prefix) =>
    path.startsWith(prefix),
  );

  if (response.status === 401 && mayRefresh && typeof window !== "undefined") {
    const renewedToken = await refreshAccessToken();

    if (renewedToken) {
      response = await sendRequest(path, init, renewedToken);
    } else {
      window.localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  }

  return response;
}

async function throwApiError(response: Response): Promise<never> {
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  throw new ApiError(
    payload.error ?? `HTTP error ${response.status}`,
    response.status,
  );
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await requestWithRefresh(path, init);

  if (!response.ok) await throwApiError(response);

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

/** Upload multipart (FormData) tanpa perlu mengatur Content-Type manual. */
export function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  return apiFetch<T>(path, { method: "POST", body: formData });
}

function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const match = header.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  if (!match) return fallback;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return fallback;
  }
}

/**
 * Unduh file (CSV/XLSX/lampiran) dengan token + auto-refresh, lalu simpan
 * lewat blob URL. Nama file diambil dari header Content-Disposition.
 */
export async function apiDownload(
  path: string,
  fallbackName = "unduhan",
): Promise<void> {
  const response = await requestWithRefresh(path);

  if (!response.ok) await throwApiError(response);

  const blob = await response.blob();
  const filename = filenameFromDisposition(
    response.headers.get("Content-Disposition"),
    fallbackName,
  );

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
