/**
 * Locale-aware date/time formatting helpers.
 *
 * Centralized so every list, card, and audit log renders dates consistently
 * — and so swapping locale or format is a one-line change, not a 30-file
 * find/replace. Wraps Intl.DateTimeFormat via `toLocale*` (same engine).
 */

type DateInput = Date | string | number | null | undefined;

function toDate(input: DateInput): Date | null {
  if (input == null) return null;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(input: DateInput): string {
  const d = toDate(input);
  if (!d) return "—";
  return d.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function formatDateTime(input: DateInput): string {
  const d = toDate(input);
  if (!d) return "—";
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(input: DateInput): string {
  const d = toDate(input);
  if (!d) return "—";
  return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}
