import path from "node:path";
import type { NextConfig } from "next";

// Tujuan proxy request /api/v1/* dari browser. Dengan proxy same-origin,
// browser tidak perlu mengakses port API secara langsung sehingga bebas
// masalah CORS, host, maupun IPv6/IPv4.
const API_PROXY_TARGET = (
  process.env.API_PROXY_TARGET ?? "http://127.0.0.1:5000"
).replace(/\/+$/, "");

const isDev = process.env.NODE_ENV === "development";

// API dipanggil same-origin lewat rewrite. Jika NEXT_PUBLIC_API_URL diisi
// (API di-host terpisah), origin tersebut ikut diizinkan di connect-src.
const publicApiOrigin = (() => {
  const raw = process.env.NEXT_PUBLIC_API_URL;
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
})();

// CSP tanpa nonce: halaman tetap bisa di-prerender/di-cache. Inline script
// diperlukan oleh bootstrap Next.js; 'unsafe-eval' hanya untuk development.
const cspHeader = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${publicApiOrigin ? ` ${publicApiOrigin}` : ""}`,
  "media-src 'self'",
  "object-src 'none'",
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: cspHeader },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Permissions-Policy",
    // Geolocation dibutuhkan untuk absensi berbasis geofence.
    value:
      "geolocation=(self), camera=(), microphone=(), payment=(), usb=(), interest-cohort=()",
  },
  ...(isDev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ]),
];

const nextConfig: NextConfig = {
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    // Aplikasi web berada di apps/web, sedangkan dependency di-hoist ke
    // node_modules di root monorepo. Root dihitung relatif agar portabel.
    root: path.join(__dirname, "../.."),
  },
  allowedDevOrigins: ["192.168.56.1", "localhost:3000"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${API_PROXY_TARGET}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
