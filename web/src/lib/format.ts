/** Display helpers. Nothing here mutates data; the printed form on a flyer is
 *  part of the artifact and is never normalized away. */

/**
 * LOCKED FORMAT: "19 Sep 2026". Day, abbreviated month, year.
 *
 * No weekday and no commas, decided 2026-09-22. The weekday is on the flyer
 * where it belongs, and repeating it in the index made the line read as a
 * sentence rather than as data.
 *
 * The month table is explicit rather than locale-derived: en-GB renders
 * September as "Sept", which is four letters and breaks the column. Hard-coding
 * three letters also means the format cannot drift with a runtime's locale data.
 */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export function formatDate(iso: string): string {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const d = new Date(dateOnly ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function igUrl(handle: string): string {
  return `https://instagram.com/${handle.replace(/^@/, "")}`;
}

/**
 * A run of consecutive nights on one poster, written as one date.
 *
 * MADMADHOUSE sometimes prints a single flyer for a weekend: the 12.8.23 /
 * 12.9.23 artwork advertises a Friday and a Saturday on one sheet. Those are two
 * events in the data, correctly, because the lineups differ. In the grid they
 * were two tiles showing the identical poster, which read as a duplicate rather
 * than as a weekend.
 *
 * Collapses only what it can: "8-9 Dec 2023" when the month and year match,
 * "28 Nov to 2 Dec 2023" across a month boundary, and both dates in full across
 * a year boundary.
 */
export function formatDateRange(isoDates: string[]): string {
  const sorted = [...new Set(isoDates)].sort();
  if (sorted.length <= 1) return formatDate(sorted[0] ?? "");

  const parse = (iso: string) => {
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
    return new Date(dateOnly ? `${iso}T12:00:00` : iso);
  };
  const a = parse(sorted[0]);
  const b = parse(sorted[sorted.length - 1]);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) {
    return sorted.map(formatDate).join(" / ");
  }

  if (a.getFullYear() !== b.getFullYear()) {
    return `${formatDate(sorted[0])} to ${formatDate(sorted[sorted.length - 1])}`;
  }
  if (a.getMonth() !== b.getMonth()) {
    return `${a.getDate()} ${MONTHS[a.getMonth()]} to ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
  }
  return `${a.getDate()}-${b.getDate()} ${MONTHS[a.getMonth()]} ${a.getFullYear()}`;
}

/**
 * The archive's title line: "DD.MM.YYYY". A weekend on one poster collapses to
 * "08-09.12.2023" when month and year match, and is written in full either side
 * of a hyphen when they do not.
 */
export function formatDotDate(isoDates: string[]): string {
  const sorted = [...new Set(isoDates)].sort();
  const parts = (iso: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    return m ? { y: m[1], mo: m[2], d: m[3] } : null;
  };
  const a = parts(sorted[0] ?? "");
  const b = parts(sorted[sorted.length - 1] ?? "");
  if (!a || !b) return sorted.join(" - ");
  const full = (p: { y: string; mo: string; d: string }) => `${p.d}.${p.mo}.${p.y}`;
  if (sorted.length === 1 || full(a) === full(b)) return full(a);
  if (a.y === b.y && a.mo === b.mo) return `${a.d}-${b.d}.${a.mo}.${a.y}`;
  return `${full(a)} - ${full(b)}`;
}

/** Every date an event covers: one, or the first and last of a run. */
export function eventDates(entry: { date: string; endDate?: string }): string[] {
  return entry.endDate ? [entry.date, entry.endDate] : [entry.date];
}
