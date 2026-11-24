export type HoursEntry = { days: number[]; start: string; end: string };

// Gün numarası: 0 Pazar, 1 Pazartesi ... 6 Cumartesi
export const DAYS = [
  { d: 1, label: "Pazartesi" },
  { d: 2, label: "Salı" },
  { d: 3, label: "Çarşamba" },
  { d: 4, label: "Perşembe" },
  { d: 5, label: "Cuma" },
  { d: 6, label: "Cumartesi" },
  { d: 0, label: "Pazar" },
];

export function hoursForDay(hours: HoursEntry[] | null | undefined, day: number) {
  return (hours ?? []).find((h) => h.days.includes(day));
}

/** Formdaki gün satırlarından (d1_open, d1_start, d1_end ...) çalışma saatlerini üretir. */
export function buildHours(form: FormData): HoursEntry[] {
  const out: HoursEntry[] = [];
  for (const { d } of DAYS) {
    if (form.get(`d${d}_open`) !== "on") continue;
    const start = String(form.get(`d${d}_start`) ?? "");
    const end = String(form.get(`d${d}_end`) ?? "");
    if (start && end && start < end) out.push({ days: [d], start, end });
  }
  return out;
}

export function isOpenNow(hours: HoursEntry[] | null | undefined, tz: string, now = new Date()) {
  if (!hours || hours.length === 0) return true;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const wd = map[parts.find((p) => p.type === "weekday")?.value ?? "Mon"];
  let hh = parts.find((p) => p.type === "hour")?.value ?? "00";
  if (hh === "24") hh = "00";
  const cur = `${hh}:${parts.find((p) => p.type === "minute")?.value ?? "00"}`;
  return hours.some((h) => h.days.includes(wd) && cur >= h.start && cur < h.end);
}
