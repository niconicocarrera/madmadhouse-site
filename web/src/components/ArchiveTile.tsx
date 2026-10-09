import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Poster } from "./Poster";
import { SIZES } from "../lib/assets";
import { formatDateRange, formatDotDate } from "../lib/format";
import { motionTokens, prefersReducedMotion } from "../motion/tokens";
import type { EventEntry, EventAsset } from "../types/event";
import "./ArchiveTile.css";

/**
 * One CELL of the archive grid. A night occupies one or two of them:
 *
 *   kind="poster"  the flyer art
 *   kind="media"   the photographs from that same night
 *
 * A night with no photographs occupies one cell. A night with photographs
 * occupies two, side by side in the flow, each cycling through its own set. The
 * poster is the document; the media is the evidence.
 *
 * No caption under the image. The grid is images only; a tile reports its title
 * ("Location - DD.MM.YYYY") to the page, which shows it once, bottom centre, in
 * the nav's own treatment.
 *
 * Three decisions worth knowing:
 *
 * WHICH images is deterministic, the CHOREOGRAPHY is not. The set a cell cycles
 * through is derived from its eventId, so it is the same on every visit and a
 * cell can be reasoned about and reproduced. The interval and the starting phase
 * are random per mount, so the grid never pulses in unison and the composition
 * differs each time you open it. Fixing both would be inert; randomizing both
 * would make a bug impossible to reproduce.
 *
 * POSTER CELLS HOLD THEIR BOX, MEDIA CELLS DO NOT. A poster cell is sized once
 * from its flyer and never moves: cropping or reflowing a flyer is the one thing
 * this archive must not do. A media cell instead takes the ratio of whichever
 * photograph is showing and animates between them, so a landscape shot is seen
 * as a landscape shot and the column breathes around it.
 *
 * That is a deliberate trade with a real cost, not a free choice: a cell that
 * changes height on a timer moves everything below it in its column, and that
 * counts against Cumulative Layout Shift, which this project had at 0. It is
 * confined to one column (the other columns never move) and to the 19 nights
 * that have photographs. Measured impact is reported in the LOG.
 *
 * LATER FRAMES ONLY MOUNT ONCE VISIBLE. An off-screen cell loads one image and
 * nothing else. Without that gate the grid would pull roughly 130 images on
 * first paint for content most visitors never scroll to.
 */
export function ArchiveTile({
  entry,
  assets,
  kind,
  dates,
  priority,
  onActive,
}: {
  entry: EventEntry;
  /** The set this cell cycles through. Never empty. */
  assets: EventAsset[];
  kind: "poster" | "media";
  /** Every date this cell covers. More than one when one poster advertises
   *  consecutive nights, in which case the title is a range. */
  dates: string[];
  priority: boolean;
  /** Reports this tile's title while it is hovered or focused, null on leave. */
  onActive?: (title: string | null) => void;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);

  // Deterministic from the eventId: same set, same order, every visit.
  const frames = useMemo(() => {
    const { revolve } = motionTokens();
    if (assets.length <= 1) return assets;
    const first = assets[0];
    const rest = assets.slice(1);
    let h = 0;
    const seed = entry.eventId + kind;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    const picked: EventAsset[] = [];
    const pool = [...rest];
    const want = Math.min(revolve.maxExtras, pool.length);
    for (let i = 0; i < want; i++) {
      h = (h * 1103515245 + 12345) >>> 0;
      picked.push(pool.splice(h % pool.length, 1)[0]);
    }
    return [first, ...picked];
  }, [assets, entry.eventId, kind]);

  // Randomized per mount: the choreography differs each visit.
  const timing = useMemo(() => {
    const { revolve } = motionTokens();
    return {
      interval: (revolve.intervalMin + Math.random() * (revolve.intervalMax - revolve.intervalMin)) * 1000,
      phase: Math.random() * revolve.maxPhase * 1000,
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => setVisible(e.isIntersecting),
      { rootMargin: "200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || frames.length < 2 || prefersReducedMotion()) return;
    let interval: number | undefined;
    const start = window.setTimeout(() => {
      setIndex((i) => (i + 1) % frames.length);
      interval = window.setInterval(
        () => setIndex((i) => (i + 1) % frames.length),
        timing.interval,
      );
    }, timing.phase);
    return () => {
      clearTimeout(start);
      if (interval) clearInterval(interval);
    };
  }, [visible, frames.length, timing]);

  // Poster cells lock to their flyer; media cells follow the frame on screen.
  const box = kind === "poster" ? frames[0] : frames[index] ?? frames[0];
  const when = formatDateRange(dates);
  const title = `${entry.venue.name} - ${formatDotDate(dates)}`;
  const label =
    kind === "poster"
      ? `${entry.venue.name}, ${when}`
      : `Photographs from ${entry.venue.name}, ${when}`;

  return (
    <Link
      ref={ref}
      to={`/?e=${entry.eventId}`}
      className={`archive__tile archive__tile--${kind}`}
      aria-label={label}
      data-title={title}
      onMouseEnter={() => onActive?.(title)}
      onMouseLeave={() => onActive?.(null)}
      onFocus={() => onActive?.(title)}
      onBlur={() => onActive?.(null)}
    >
      <div
        className={`archive__frames archive__frames--${kind}`}
        style={{ aspectRatio: String(box.aspectRatio) }}
      >
        {frames.map((a, i) => {
          // The first frame is always mounted. The rest wait until the cell is
          // near the viewport, so an unvisited cell costs exactly one image.
          if (i > 0 && !visible) return null;
          return (
            <div
              key={a.assetId}
              className={`archive__frame${i === index ? " is-on" : ""}`}
              aria-hidden={i === index ? undefined : true}
            >
              <Poster
                assetId={a.assetId}
                motion={a.motion}
                /* The box's current ratio, so a frame fills the cell it is in. */
                aspectRatio={box.aspectRatio}
                alt={i === 0 ? label : ""}
                sizes={SIZES.grid}
                priority={priority && i === 0}
              />
            </div>
          );
        })}
      </div>
    </Link>
  );
}
