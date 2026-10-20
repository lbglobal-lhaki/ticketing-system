import Link from "next/link";
import { notFound } from "next/navigation";
import { ServiceTabs } from "@/components/ServiceTabs";
import { cargoMoneySnapshot } from "@/lib/cargo/gst";
import { extractCargoShipment, type CargoAnswers } from "@/lib/cargo/parties";
import { formatKg } from "@/lib/cargo/capacity";
import { formatFlightDateTime } from "@/lib/datetime";
import { prisma } from "@/lib/db";
import { airportCity } from "@/lib/format";
import { getBankTransferDetails } from "@/lib/payments/bank";
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
  const money = cargoMoneySnapshot(cargo);
  const confirmed =
    cargo.paid &&
    cargo.paymentStatus === "paid" &&
    cargo.bookingStatus === "confirmed";

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
    {
      label: "Weight option",
      value: cargo.productName
        ? cargo.productName.includes("+")
          ? `${cargo.productName} · ${formatKg(cargo.weightKg)}`
          : cargo.productName
        : formatKg(cargo.weightKg),
    },
    {
      label: "Type of goods",
      value:
        String(
          (cargo.answers as CargoAnswers)?.["Tick all that apply"] ?? "",
        ).trim() ||
        cargo.productName ||
        "—",
    },
    { label: "Sender", value: shipment.sender.name },
    { label: "Receiver", value: shipment.receiver.name },
  ];

  if (money.totalCents > 0) {
    if (money.gstCents > 0) {
      rows.push(
        { label: "Cargo charges excluding GST", value: formatAud(money.freightCents) },
        { label: "GST (10%)", value: formatAud(money.gstCents) },
      );
    }
    rows.push({
      label: confirmed ? "Amount paid" : "Total including GST",
      value: formatAud(money.totalCents),
    });
  }

  const paymentMethod = String(
    (cargo.answers as CargoAnswers)?.["Payment Method"] ?? "",
  );
  const wantsBank = /bank/i.test(paymentMethod) && !confirmed;
  const bank = wantsBank ? getBankTransferDetails() : null;

  return (
    <>
      <ServiceTabs active="cargo" />
      <main className="page-shell bg-background pb-safe">
        <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
          <div className="rounded-2xl border border-line bg-white p-6 shadow-[0_8px_28px_rgba(15,23,42,0.06)] sm:p-9">
            <span className="badge-info inline-flex items-center px-3 py-1 text-xs font-semibold">
              {confirmed ? "Booking confirmed" : "Booking request received"}
            </span>
            <h1 className="mt-4 font-[family-name:var(--font-syne)] text-2xl font-bold tracking-tight text-accent-deep sm:text-3xl">
              {confirmed
                ? "Your cargo booking is confirmed"
                : "Booking Request Received"}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {confirmed
                ? "Payment has been verified. Keep this booking reference for drop-off."
                : "Your cargo booking has been received successfully."}
            </p>
            <p className="mt-2 text-sm text-muted">
              Your booking reference is{" "}
              <span className="font-medium text-foreground">
                {cargo.parcelNumber}
              </span>
              .
              {!confirmed
                ? ` An acknowledgement and invoice will be emailed${
                    shipment.sender.email ? ` to ${shipment.sender.email}` : ""
                  }. Your booking will be officially confirmed once payment has been received and verified.`
                : shipment.sender.email
                  ? ` We emailed the official confirmation to ${shipment.sender.email}.`
                  : ""}
            </p>

            <div className="mt-6 rounded-xl border border-line bg-background px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                Booking reference
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

            {bank ? (
              <div className="mt-6 rounded-xl border border-line bg-background px-5 py-4 text-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                  Pay by bank transfer
                </p>
                <p className="mt-2 text-muted">
                  Transfer {formatAud(money.totalCents)} and use{" "}
                  <span className="font-medium text-foreground">
                    {cargo.parcelNumber}
                  </span>{" "}
                  as the reference.
                </p>
                <dl className="mt-3 space-y-1.5">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Account name</dt>
                    <dd className="font-medium">{bank.accountName}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">BSB</dt>
                    <dd className="font-medium">{bank.bsb}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Account number</dt>
                    <dd className="font-medium">{bank.accountNumber}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Bank</dt>
                    <dd className="font-medium">{bank.bankName}</dd>
                  </div>
                </dl>
              </div>
            ) : null}

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
