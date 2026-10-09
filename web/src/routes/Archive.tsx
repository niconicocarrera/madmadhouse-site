import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useEvents } from "../lib/useEvents";
import { ArchiveTile } from "../components/ArchiveTile";
import { useScrollLift } from "../lib/useScrollLift";
import { eventDates } from "../lib/format";
import type { EventAsset, EventEntry } from "../types/event";
import "./Archive.css";

/**
 * ARCHIVE: the exploded view of the event view. One poster per night, and
 * clicking a tile opens that night full bleed at `/?e=<eventId>`.
 *
 * LAYOUT, and why it is built this way rather than in pure CSS.
 *
 * Three approaches were tried:
 *
 *   1. CSS multi-column. Gives exactly the intended look: tiles at their natural
 *      size, ragged column bottoms, nothing forced into alignment. But columns
 *      fill top-to-bottom before moving right, so a chronological archive read
 *      in the wrong order. Tile 2 sat BELOW tile 1 instead of beside it.
 *   2. Justified flex rows. Correct reading order, but every row is flush at
 *      both edges and shares a height, which regiments the grid and loses the
 *      looseness that made the archive feel like a wall of flyers.
 *   3. This: explicit column elements, with items dealt round-robin across them
 *      (item i into column i % n). Reading left to right across the top gives
 *      items 0, 1, 2, so the order is right, AND each column stacks at natural
 *      heights, so the raggedness is back. Both properties, no compromise.
 *
 * `grid-template-rows: masonry` would do this natively and is still not
 * shippable (Firefox only, behind a flag).
 *
 * The usual objection to round-robin is that columns can end at wildly
 * different heights. Measured against this archive's real ratios (0.80 to 1.01,
 * since these are nearly all portrait flyers) the spread is 1.6% at two columns,
 * 8.1% at three and 3.8% at four. A shortest-column-first fill would balance
 * better but would break the reading order, which is the thing being fixed.
 *
 * CSS owns the column count via `--archive-cols` so the breakpoints live with
 * the rest of the layout; this component only reads it. Read in a layout effect
 * so the distribution is corrected before paint, never as a visible reflow.
 */
export default function Archive() {
  const events = useEvents();
  const gridRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(3);
  const [title, setTitle] = useState<string | null>(null);
  const liftRef = useRef<HTMLDivElement>(null);
  useScrollLift(liftRef);


  useLayoutEffect(() => {
    const read = () => {
      const el = gridRef.current;
      if (!el) return;
      const n = parseInt(getComputedStyle(el).getPropertyValue("--archive-cols"), 10);
      if (Number.isFinite(n) && n > 0) setCols(n);
    };
    read();
    const ro = new ResizeObserver(read);
    if (gridRef.current) ro.observe(gridRef.current);
    return () => ro.disconnect();
  }, [events]);

  useEffect(() => {
    // A zoom or a font-size change moves the breakpoint without resizing the
    // element, so listen for that too.
    const onResize = () => {
      const el = gridRef.current;
      if (!el) return;
      const n = parseInt(getComputedStyle(el).getPropertyValue("--archive-cols"), 10);
      if (Number.isFinite(n) && n > 0) setCols(n);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // A night occupies ONE or TWO cells: its poster, and its photographs if it has
  // any. The media cell is a sibling in the grid rather than an alternate frame
  // of the poster, because the photographs are their own artifact.
  //
  // The poster falls back to the first asset when an event has no `flyer` role,
  // rather than being filtered out. Exactly one event is in that state (the
  // 2024-11-01 Leilani night, whose flyer image was destroyed in the minting
  // incident, see LOG 2026-09-22), and a strict filter would silently drop a
  // real night out of the archive.
  type Cell = {
    key: string;
    entry: EventEntry;
    assets: EventAsset[];
    kind: "poster" | "media";
    /** Every date this cell covers. More than one when a single poster
     *  advertises consecutive nights. */
    dates: string[];
  };

  const cells: Cell[] = (events ?? []).flatMap((entry) => {
    const posters = entry.assets.filter((a) => a.role === "flyer");
    const media = entry.assets.filter((a) => a.role !== "flyer");
    const out: Cell[] = [];
    const posterSet = posters.length ? posters : entry.assets.slice(0, 1);
    if (posterSet.length) {
      out.push({ key: `${entry.eventId}:poster`, entry, assets: posterSet, kind: "poster", dates: eventDates(entry) });
    }
    if (media.length && posters.length) {
      out.push({ key: `${entry.eventId}:media`, entry, assets: media, kind: "media", dates: eventDates(entry) });
    }
    return out;
  });

  // Collapse cells that show the SAME poster. One flyer sometimes advertises a
  // whole weekend (the 12.8.23 / 12.9.23 artwork is a Friday and a Saturday on
  // one sheet). Those stay two events in the data, correctly, because the
  // lineups differ, but two tiles of the identical image read as a duplicate
  // rather than as a weekend. Merged here and titled as a range.
  //
  // Only identical posters merge. Two different shows that happen to fall on the
  // same day (24 May 2025 had two, at different venues) keep their own tiles,
  // because they are genuinely two things to look at.
  const tiles: Cell[] = [];
  const byPoster = new Map<string, Cell>();
  for (const cell of cells) {
    if (cell.kind !== "poster") {
      tiles.push(cell);
      continue;
    }
    const id = cell.assets[0]?.assetId;
    const seen = id ? byPoster.get(id) : undefined;
    if (seen) {
      seen.dates.push(...cell.dates);
      continue;
    }
    if (id) byPoster.set(id, cell);
    tiles.push(cell);
  }

  const columns: typeof tiles[] = Array.from({ length: cols }, () => []);
  tiles.forEach((t, i) => columns[i % cols].push(t));

  return (
    <div className="page">
      {/* No visible header anywhere on the site. The heading stays in the
          document for screen readers and for the document outline, because a
          page with no h1 at all is a real accessibility regression, not a
          minimal one. */}
      <h1 className="u-visually-hidden">Archive</h1>

      {/* The loading line lives INSIDE the grid, so the columns replace it in
          place. Above the grid, removing it moved the whole grid (CLS 0.09). */}
      <div className="archive" ref={gridRef}>
        {!events && <p className="u-mono archive__loading">Loading.</p>}
        {columns.map((col, ci) => (
          <div className="archive__col" key={ci}>
            {col.map((cell, ri) => (
              <ArchiveTile
                key={cell.key}
                entry={cell.entry}
                assets={cell.assets}
                kind={cell.kind}
                dates={cell.dates}
                priority={ri === 0}
                onActive={setTitle}
              />
            ))}
          </div>
        ))}
      </div>

      {/* The scroll lift: a feathered band of colour at whichever edge you are
          scrolling toward. Fixed, full width, nothing per tile. */}
      <div className="archive__lift" ref={liftRef} aria-hidden="true">
        <div className="archive__lift-band archive__lift-band--top" />
        <div className="archive__lift-band archive__lift-band--bottom" />
      </div>

      {/* One title for the whole grid, bottom centre, in the nav's treatment.
          Hidden from assistive tech: every tile already carries its label. */}
      <p className={`archive__title${title ? " is-on" : ""}`} aria-hidden="true">{title}</p>
    </div>
  );
}
