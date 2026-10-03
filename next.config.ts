import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phone / other PC on the LAN hitting `next dev` (HMR + stack frames).
  allowedDevOrigins: ["172.16.164.192"],
  serverExternalPackages: [
    "@prisma/client",
    "pg",
    "@prisma/adapter-pg",
    "@sparticuz/chromium-min",
    "puppeteer-core",
  ],
};

export default nextConfig;
