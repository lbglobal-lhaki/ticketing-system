/**
 * Minimal class-name joiner. The project has no `clsx`/`tailwind-merge`
 * dependency and the UI work does not warrant adding one — falsy values are
 * dropped and the rest are joined, which is all the primitives need.
 */
/** `false | 0 | ""` all appear from `cond && "class"` guards in JSX. */
export type ClassValue = string | false | 0 | 0n | null | undefined;

export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
