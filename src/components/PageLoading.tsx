import { Spinner } from "@/components/Spinner";

/**
 * Full-segment fallback rendered by a route's `loading.tsx` while its page
 * (and any server data it awaits) is still loading — keeps navigations from
 * looking frozen and stops impatient re-clicks on the link/button that got
 * you here.
 */
export function PageLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <main className="page-shell flex items-center justify-center bg-background px-4">
      <div className="flex flex-col items-center gap-3 text-muted">
        <Spinner className="size-8 text-accent" />
        <p className="text-sm font-medium">{label}</p>
      </div>
    </main>
  );
}
