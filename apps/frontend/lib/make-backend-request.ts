/**
 * Helper function to make HTTP requests to the backend server with automatic API key authentication.
 * Only adds the Authorization header in Vercel production environment (VERCEL_ENV=production).
 *
 * @param url - The URL to request (can be absolute or relative to backend server)
 * @param options - Standard fetch RequestInit options
 * @returns Promise<Response> - The fetch response
 */
export async function makeBackendRequest(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  let fullUrl = url;
  if (!url.startsWith("http")) {
    const baseUrl =
      process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4000";
    fullUrl = `${baseUrl}${url.startsWith("/") ? "" : "/"}${url}`;
  }

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (process.env.VERCEL_ENV === "production") {
    const apiKey = process.env.MARU_API_KEY;
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    } else {
      console.warn(
        "[makeBackendRequest] MARU_API_KEY not found - required in production environment"
      );
    }
  }

  return fetch(fullUrl, {
    ...options,
    headers,
  });
}
