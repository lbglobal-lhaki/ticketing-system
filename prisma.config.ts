import "dotenv/config";
import { defineConfig } from "prisma/config";

function databaseUrl() {
  const url = process.env["DATABASE_URL"] ?? "";
  if (!url) return url;
  if (/[?&]sslmode=/i.test(url)) return url;
  return url.includes("?") ? `${url}&sslmode=require` : `${url}?sslmode=require`;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: databaseUrl(),
  },
});
