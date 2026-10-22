import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

// CSP derived from what the web app actually loads:
// - Next.js hydration/flight data needs inline scripts (no nonce, so pages stay static-cacheable).
// - Leaflet tiles: OpenStreetMap (*.tile.openstreetmap.org) and Esri World Imagery (server.arcgisonline.com).
// - Learning images: lh3.googleusercontent.com; satellite previews come from backend-signed URLs (any https host).
// - Scan previews are blob: URLs; assistant TTS audio is a data: URL; voice recording uses getUserMedia (Permissions-Policy).
// - Fonts are system stacks (no Google Fonts); all API calls go through same-origin route handlers.
// NOTE: headers() is evaluated at build time, so set STORAGE_UPLOAD_ORIGINS when running `next build`.
// Browsers upload voice notes and scan images straight to presigned object-storage URLs, so those
// origins must be allowed in connect-src. Set STORAGE_UPLOAD_ORIGINS to a comma-separated list of
// origins (https only in production; plain http is accepted only for localhost, or outside production) (for example https://my-bucket.oss-ap-southeast-1.aliyuncs.com). Only https origins
// without credentials, paths or wildcards are accepted; anything else is ignored.
const storageUploadOrigins = (process.env.STORAGE_UPLOAD_ORIGINS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter((value) => {
    try {
      const url = new URL(value);
      const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      return (url.protocol === "https:" || localHttp || (!isProduction && url.protocol === "http:")) && !url.username && !url.password && url.pathname === "/" && !value.includes("*") && url.origin === value.replace(/\/$/, "");
    } catch {
      return false;
    }
  });

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://*.tile.openstreetmap.org https://server.arcgisonline.com https://lh3.googleusercontent.com https:${storageUploadOrigins.length ? ` ${storageUploadOrigins.join(" ")}` : ""}`,
  "font-src 'self' data:",
  `connect-src 'self'${storageUploadOrigins.length ? ` ${storageUploadOrigins.join(" ")}` : ""}${isProduction ? "" : " ws: wss:"}`,
  `media-src 'self' data: blob:${storageUploadOrigins.length ? ` ${storageUploadOrigins.join(" ")}` : ""}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "microphone=(self), camera=(self), geolocation=(self), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isProduction
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  // Keep the Next.js development badge from covering mobile navigation during demos.
  devIndicators: false,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
