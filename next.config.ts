import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@prisma/client",
    "pg",
    "@prisma/adapter-pg",
    "@sparticuz/chromium-min",
    "puppeteer-core",
  ],
};

export default nextConfig;
