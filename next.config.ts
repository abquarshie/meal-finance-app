import type { NextConfig } from "next";

// Sent with every page: the browser won't show Cashew inside another site's frame, guess file types, or tell other
// sites which page a link was clicked on, and always uses HTTPS once it has visited.
const security = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  // the pg driver and Prisma's generated client run on the server only
  serverExternalPackages: ["pg", "@prisma/adapter-pg"],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: security }];
  },
};

export default nextConfig;
