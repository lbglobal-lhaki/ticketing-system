import Link from "next/link";
import { notFound } from "next/navigation";
import { ServiceTabs } from "@/components/ServiceTabs";
import { extractCargoShipment, type CargoAnswers } from "@/lib/cargo/parties";
import { formatKg } from "@/lib/cargo/capacity";
import { formatFlightDateTime } from "@/lib/datetime";
import { prisma } from "@/lib/db";
import { airportCity } from "@/lib/format";
import { formatAud } from "@/lib/pricing";

export const dynamic = "force-dynamic";

export default async function CargoBookedPage({
  params,
}: {
  params: Promise<{ parcelNumber: string }>;
}) {
  const { parcelNumber } = await params;
  const cargo = await prisma.cargoSubmission.findUnique({
    where: { parcelNumber: decodeURIComponent(parcelNumber) },
    include: { flight: true },
  });
  if (!cargo) notFound();

  const shipment = extractCargoShipment({
    id: cargo.id,
    parcelNumber: cargo.parcelNumber,
    email: cargo.email,
    phone: cargo.phone,
    submitterName: cargo.submitterName,
    answers: (cargo.answers ?? {}) as CargoAnswers,
  });

  const rows: { label: string; value: string }[] = [
    {
      label: "Flight",
      value: cargo.flight
        ? `${cargo.flight.airline} ${cargo.flight.flightNumber} · ${airportCity(cargo.flight.origin)} → ${airportCity(cargo.flight.destination)}`
        : shipment.direction || "To be confirmed",
    },
    {
      label: "Departure",
      value: cargo.flight
        ? formatFlightDateTime(cargo.flight.departureAt)
        : shipment.flightDate || "To be confirmed",
    },
    { label: "Packages", value: String(cargo.pieces || shipment.packages) },
    { label: "Weight", value: formatKg(cargo.weightKg) },
    { label: "Sender", value: shipment.sender.name },
    { label: "Receiver", value: shipment.receiver.name },
  ];

  if (cargo.quotedCents > 0) {
    rows.push({
      label: "Estimated charge",
      value: formatAud(cargo.quotedCents),
    });
  }

  return (
    <>
      <ServiceTabs active="cargo" />
      <main className="page-shell bg-background pb-safe">
        <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
          <div className="rounded-2xl border border-line bg-white p-6 shadow-[0_8px_28px_rgba(15,23,42,0.06)] sm:p-9">
            <span className="badge-info inline-flex items-center px-3 py-1 text-xs font-semibold">
              Booking received
            </span>
            <h1 className="mt-4 font-[family-name:var(--font-syne)] text-2xl font-bold tracking-tight text-accent-deep sm:text-3xl">
              Your cargo is booked on this flight
            </h1>
            <p className="mt-2 text-sm text-muted">
              Keep this parcel number — quote it at drop-off and in any email
              about the shipment. Our cargo team will confirm pricing and
              drop-off details shortly.
            </p>

            <div className="mt-6 rounded-xl border border-line bg-background px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                Parcel number
              </p>
              <p className="mt-1 font-mono text-xl font-bold tracking-wide text-foreground">
                {cargo.parcelNumber}
              </p>
            </div>

            <dl className="mt-6 divide-y divide-line border-t border-line">
              {rows.map((row) => (
                <div
                  key={row.label}
                  className="flex flex-wrap items-baseline justify-between gap-2 py-3"
                >
                  <dt className="text-sm text-muted">{row.label}</dt>
                  <dd className="text-sm font-medium text-foreground">
                    {row.value || "—"}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/cargo" className="btn-cta min-h-11 px-6 text-sm">
                Book another shipment
              </Link>
              <Link
                href="/"
                className="btn-secondary inline-flex min-h-11 items-center px-6 text-sm"
              >
                Back to flights
              </Link>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
