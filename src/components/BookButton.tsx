import { startCheckoutFormAction } from "@/lib/actions/booking";
import { BookSubmitButton } from "@/components/BookSubmitButton";

export function BookButton({
  flightId,
  returnFlightId,
  fareProductId,
  adults = 1,
  children = 0,
  infants = 0,
  disabled,
  label = "Book at this price",
  buttonClassName,
}: {
  flightId: string;
  returnFlightId?: string;
  fareProductId?: string;
  adults?: number;
  children?: number;
  infants?: number;
  disabled?: boolean;
  label?: string;
  buttonClassName?: string;
}) {
  return (
    <form action={startCheckoutFormAction} className="w-full">
      <input type="hidden" name="flightId" value={flightId} />
      {returnFlightId ? (
        <input type="hidden" name="returnFlightId" value={returnFlightId} />
      ) : null}
      {fareProductId ? (
        <input type="hidden" name="fareProductId" value={fareProductId} />
      ) : null}
      <input type="hidden" name="adults" value={String(Math.max(1, adults))} />
      <input
        type="hidden"
        name="children"
        value={String(Math.max(0, children))}
      />
      <input
        type="hidden"
        name="infants"
        value={String(Math.max(0, infants))}
      />
      <BookSubmitButton
        disabled={disabled}
        label={label}
        className={buttonClassName}
      />
    </form>
  );
}
