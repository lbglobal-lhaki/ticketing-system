import {
  SPECIAL_ASSISTANCE_OTHER_MAX,
  parseSpecialAssistance,
} from "@/lib/booking/specialAssistance";

const checkboxClass =
  "mt-1 size-4 shrink-0 accent-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2";

export function SpecialAssistanceFields({
  initial,
  fieldClass,
}: {
  initial?: unknown;
  fieldClass: string;
}) {
  const value = parseSpecialAssistance(initial);
  return (
    <div className="space-y-3 sm:col-span-2">
      <label className="flex items-start gap-3 text-sm text-foreground">
        <input
          type="checkbox"
          name="specialAssistanceWheelchair"
          defaultChecked={value.wheelchair}
          className={checkboxClass}
        />
        <span>Wheelchair assistance</span>
      </label>
      <label className="flex items-start gap-3 text-sm text-foreground">
        <input
          type="checkbox"
          name="specialAssistanceLanguage"
          defaultChecked={value.language}
          className={checkboxClass}
        />
        <span>Assistance for non-English-speaking passengers</span>
      </label>
      <label className="block text-sm">
        <span className="font-medium text-foreground">Other special needs</span>
        <textarea
          name="specialAssistanceOther"
          defaultValue={value.other}
          maxLength={SPECIAL_ASSISTANCE_OTHER_MAX}
          rows={3}
          className={fieldClass}
          placeholder="Any other requirements we should know about…"
        />
        <span className="mt-1 block text-xs text-muted">
          Optional · up to {SPECIAL_ASSISTANCE_OTHER_MAX} characters
        </span>
      </label>
    </div>
  );
}
