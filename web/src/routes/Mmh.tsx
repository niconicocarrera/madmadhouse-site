import { useEvents } from "../lib/useEvents";
import { EventEntryCard } from "../components/EventEntryCard";
import "./Mmh.css";

/**
 * MMH: the CV. Reverse-chronological, upcoming first.
 *
 * No page header (Nico, 2026-09-22). The fixed nav is the only chrome, and the
 * first flyer is the first thing you see. A title bar saying MADMADHOUSE above a
 * page whose nav already says MMH was repeating itself and pushing the work down.
 *
 * Locations render as the street address. Coordinates are still geocoded and
 * carried in the data (`venue.coords`, from scripts/geocode_venues.py), they are
 * simply not shown: the comparison has been made and the address won.
 */
export default function Mmh() {
  const events = useEvents();
  const upcoming = events?.filter((e) => e.status === "upcoming") ?? [];
  const past = events?.filter((e) => e.status === "past") ?? [];

  return (
    <div className="page">
      <h1 className="u-visually-hidden">MADMADHOUSE</h1>
      {!events && <p className="u-mono mmh__loading">Loading.</p>}


      {upcoming.map((entry, i) => (
        <EventEntryCard key={entry.eventId} entry={entry} index={i} />
      ))}
      {past.map((entry, i) => (
        <EventEntryCard
          key={entry.eventId}
          entry={entry}
          index={i + upcoming.length}
         
        />
      ))}
    </div>
  );
}
