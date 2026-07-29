import { prisma } from "@/lib/db";

export type SystemAnalytics = {
  generatedAt: string;
  flights: {
    total: number;
    active: number;
    inactive: number;
    seatsRemaining: number;
    seatsSold: number;
    upcoming: number;
  };
  bookings: {
    total: number;
    confirmed: number;
    pendingPayment: number;
    cancelled: number;
    holdExpired: number;
    online: number;
    walkIn: number;
    ticketsSold: number;
  };
  sales: {
    /** Confirmed bookings + paid invoices amount (booking.amountPaidCents where confirmed). */
    revenueCents: number;
    pendingCents: number;
    paidInvoiceCents: number;
    unpaidInvoiceCents: number;
    avgTicketCents: number;
  };
  payments: {
    unpaidInvoices: number;
    paidInvoices: number;
    bankPendingBookings: number;
    cardPaidBookings: number;
  };
  cargo: {
    total: number;
    newCount: number;
    reviewed: number;
    closed: number;
    paid: number;
    unpaid: number;
  };
  recentBookings: Array<{
    id: string;
    bookingRef: string;
    passengerName: string;
    status: string;
    amountPaidCents: number;
    createdAt: string;
    route: string;
  }>;
  upcomingFlights: Array<{
    id: string;
    flightNumber: string;
    route: string;
    departureAt: string;
    remainingSeats: number;
    totalSeats: number;
    cabinClass: string;
  }>;
};

export async function getSystemAnalytics(): Promise<SystemAnalytics> {
  const now = new Date();

  const [
    flightGroups,
    seatAgg,
    upcomingCount,
    bookingGroups,
    ticketAgg,
    revenueConfirmed,
    revenuePending,
    invoiceGroups,
    paidInvoiceSum,
    unpaidInvoiceSum,
    bankPending,
    cardPaid,
    cargoGroups,
    cargoPaidGroups,
    recentBookings,
    upcomingFlights,
  ] = await Promise.all([
    prisma.flight.groupBy({
      by: ["active"],
      _count: { _all: true },
    }),
    prisma.flight.aggregate({
      _sum: { remainingSeats: true, totalSeats: true },
    }),
    prisma.flight.count({
      where: { active: true, departureAt: { gte: now } },
    }),
    prisma.booking.groupBy({
      by: ["status", "source"],
      _count: { _all: true },
      _sum: { seatsBooked: true, amountPaidCents: true },
    }),
    prisma.booking.aggregate({
      where: { status: { in: ["confirmed", "pending_payment"] } },
      _sum: { seatsBooked: true },
      _count: { _all: true },
    }),
    prisma.booking.aggregate({
      where: { status: "confirmed" },
      _sum: { amountPaidCents: true },
      _count: { _all: true },
    }),
    prisma.booking.aggregate({
      where: { status: "pending_payment" },
      _sum: { amountPaidCents: true },
    }),
    prisma.invoice.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.invoice.aggregate({
      where: { status: "paid" },
      _sum: { amountCents: true },
    }),
    prisma.invoice.aggregate({
      where: { status: "unpaid" },
      _sum: { amountCents: true },
    }),
    prisma.booking.count({
      where: {
        status: "pending_payment",
        paymentMethod: "bank_transfer",
      },
    }),
    prisma.booking.count({
      where: {
        status: "confirmed",
        paymentMethod: "card",
      },
    }),
    prisma.cargoSubmission.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.cargoSubmission.groupBy({
      by: ["paid"],
      _count: { _all: true },
    }),
    prisma.booking.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        flight: {
          select: {
            origin: true,
            destination: true,
            flightNumber: true,
          },
        },
      },
    }),
    prisma.flight.findMany({
      where: { active: true, departureAt: { gte: now } },
      orderBy: { departureAt: "asc" },
      take: 6,
      select: {
        id: true,
        flightNumber: true,
        origin: true,
        destination: true,
        departureAt: true,
        remainingSeats: true,
        totalSeats: true,
        cabinClass: true,
      },
    }),
  ]);

  let active = 0;
  let inactive = 0;
  for (const g of flightGroups) {
    if (g.active) active = g._count._all;
    else inactive = g._count._all;
  }

  const seatsRemaining = seatAgg._sum.remainingSeats ?? 0;
  const seatsTotal = seatAgg._sum.totalSeats ?? 0;
  const seatsSold = Math.max(0, seatsTotal - seatsRemaining);

  let confirmed = 0;
  let pendingPayment = 0;
  let cancelled = 0;
  let holdExpired = 0;
  let online = 0;
  let walkIn = 0;
  let bookingTotal = 0;

  for (const g of bookingGroups) {
    bookingTotal += g._count._all;
    if (g.status === "confirmed") confirmed += g._count._all;
    if (g.status === "pending_payment") pendingPayment += g._count._all;
    if (g.status === "cancelled") cancelled += g._count._all;
    if (g.status === "hold_expired") holdExpired += g._count._all;
    if (g.source === "online") online += g._count._all;
    if (g.source === "walk_in") walkIn += g._count._all;
  }

  let unpaidInvoices = 0;
  let paidInvoices = 0;
  for (const g of invoiceGroups) {
    if (g.status === "unpaid") unpaidInvoices = g._count._all;
    if (g.status === "paid") paidInvoices = g._count._all;
  }

  let cargoNew = 0;
  let cargoReviewed = 0;
  let cargoClosed = 0;
  let cargoTotal = 0;
  for (const g of cargoGroups) {
    cargoTotal += g._count._all;
    if (g.status === "new") cargoNew = g._count._all;
    if (g.status === "reviewed") cargoReviewed = g._count._all;
    if (g.status === "closed") cargoClosed = g._count._all;
  }

  let cargoPaid = 0;
  let cargoUnpaid = 0;
  for (const g of cargoPaidGroups) {
    if (g.paid) cargoPaid = g._count._all;
    else cargoUnpaid = g._count._all;
  }

  const revenueCents = revenueConfirmed._sum.amountPaidCents ?? 0;
  const confirmedCount = revenueConfirmed._count._all || 0;

  return {
    generatedAt: now.toISOString(),
    flights: {
      total: active + inactive,
      active,
      inactive,
      seatsRemaining,
      seatsSold,
      upcoming: upcomingCount,
    },
    bookings: {
      total: bookingTotal,
      confirmed,
      pendingPayment,
      cancelled,
      holdExpired,
      online,
      walkIn,
      ticketsSold: ticketAgg._sum.seatsBooked ?? 0,
    },
    sales: {
      revenueCents,
      pendingCents: revenuePending._sum.amountPaidCents ?? 0,
      paidInvoiceCents: paidInvoiceSum._sum.amountCents ?? 0,
      unpaidInvoiceCents: unpaidInvoiceSum._sum.amountCents ?? 0,
      avgTicketCents:
        confirmedCount > 0 ? Math.round(revenueCents / confirmedCount) : 0,
    },
    payments: {
      unpaidInvoices,
      paidInvoices,
      bankPendingBookings: bankPending,
      cardPaidBookings: cardPaid,
    },
    cargo: {
      total: cargoTotal,
      newCount: cargoNew,
      reviewed: cargoReviewed,
      closed: cargoClosed,
      paid: cargoPaid,
      unpaid: cargoUnpaid,
    },
    recentBookings: recentBookings.map((b) => ({
      id: b.id,
      bookingRef: b.bookingRef,
      passengerName: b.passengerName,
      status: b.status,
      amountPaidCents: b.amountPaidCents,
      createdAt: b.createdAt.toISOString(),
      route: `${b.flight.origin} → ${b.flight.destination}`,
    })),
    upcomingFlights: upcomingFlights.map((f) => ({
      id: f.id,
      flightNumber: f.flightNumber,
      route: `${f.origin} → ${f.destination}`,
      departureAt: f.departureAt.toISOString(),
      remainingSeats: f.remainingSeats,
      totalSeats: f.totalSeats,
      cabinClass: f.cabinClass,
    })),
  };
}
