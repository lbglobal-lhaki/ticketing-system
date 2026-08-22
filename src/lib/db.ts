import dns from "node:dns";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { databaseHost, resolveDatabaseUrl } from "@/lib/databaseUrl";

dns.setDefaultResultOrder("ipv4first");

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: Pool | undefined;
  prismaSchemaVersion: string | undefined;
};

/** Bump when Prisma models change so hot-reload drops a stale client. */
const PRISMA_SCHEMA_VERSION = "admin-login-guard-pi-unique-v1";

function isTransientDbError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /timeout exceeded when trying to connect|Timed out fetching a new connection|server has closed the connection|connection terminated|Connection refused|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|connect ECONNREFUSED|Cannot use a pool after calling end/i.test(
    msg,
  );
}

function createPool() {
  const connectionString = resolveDatabaseUrl();
  if (!connectionString) {
    throw new Error("DATABASE_URL or DATABASE_PUBLIC_URL is not set");
  }

  const host = databaseHost(connectionString);
  const onVercel = Boolean(process.env.VERCEL);
  if (onVercel && host.endsWith(".railway.internal")) {
    throw new Error(
      "Vercel is using Railway's private hostname. Set DATABASE_PUBLIC_URL to the public TCP URL (*.proxy.rlwy.net).",
    );
  }

  // Railway's TCP proxy drops idle sockets. Recycle clients before it does,
  // but never call pool.end() while the serverless instance is still serving
  // — the header cart query and the page query share this pool.
  const pool = new Pool({
    connectionString,
    max: onVercel ? 1 : 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 20_000,
    allowExitOnIdle: true,
    keepAlive: true,
    ssl: { rejectUnauthorized: false },
  });

  pool.on("error", (err) => {
    console.error("[db] unexpected idle client error", err.message);
  });

  return pool;
}

function createPrismaClient(pool: Pool) {
  const adapter = new PrismaPg(pool, {
    onPoolError: (err) => console.error("[db] pool error", err.message),
    onConnectionError: (err) =>
      console.error("[db] connection error", err.message),
  });
  return new PrismaClient({ adapter });
}

function initPrismaClient() {
  globalForPrisma.pgPool = createPool();
  globalForPrisma.prisma = createPrismaClient(globalForPrisma.pgPool);
  globalForPrisma.prismaSchemaVersion = PRISMA_SCHEMA_VERSION;
  return globalForPrisma.prisma;
}

function poolIsEnded(pool: Pool | undefined) {
  return Boolean(pool && (pool as Pool & { ended?: boolean }).ended);
}

function getPrisma(): PrismaClient {
  if (poolIsEnded(globalForPrisma.pgPool)) {
    globalForPrisma.pgPool = undefined;
    globalForPrisma.prisma = undefined;
  }

  const client = globalForPrisma.prisma as
    | (PrismaClient & {
        invoice?: unknown;
        charterFareProduct?: unknown;
        cargoSubmission?: unknown;
        cargoEmailNotice?: unknown;
        deletedRecord?: unknown;
        adminLoginGuard?: unknown;
      })
    | undefined;
  const stale =
    !client ||
    !globalForPrisma.pgPool ||
    globalForPrisma.prismaSchemaVersion !== PRISMA_SCHEMA_VERSION ||
    typeof client.invoice === "undefined" ||
    typeof client.charterFareProduct === "undefined" ||
    typeof client.cargoSubmission === "undefined" ||
    typeof client.cargoEmailNotice === "undefined" ||
    typeof client.deletedRecord === "undefined" ||
    typeof client.adminLoginGuard === "undefined";

  if (stale) {
    initPrismaClient();
  }

  return globalForPrisma.prisma!;
}

/**
 * Always resolves to the current client. Hot-reload replaces the underlying
 * instance; a plain `export const prisma = getPrisma()` would keep pointing
 * at the dead one.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrisma();
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(client)
      : value;
  },
});

/** Retry a DB call once on a dropped Railway/proxy socket — same pool. */
export async function withDbRetry<T>(
  fn: (db: PrismaClient) => Promise<T>,
): Promise<T> {
  try {
    return await fn(getPrisma());
  } catch (error) {
    if (!isTransientDbError(error)) throw error;
    console.warn("[db] transient connection error — retrying once");
    return fn(getPrisma());
  }
}
