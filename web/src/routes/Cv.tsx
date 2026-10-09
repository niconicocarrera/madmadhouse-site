import { useMemo } from "react";
import { useEvents } from "../lib/useEvents";
import { cv } from "../data/cv";
import { info } from "../data/info";
import { formatDate, formatDateRange, eventDates, igUrl } from "../lib/format";
import type { EventEntry } from "../types/event";
import "./Cv.css";

/**
 * CV: the booking one-sheet. Page one prints as the pitch (identity, numbers,
 * partners, residencies and rooms, sound and formats, roster, contact); page
 * two is every night, for a booker who wants the depth.
 *
 * Editorial choices live in src/data/cv.ts. Everything stated as a fact here is
 * computed from the events, so the CV cannot drift from the archive.
 */

const CREW_HANDLES = new Set(info.members.map((m) => m.instagram));
/** Venue names that are not a place a booker can look up. */
const UNNAMED = new Set(["Undisclosed"]);

function where(e: EventEntry): string {
  return [e.venue.name, e.venue.city].filter(Boolean).join(", ");
}

/** One line per partner. A single night reads in full; several collapse to a
 *  count, the cities and the years ("3 nights, Aurora and Chicago, 2023 to 2025"). */
function partnerLine(nights: EventEntry[]): string {
  if (nights.length === 1) {
    const e = nights[0];
    return `${e.title ? `${e.title}, ` : ""}${where(e)}, ${formatDate(e.date)}`;
  }
  const cities = [...new Set(nights.map((e) => e.venue.city).filter(Boolean))];
  const years = nights.map((e) => e.date.slice(0, 4)).sort();
  const span = years[0] === years[years.length - 1] ? years[0] : `${years[0]} to ${years[years.length - 1]}`;
  const place = cities.length ? `${cities.join(" and ")}, ` : "";
  return `${nights.length} nights, ${place}${span}`;
}

function lineup(e: EventEntry): string {
  return e.djs.map((d) => d.name).join(", ");
}

function useCvFacts(events: EventEntry[] | null) {
  return useMemo(() => {
    if (!events) return null;
    const past = events.filter((e) => e.status === "past");
    const years = past.map((e) => e.date.slice(0, 4)).sort();
    const named = past.filter((e) => !UNNAMED.has(e.venue.name));
    const venues = new Set(named.map((e) => e.venue.name));
    const cities = new Set(past.map((e) => e.venue.city).filter(Boolean));

    // Performers counted by handle, so one person under two billed names is one.
    const people = new Map<string, { name: string; nights: number; instagram?: string }>();
    for (const e of past) {
      const seen = new Set<string>();
      for (const d of e.djs) {
        const key = d.instagram ?? `name:${d.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const row = people.get(key) ?? { name: d.name, nights: 0, instagram: d.instagram };
        row.nights += 1;
        people.set(key, row);
      }
    }
    const guests = [...people.values()]
      .filter((p) => !(p.instagram && CREW_HANDLES.has(p.instagram)))
      .sort((a, b) => b.nights - a.nights || a.name.localeCompare(b.name));

    // Partners: one line per partner (or partner pairing), its nights under
    // it, newest first. Undisputed Vintage's three markets read as one partner.
    const partnerMap = new Map<string, { names: { label: string; instagram?: string }[]; nights: EventEntry[] }>();
    for (const e of past) {
      if (!e.presentedBy?.length) continue;
      const names = [...e.presentedBy]
        .sort((a, b) => cv.partnerOrder.indexOf(a.name) - cv.partnerOrder.indexOf(b.name))
        .map((p) => ({ label: cv.partnerNames[p.name] ?? p.name, instagram: p.instagram }));
      const key = names.map((n) => n.label).join(" x ");
      const row = partnerMap.get(key) ?? { names, nights: [] };
      row.nights.push(e);
      partnerMap.set(key, row);
    }
    const partners = [...partnerMap.entries()]
      .map(([key, row]) => ({ key, ...row, nights: row.nights.sort((a, b) => b.date.localeCompare(a.date)) }))
      .sort((a, b) => b.nights[0].date.localeCompare(a.nights[0].date));

    // Rooms played more than once: the closest thing to a residency.
    const byVenue = new Map<string, EventEntry[]>();
    for (const e of named) byVenue.set(e.venue.name, [...(byVenue.get(e.venue.name) ?? []), e]);
    const rooms = [...byVenue.entries()]
      .filter(([, list]) => list.length > 1)
      .map(([name, list]) => {
        const ys = list.map((e) => e.date.slice(0, 4)).sort();
        return { name, city: list[0].venue.city, nights: list.length, from: ys[0], to: ys[ys.length - 1] };
      })
      // Labelled rooms (residencies) first, then by nights played.
      .sort((a, b) => Number(Boolean(cv.rooms[b.name])) - Number(Boolean(cv.rooms[a.name])) || b.nights - a.nights);

    // Presenting crews (Lé Bump) can be named among the notable bills too.
    const presenterCrews = new Map<string, { name: string; instagram: string }>();
    for (const e of past) for (const p of e.presentedBy ?? []) {
      if (p.instagram) presenterCrews.set(p.instagram, { name: p.name, instagram: p.instagram });
    }
    const notable = cv.notableGuests
      .map((h) => guests.find((g) => g.instagram === h) ?? presenterCrews.get(h))
      .filter((g): g is { name: string; instagram: string } => Boolean(g && g.instagram));
    const crewsNamed = notable.filter((n) => !guests.some((g) => g.instagram === n.instagram)).length;

    return {
      notable,
      billCount: guests.length + crewsNamed,
      nights: past.length,
      from: years[0],
      to: years[years.length - 1],
      venues: venues.size,
      cities: [...cities],
      djs: people.size,
      guests,
      partners,
      rooms,
      all: [...past].sort((a, b) => b.date.localeCompare(a.date)),
    };
  }, [events]);
}

export default function Cv() {
  const events = useEvents();
  const f = useCvFacts(events);
  const booking = info.contact.booking;

  return (
    <div className="page">
      {!f ? (
        <p className="u-mono">Loading.</p>
      ) : (
        <article className="cv" data-nav-home>
          {/* The name spans the page; both columns start under it. */}
          <h1 className="cv__name">MADMADHOUSE</h1>
          <div className="cv__col">
          <header className="cv__block cv__head">
            <p className="cv__identity">{cv.identity}</p>
            <ul className="cv__headline">
              {cv.headline.map((h) => (
                <li key={h.eventId}>{h.text}</li>
              ))}
            </ul>
            {cv.mix && (
              <p className="cv__strong">
                <a href={cv.mix.url} target="_blank" rel="noreferrer noopener">{cv.mix.label}</a>
              </p>
            )}
            <p className="cv__stats">
              {f.nights} nights · {f.venues} venues · {f.cities.length} cities · {f.djs} DJs · {f.from} to {f.to}
            </p>
            {info.bio.map((p) => (
              <p key={p} className="cv__text">{p}</p>
            ))}
          </header>

          <section className="cv__block">
            <h2 className="u-label">Partners</h2>
            <ul className="cv__list">
              {f.partners.map(({ key, names, nights }) => (
                <li key={key}>
                  <span className="cv__strong">
                    {names.map((n, i) => (
                      <span key={n.label}>
                        {i > 0 && " x "}
                        {n.instagram ? (
                          <a href={igUrl(n.instagram)} target="_blank" rel="noreferrer noopener">{n.label}</a>
                        ) : n.label}
                      </span>
                    ))}
                  </span>
                  <span className="cv__meta">{partnerLine(nights)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="cv__block cv__contact">
            <h2 className="u-label">Booking</h2>
            {booking && <p className="cv__strong"><a href={`mailto:${booking}`}>{booking}</a></p>}
            <p className="cv__text">Rider and rates on request.</p>
            <p className="cv__text">
              <a href={igUrl(info.contact.instagram)} target="_blank" rel="noreferrer noopener">@{info.contact.instagram}</a>
              {" · "}madmadhouse.com
            </p>
            <button type="button" className="btn cv__print" onClick={() => window.print()}>
              Save as PDF
            </button>
          </section>
          </div>

          <div className="cv__col">

          <section className="cv__block">
            <h2 className="u-label">Residencies and repeat rooms</h2>
            <ul className="cv__list">
              {f.rooms.map((r) => {
                const role = cv.rooms[r.name];
                const span = `${r.nights} nights, ${r.from === r.to ? r.from : `${r.from} to ${r.to}`}`;
                return (
                  <li key={r.name}>
                    <span className={role ? "cv__strong" : undefined}>{r.name}{r.city ? `, ${r.city}` : ""}</span>
                    <span className="cv__meta">{role ? `${role.label}, ${span}` : span}</span>
                    {role?.note && <span className="cv__meta">{role.note}</span>}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="cv__block">
            <h2 className="u-label">Sound</h2>
            <ul className="cv__plain">{cv.sound.map((s) => <li key={s}>{s}</li>)}</ul>
            <h2 className="u-label cv__sub">Formats</h2>
            <ul className="cv__plain">{cv.formats.map((s) => <li key={s}>{s}</li>)}</ul>
          </section>

          <section className="cv__block">
            <h2 className="u-label">Roster</h2>
            <dl className="cv__dl">
              {info.members.map((m) => (
                <div key={m.instagram} className="cv__row">
                  <dt><a href={igUrl(m.instagram)} target="_blank" rel="noreferrer noopener">{m.name}</a></dt>
                  <dd>{m.roles}</dd>
                </div>
              ))}
            </dl>
            <p className="cv__text">
              A rotating roster around the core. Shared bills with {f.billCount} DJs and crews, including{" "}
              {f.notable.map((g, i) => (
                <span key={g.instagram}>
                  {i > 0 && ", "}
                  <a href={igUrl(g.instagram)} target="_blank" rel="noreferrer noopener">{g.name}</a>
                </span>
              ))}
              .
            </p>
          </section>
          </div>

          <section className="cv__all">
            <h2 className="u-label">Every night, {f.from} to {f.to}</h2>
            <table className="cv__table">
              <thead>
                <tr><th>Date</th><th>Night</th><th>Where</th><th>Lineup</th></tr>
              </thead>
              <tbody>
                {f.all.map((e) => (
                  <tr key={e.eventId}>
                    <td>{formatDateRange(eventDates(e))}</td>
                    <td>{e.title ?? ""}</td>
                    <td>{where(e)}</td>
                    <td>{lineup(e)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </article>
      )}
    </div>
  );
}
