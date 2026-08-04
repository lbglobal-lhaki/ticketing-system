import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

export type DeletedEntityType = "flight" | "booking" | "invoice" | "cargo";

type PrismaLike = typeof prisma | Prisma.TransactionClient;

/**
 * Records a permanent-deletion event for the admin "Deleted" tab.
 *
 * Always call this BEFORE the row is actually deleted (and inside the same
 * transaction as the delete, when there is one) so the audit trail and the
 * delete succeed or fail together.
 */
export async function recordDeletion(
  input: {
    entityType: DeletedEntityType;
    entityId: string;
    label: string;
    summary?: string;
    /** Full row (± light relations). Dates are normalised to ISO strings. */
    snapshot: unknown;
    deletedBy?: string;
  },
  client: PrismaLike = prisma,
) {
  // Json columns can't hold Date/undefined — round-trip through JSON to get
  // a plain, storable snapshot (Dates become ISO strings).
  const safeSnapshot = JSON.parse(
    JSON.stringify(input.snapshot ?? {}, (_key, value) =>
      value === undefined ? null : value,
    ),
  );

  await client.deletedRecord.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      label: input.label,
      summary: input.summary ?? "",
      snapshot: safeSnapshot as Prisma.InputJsonValue,
      deletedBy: input.deletedBy ?? "admin",
    },
  });
}
