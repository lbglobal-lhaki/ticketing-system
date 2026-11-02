/** Remaining after a restore — closed fares stay at the current count. */
export function remainingAfterRestore(input: {
  remainingSeats: number;
  totalSeats: number;
  seats: number;
  salesClosed: boolean;
}) {
  if (input.seats < 1 || input.salesClosed) return input.remainingSeats;
  return Math.min(input.totalSeats, input.remainingSeats + input.seats);
}

export function salesClosedFromRemaining(remainingSeats: number) {
  return remainingSeats <= 0;
}
