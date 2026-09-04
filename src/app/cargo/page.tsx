import type { Metadata } from "next";
import { ServiceTabs } from "@/components/ServiceTabs";
import {
  CargoBookingForm,
  type CargoFlightOption,
} from "@/components/cargo/CargoBookingForm";
import { flightPayloadFromRow, formatKg } from "@/lib/cargo/capacity";
import { formatFlightDate } from "@/lib/datetime";
import { prisma } from "@/lib/db";
import { airportCity } from "@/lib/format";
import { getSiteSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Air cargo booking",
  description:
    "Book air cargo on our Perth–Paro charter. Space is confirmed against a specific departure, so you know it is on the aircraft before you drop off.",
};

export const dynamic = "force-dynamic";

const HIGHLIGHTS = [
  {
    title: "Space confirmed on a real flight",
    body: "You pick the departure, and we hold the weight against that aircraft's payload — not a waitlist.",
  },
  {
    title: "One form, no attachments",
    body: "Sender, receiver, contents and compliance in a single pass. We generate the cargo declaration for you.",
  },
  {
    title: "A parcel number straight away",
    body: "Quote your parcel number at drop-off and in any email. Our cargo team confirms pricing from there.",
  },
];

export default async function CargoPage() {
  const settings = await getSiteSettings();

  const now = new Date();
  const flights = await prisma.flight.findMany({
    where: { active: true, departureAt: { gte: now } },
    orderBy: { departureAt: "asc" },
    take: 40,
  });

  const options: CargoFlightOption[] = flights
    .map((flight) => {
      const payload = flightPayloadFromRow(flight, settings.passengerPayloadKg);
      return {
        id: flight.id,
        route: `${airportCity(flight.origin)} → ${airportCity(flight.destination)}`,
        departureLabel: formatFlightDate(flight.departureAt),
        flightNumber: `${flight.airline} ${flight.flightNumber}`.trim(),
        availableKg: payload.availableKg,
        payloadKg: payload.payloadKg,
        usedPct: payload.usedPct,
      };
    })
    .filter((option) => option.availableKg > 0);

  const totalAvailableKg = options.reduce((sum, o) => sum + o.availableKg, 0);

  return (
    <>
      <ServiceTabs active="cargo" />
      <main className="page-shell bg-background pb-safe">
        <section className="theme-banner">
          <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">
              Air cargo
            </p>
            <h1 className="mt-3 max-w-2xl font-[family-name:var(--font-syne)] text-3xl font-bold tracking-tight text-white sm:text-5xl">
              Send cargo on the same aircraft as our passengers
            </h1>
            <p className="mt-4 max-w-2xl text-sm text-white/85 sm:text-base">
              Every departure carries a fixed payload shared between passengers
              and freight. Book below and we reserve your weight on that
              specific flight.
            </p>
            {options.length > 0 ? (
              <p className="mt-6 inline-flex items-center rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm">
                {formatKg(totalAvailableKg)} available across {options.length}{" "}
                upcoming {options.length === 1 ? "departure" : "departures"}
              </p>
            ) : null}
          </div>
        </section>

        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
          <div className="grid gap-4 sm:grid-cols-3">
            {HIGHLIGHTS.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-line bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.06)]"
              >
                <h2 className="font-[family-name:var(--font-syne)] text-base font-bold text-accent-deep">
                  {item.title}
                </h2>
                <p className="mt-2 text-sm text-muted">{item.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 max-w-3xl">
            <h2 className="heading-gradient font-[family-name:var(--font-syne)] text-2xl font-bold tracking-tight sm:text-3xl">
              Cargo booking form
            </h2>
            <p className="mt-2 text-sm text-muted">
              Six short steps. Fields marked with an asterisk are required, and
              nothing is submitted until you press the button at the bottom.
            </p>
          </div>

          <div className="mt-6 max-w-3xl">
            <CargoBookingForm
              flights={options}
              ratePerKgCents={settings.cargoRatePerKgCents}
              minChargeCents={settings.cargoMinChargeCents}
            />
          </div>
        </div>
      </main>
    </>
  );
}
