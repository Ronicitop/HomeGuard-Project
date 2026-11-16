export function serverOrigin(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(
      "Ingresá un origen válido, por ejemplo http://192.168.1.50:3000",
    );
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["", "/"].includes(url.pathname)
  )
    throw new Error(
      "Usá solamente el origen del servidor, sin rutas ni credenciales.",
    );
  if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new Error("En el teléfono usá la IP de la PC en la red Wi-Fi.");
  return url.origin;
}
export function eventFromNotification(data: unknown): string | null {
  const id = (data as { event_id?: unknown })?.event_id;
  return typeof id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
    ? id
    : null;
}
export type Api = (path: string, init?: RequestInit) => Promise<any>;
export function createApi(
  origin: string,
  token: string | null,
  onExpired: () => void,
  fetcher: typeof fetch = fetch,
): Api {
  return async (path, init = {}) => {
    if (path.startsWith("/") || path.includes("..") || path.includes("://"))
      throw new Error("Ruta de aplicación no válida.");
    const response = await fetcher(`${origin}/api/v1/${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
      signal: init.signal || AbortSignal.timeout(20000),
    });
    if (response.status === 401) onExpired();
    const payload = await response.json().catch((error) => {
      if (error?.name === "AbortError") throw error;
      throw new Error(
        "El servidor devolvió una respuesta no válida. Volvé a intentar.",
      );
    });
    if (!response.ok)
      throw new Error(
        payload?.error?.message ||
          `No se pudo completar la solicitud (${response.status}).`,
      );
    return payload;
  };
}
export function incidentResponse(
  response: "I_AM_OK" | "REQUEST_HELP",
  revision: number,
  key: string,
) {
  return {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: JSON.stringify({ response, expected_revision: revision }),
  };
}
