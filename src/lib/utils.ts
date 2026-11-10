import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Base site URL for canonical metadata, Open Graph tags, and sharing URLs.
 * Configurable via VITE_SITE_URL env variable with default to https://www.pairuporleave.com.
 */
export const SITE_URL: string =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SITE_URL
    ? (import.meta.env.VITE_SITE_URL as string)
    : "https://www.pairuporleave.com"
  ).replace(/\/$/, "");

export function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  }
  return num.toLocaleString("en-US");
}

export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString));
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

/**
 * Converts a UTC ISO string (e.g. "2026-12-02T04:59:00.000Z")
 * to a local date-time string in "YYYY-MM-DDTHH:mm" format for <input type="datetime-local">
 * in the specified IANA timeZone (default: "America/New_York").
 */
export function utcIsoToZonedLocal(utcIso: string, timeZone = "America/New_York"): string {
  if (!utcIso) return "";
  const date = new Date(utcIso);
  if (isNaN(date.getTime())) return "";
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value || "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

/**
 * Converts an input string in "YYYY-MM-DDTHH:mm" format representing nominal local time
 * in the specified IANA timeZone into an authoritative UTC ISO string (e.g. "2026-12-02T04:59:00.000Z").
 * Accurately converges across standard time and daylight saving time (DST) shifts.
 */
export function zonedLocalToUtcIso(localString: string, timeZone = "America/New_York"): string {
  if (!localString) return "";
  const [datePart, timePart = "00:00"] = localString.split("T");
  if (!datePart) return "";
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hour) || isNaN(minute)) return "";

  const guessUtc = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  let testTime = guessUtc;
  for (let i = 0; i < 3; i++) {
    const parts = formatter.formatToParts(new Date(testTime));
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value || "00";
    const h = get("hour") === "24" ? 0 : Number(get("hour"));
    const m = Number(get("minute"));
    const d = Number(get("day"));
    const mo = Number(get("month"));
    const y = Number(get("year"));

    const zonedAsUtc = Date.UTC(y, mo - 1, d, h, m);
    const diff = zonedAsUtc - guessUtc;
    if (diff === 0) break;
    testTime -= diff;
  }
  return new Date(testTime).toISOString();
}

/**
 * Formats a UTC ISO date string into a user-friendly string with timezone name.
 * e.g. "Tue, Dec 1, 2026, 11:59 PM EST"
 */
export function formatZonedDate(
  isoDate: string,
  timeZone = "America/New_York",
  options?: Intl.DateTimeFormatOptions
): string {
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return isoDate;
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
      ...options,
    }).format(d);
  } catch {
    return isoDate;
  }
}
