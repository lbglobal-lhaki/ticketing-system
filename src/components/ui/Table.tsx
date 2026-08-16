import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from "react";
import { cn } from "@/components/ui/cn";

/**
 * Presentation shell for admin tables. Sorting, filtering and pagination stay
 * wherever they already live — this only supplies the surface, the sticky
 * header, row hover and alignment helpers.
 */
export function TableWrap({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-card border border-line bg-surface shadow-ui-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Table({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <table className={cn("w-full text-left text-sm", className)}>
      {children}
    </table>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="sticky top-0 z-10 [background-image:linear-gradient(180deg,rgba(37,99,235,0.07),rgba(37,99,235,0.02))] backdrop-blur-sm">
      {children}
    </thead>
  );
}

export type ThProps = ThHTMLAttributes<HTMLTableCellElement> & {
  align?: "left" | "right";
};

export function Th({ children, align = "left", className, ...rest }: ThProps) {
  return (
    <th
      scope="col"
      className={cn(
        "whitespace-nowrap border-b border-line px-4 py-3",
        "text-xs font-semibold uppercase tracking-[0.08em] text-accent-deep",
        align === "right" && "text-right",
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-line/70">{children}</tbody>;
}

export function Tr({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <tr className={cn("transition-colors hover:bg-accent/5", className)}>
      {children}
    </tr>
  );
}

export type TdProps = TdHTMLAttributes<HTMLTableCellElement> & {
  align?: "left" | "right";
  /** Low-value columns render smaller and greyer without being removed. */
  muted?: boolean;
  numeric?: boolean;
};

export function Td({
  children,
  align = "left",
  muted,
  numeric,
  className,
  ...rest
}: TdProps) {
  return (
    <td
      className={cn(
        "px-4 py-3.5 align-top",
        align === "right" && "text-right",
        numeric && "tabular-nums",
        muted ? "text-xs text-muted" : "text-foreground",
        className,
      )}
      {...rest}
    >
      {children}
    </td>
  );
}

export function TableEmpty({
  colSpan,
  title,
  hint,
  action,
}: {
  colSpan: number;
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-14 text-center">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {hint ? (
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{hint}</p>
        ) : null}
        {action ? <div className="mt-4">{action}</div> : null}
      </td>
    </tr>
  );
}
