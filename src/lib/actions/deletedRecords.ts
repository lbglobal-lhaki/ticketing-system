"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/adminAuth";
import { prisma } from "@/lib/db";

function deletedFail(message: string): never {
  redirect(`/admin?tab=deleted&error=${encodeURIComponent(message)}`);
}

/**
 * Permanently erases one or more entries from the "Deleted" audit log.
 *
 * Unlike every other delete action in the dashboard, this doesn't create a
 * new audit trail entry — the whole point is to actually free up database
 * storage (JSON snapshots add up once a lot of history piles up), so once
 * this runs there is no record left anywhere. Accepts one or many `id`
 * fields, powering both the row "Delete forever" button and bulk-select.
 */
export async function purgeDeletedRecordAction(formData: FormData) {
  await requireAdmin();

  const ids = Array.from(
    new Set(formData.getAll("id").map((v) => String(v).trim()).filter(Boolean)),
  );
  if (ids.length === 0) deletedFail("Missing record id");

  const { count } = await prisma.deletedRecord.deleteMany({
    where: { id: { in: ids } },
  });
  if (count === 0) deletedFail("Record(s) not found — already purged?");

  revalidatePath("/admin");
  redirect(
    `/admin?tab=deleted&saved=${count > 1 ? "deleted-records-purged" : "deleted-record-purged"}`,
  );
}
