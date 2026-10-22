/** Use the configured public origin behind HTTPS reverse proxies; never trust forwarded headers. */
export function mutationOriginAllowed(request: Request, environment = process.env): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return environment.NODE_ENV !== "production";
  if (environment.NODE_ENV === "production" && environment.WEB_APP_URL) {
    try {
      const canonical = new URL(environment.WEB_APP_URL);
      return canonical.protocol === "https:" && !canonical.username && !canonical.password && origin === canonical.origin;
    } catch {
      return false;
    }
  }
  const url = new URL(request.url);
  const host = request.headers.get("host");
  return origin === url.origin || (host !== null && origin === `${url.protocol}//${host}`);
}
