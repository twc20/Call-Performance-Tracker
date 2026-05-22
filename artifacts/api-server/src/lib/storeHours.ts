// Store operating hours and after-hours classification.
//
// All Delta Tire / A-J Tires stores: Mon-Fri 8am-5pm Mountain Time.
// Gallup, Farmington, and A-J Tires also open Saturdays 8am-5pm.
// All locations closed Sundays.

const TZ = "America/Denver";

const SATURDAY_OPEN_STORES = new Set([
  "Delta Tire - Gallup",
  "Delta Tire - Farmington",
  "A-J Tires & Auto Center",
]);

interface StoreLocalTime {
  weekday: number; // 0=Sun, 1=Mon, ..., 6=Sat
  hour: number;    // 0-23
  minute: number;  // 0-59
}

function getStoreLocal(d: Date): StoreLocalTime {
  // Intl.DateTimeFormat with timeZone yields the wall-clock time for that zone.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = wdMap[parts.find((p) => p.type === "weekday")?.value ?? "Mon"] ?? 1;
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { weekday, hour, minute };
}

export function isAfterHours(storeName: string | null, callDatetime: Date): boolean {
  const { weekday, hour, minute } = getStoreLocal(callDatetime);
  // Sunday: always closed
  if (weekday === 0) return true;
  // Saturday: only some stores open
  if (weekday === 6) {
    if (!storeName || !SATURDAY_OPEN_STORES.has(storeName)) return true;
  }
  // 8:00 AM (inclusive) to 5:00 PM (exclusive)
  const minutesOfDay = hour * 60 + minute;
  const open = 8 * 60;
  const close = 17 * 60;
  return minutesOfDay < open || minutesOfDay >= close;
}
