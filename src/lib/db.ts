import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaSchemaVersion: string | undefined;
};

/** Bump when Prisma models change so hot-reload drops a stale client. */
const PRISMA_SCHEMA_VERSION = "cargo-submissions-v1";

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

function getPrisma(): PrismaClient {
  const client = globalForPrisma.prisma as
    | (PrismaClient & {
        invoice?: unknown;
        charterFareProduct?: unknown;
        cargoSubmission?: unknown;
      })
    | undefined;
  const stale =
    !client ||
    globalForPrisma.prismaSchemaVersion !== PRISMA_SCHEMA_VERSION ||
    typeof client.invoice === "undefined" ||
    typeof client.charterFareProduct === "undefined" ||
    typeof client.cargoSubmission === "undefined";

  if (stale) {
    globalForPrisma.prisma = createPrismaClient();
    globalForPrisma.prismaSchemaVersion = PRISMA_SCHEMA_VERSION;
  }

  return globalForPrisma.prisma!;
}

export const prisma = getPrisma();
