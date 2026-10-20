import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the pg driver and Prisma's generated client run on the server only
  serverExternalPackages: ["pg", "@prisma/adapter-pg"],
};

export default nextConfig;
