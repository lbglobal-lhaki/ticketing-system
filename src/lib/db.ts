import dns from "node:dns";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

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

function dbHost(connectionString: string): string {
  try {
    return new URL(connectionString.replace(/^postgres(ql)?:/i, "https:"))
      .hostname;
  } catch {
    return "";
  }
}

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const host = dbHost(connectionString);
  const onVercel = Boolean(process.env.VERCEL);
  if (onVercel && host.endsWith(".railway.internal")) {
    throw new Error(
      "DATABASE_URL uses Railway's private hostname, which Vercel cannot reach. Set it to the public TCP URL (*.proxy.rlwy.net) with ?sslmode=require.",
    );
  }

  // Railway's TCP proxy (*.proxy.rlwy.net) drops idle sockets. Keep the pool
  // small and recycle connections before the proxy does, otherwise the next
  // query fails with "Server has closed the connection".
  // On Vercel each lambda has its own pool — max 5 per instance exhausts
  // Railway's connection cap and surfaces as "timeout exceeded when trying to connect".
  const pool = new Pool({
    connectionString,
    max: onVercel ? 1 : 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: onVercel ? 8_000 : 15_000,
    allowExitOnIdle: true,
    keepAlive: true,
    ssl:
      host.includes("proxy.rlwy.net") || host.includes("railway.app")
        ? { rejectUnauthorized: false }
        : undefined,
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
    resetPrismaClient();
  }

  return globalForPrisma.prisma!;
}

function wrapMaybePromise(run: () => unknown): unknown {
  try {
    const result = run();
    if (result && typeof (result as Promise<unknown>).then === "function") {
      return (result as Promise<unknown>).catch((error: unknown) => {
        if (!isTransientDbError(error)) throw error;
        console.warn("[db] connection failed — recreating pool and retrying once");
        resetPrismaClient();
        return run();
      });
    }
    return result;
  } catch (error) {
    if (!isTransientDbError(error)) throw error;
    console.warn("[db] connection failed — recreating pool and retrying once");
    resetPrismaClient();
    return run();
  }
}

/**
 * Always resolves to the current client. Hot-reload / reconnect replaces the
 * underlying instance; a plain `export const prisma = getPrisma()` would keep
 * pointing at the dead one.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrisma();
    const value = Reflect.get(client as object, prop);
    if (typeof value === "function") {
      return (...args: unknown[]) =>
        wrapMaybePromise(() => {
          const fresh = getPrisma();
          return (Reflect.get(fresh as object, prop) as Function).apply(
            fresh,
            args,
          );
        });
    }
    if (value && typeof value === "object") {
      return new Proxy(value, {
        get(_model, method) {
          const fn = Reflect.get(
            Reflect.get(getPrisma() as object, prop) as object,
            method,
          );
          if (typeof fn !== "function") return fn;
          return (...args: unknown[]) =>
            wrapMaybePromise(() => {
              const model = Reflect.get(getPrisma() as object, prop) as object;
              return (Reflect.get(model, method) as Function).apply(model, args);
            });
        },
      });
    }
    return value;
  },
});

/** Run a DB call; on a dropped Railway/proxy socket, rebuild the pool once and retry. */
export async function withDbRetry<T>(
  fn: (db: PrismaClient) => Promise<T>,
): Promise<T> {
  try {
    return await fn(getPrisma());
  } catch (error) {
    if (!isTransientDbError(error)) throw error;
    console.warn("[db] connection closed — recreating pool and retrying once");
    resetPrismaClient();
    return fn(getPrisma());
  }
}
