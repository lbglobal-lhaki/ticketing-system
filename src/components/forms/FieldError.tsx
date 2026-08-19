import { cn } from "@/components/ui/cn";

/** Red hint under a control. Pair with `aria-invalid` on the input. */
export function FieldError({ error }: { error?: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-xs font-medium text-accent-red">
      {error}
    </p>
  );
}

export function fieldInvalidClass(error?: string | null) {
  return error ? "border-accent-red/70" : "";
}

export function labeledControlClass(
  base: string,
  error?: string | null,
) {
  return cn(base, fieldInvalidClass(error));
}
