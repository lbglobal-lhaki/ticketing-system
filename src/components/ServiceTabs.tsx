import Link from "next/link";

const TABS = [
  { id: "flights", label: "Passenger flights", href: "/" },
  { id: "cargo", label: "Air cargo", href: "/cargo" },
] as const;

export type ServiceTabId = (typeof TABS)[number]["id"];

/** Top-level switcher between the two things we sell on the same aircraft. */
export function ServiceTabs({ active }: { active: ServiceTabId }) {
  return (
    <div className="border-b border-line bg-surface/70 backdrop-blur-sm">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div
          className="flex gap-6"
          role="tablist"
          aria-label="Booking type"
        >
          {TABS.map((tab) => {
            const isActive = tab.id === active;
            return (
              <Link
                key={tab.id}
                href={tab.href}
                role="tab"
                aria-selected={isActive}
                className={`relative inline-flex min-h-12 items-center pb-px text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                  isActive
                    ? "text-accent-deep"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {tab.label}
                {isActive ? (
                  <span className="absolute inset-x-0 bottom-0 h-[3px] rounded-full bg-[linear-gradient(90deg,#2563EB_0%,#DC2626_100%)]" />
                ) : null}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
