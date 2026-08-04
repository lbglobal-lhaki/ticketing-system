import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: Pool | undefined;
  prismaSchemaVersion: string | undefined;
};

/** Bump when Prisma models change so hot-reload drops a stale client. */
const PRISMA_SCHEMA_VERSION = "charter-pairing-v2-pool";

function isClosedConnectionError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /server has closed the connection|connection terminated|Connection refused|ECONNRESET|ETIMEDOUT|Cannot use a pool after calling end/i.test(
    msg,
  );
}

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  // Railway's TCP proxy (*.proxy.rlwy.net) drops idle sockets. Keep the pool
  // small and recycle connections before the proxy does, otherwise the next
  // query fails with "Server has closed the connection".
  const pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
    allowExitOnIdle: true,
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

async function disposePool(pool: Pool | undefined) {
  if (!pool) return;
  try {
    await pool.end();
  } catch {
    // Best-effort — pool may already be closed after a crash.
  }
}

function resetPrismaClient() {
  const oldPool = globalForPrisma.pgPool;
  globalForPrisma.pgPool = createPool();
  globalForPrisma.prisma = createPrismaClient(globalForPrisma.pgPool);
  globalForPrisma.prismaSchemaVersion = PRISMA_SCHEMA_VERSION;
  void disposePool(oldPool);
  return globalForPrisma.prisma;
}

function getPrisma(): PrismaClient {
  const client = globalForPrisma.prisma as
    | (PrismaClient & {
        invoice?: unknown;
        charterFareProduct?: unknown;
        cargoSubmission?: unknown;
        cargoEmailNotice?: unknown;
        deletedRecord?: unknown;
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
    typeof client.deletedRecord === "undefined";

  if (stale) {
    resetPrismaClient();
  }

  return globalForPrisma.prisma!;
}

/**
 * Always resolves to the current client. Hot-reload / reconnect replaces the
 * underlying instance; a plain `export const prisma = getPrisma()` would keep
 * pointing at the dead one.
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

/** Run a DB call; on a dropped Railway/proxy socket, rebuild the pool once and retry. */
export async function withDbRetry<T>(
  fn: (db: PrismaClient) => Promise<T>,
): Promise<T> {
  try {
    return await fn(getPrisma());
  } catch (error) {
    if (!isClosedConnectionError(error)) throw error;
    console.warn("[db] connection closed — recreating pool and retrying once");
    resetPrismaClient();
    return fn(getPrisma());
  }
}
