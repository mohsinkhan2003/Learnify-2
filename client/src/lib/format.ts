import { format, formatDistanceToNowStrict, isToday, isTomorrow, isYesterday, isThisYear } from "date-fns";

/** All timestamps arrive as UTC ISO strings and are shown in the browser's local time zone. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isToday(d)) return `Today, ${format(d, "p")}`;
  if (isTomorrow(d)) return `Tomorrow, ${format(d, "p")}`;
  if (isYesterday(d)) return `Yesterday, ${format(d, "p")}`;
  return format(d, isThisYear(d) ? "EEE d MMM, p" : "d MMM yyyy, p");
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return format(d, isThisYear(d) ? "d MMM" : "d MMM yyyy");
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "never";
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
}

export function formatTime(iso: string): string {
  return format(new Date(iso), "p");
}

export function formatDuration(seconds: number): string {
  if (!seconds || seconds < 60) return seconds > 0 ? "<1 min" : "0 min";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

export function formatPercent(ratio: number | null): string {
  return ratio === null ? "—" : `${Math.round(ratio * 100)}%`;
}

/** Value for <input type="datetime-local"> in local time. */
export function toLocalInputValue(date: Date): string {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

/** Converts a datetime-local value (local wall time) to a UTC ISO string. */
export function localInputToIso(value: string): string {
  return new Date(value).toISOString();
}

export function firstName(name: string | undefined | null): string {
  return (name ?? "").trim().split(/\s+/)[0] || "there";
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}
