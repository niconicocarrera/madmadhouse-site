import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import { useEvents } from "../lib/useEvents";
import { Poster } from "../components/Poster";
import { SIZES } from "../lib/assets";
import { formatDateRange, eventDates, igUrl } from "../lib/format";
import { motionTokens, prefersReducedMotion } from "../motion/tokens";
import type { EventAsset, EventEntry } from "../types/event";
import "./EventView.css";

/**
 * One night per screen: the archive, widened.
 *
 * The media is centred on the screen, around the nav, with the same clear space
 * above and below. The information sits in the lower clear space, stacked and
 * centred, the same spot in every layout. Previous and next sit at the edges.
 *
 *   phone           everything, poster first, one at a time
 *   wider, posters  the poster versions, one at a time, centred
 *   wider, + media  poster versions on one side, the media on the other, each
 *                   one at a time and out of step, the centre open for the nav
 *
 * The night is held in the URL (`?e=`), so it is linkable, the back button works,
 * and ARCHIVE can open straight to one.
 */
export type EventViewMode = "poster" | "both";

export default function EventView() {
  const events = useEvents();
  const [params, setParams] = useSearchParams();
  const phone = useMediaQuery("(max-width: 780px)");

  const index = useMemo(() => {
    if (!events?.length) return 0;
    const found = events.findIndex((e) => e.eventId === params.get("e"));
    return found >= 0 ? found : 0;
  }, [events, params]);

  const entry = events?.[index];

  // The view follows the night: a poster alone is shown centred ("poster"); a
  // poster with media is shown poster left, media right ("both"). Phones always
  // show one thing at a time, so they are "poster".
  const effective: EventViewMode =
    entry && !phone && entry.assets.some((a) => a.role !== "flyer") ? "both" : "poster";

  // Published for the nav, which reads it on the initial load and on Escape. It
  // never moves the nav by itself.
  useEffect(() => {
    if (!entry) return;
    const root = document.documentElement;
    root.dataset.evView = effective;
    window.dispatchEvent(new Event("mmh:navhome"));
    return () => { delete root.dataset.evView; };
  }, [entry, effective]);

  const go = useCallback(
    (delta: number) => {
      if (!events?.length) return;
      const next = (index + delta + events.length) % events.length;
      setParams({ e: events[next].eventId }, { replace: false });
    },
    [events, index, setParams],
  );

  // Swipe left for the next night, right for the previous, on touch screens.
  // Ignored when the touch starts on the nav (it is draggable) or on a link.
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const { swipe } = motionTokens();
    let start: { x: number; y: number; t: number } | null = null;
    let swiped = false;
    const onStart = (e: TouchEvent) => {
      const target = e.target as Element;
      if (e.touches.length !== 1 || target.closest(".chrome, a")) { start = null; return; }
      const t = e.touches[0];
      start = { x: t.clientX, y: t.clientY, t: performance.now() };
    };
    const onEnd = (e: TouchEvent) => {
      if (!start) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      const quick = performance.now() - start.t <= swipe.maxDuration;
      start = null;
      if (quick && Math.abs(dx) >= swipe.minDistance && Math.abs(dx) >= Math.abs(dy) * swipe.minRatio) {
        swiped = true;
        go(dx < 0 ? 1 : -1);
      }
    };
    // A swipe must not also count as the tap that advances the photographs.
    const onClick = (e: MouseEvent) => {
      if (swiped) { e.stopPropagation(); e.preventDefault(); swiped = false; }
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("click", onClick, true);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("click", onClick, true);
    };
  }, [go, events]);

  // Two-finger swipe on a trackpad arrives as horizontal wheel events, then an
  // inertia tail that keeps going after the fingers lift. One swipe turns exactly
  // one page: after a turn the wheel is locked until it has been completely
  // silent for SILENCE_MS (every event, tail included, restarts that clock), so
  // the tail can never turn another page however long or noisy it is.
  // One swipe, one page. The state lives in refs, not in the effect: `go`
  // changes on every page turn, which re-runs the effect, and state kept inside
  // it would reset the lock the moment it was set.
  //
  // After a turn the wheel is locked for MIN_LOCK_MS. It then unlocks when the
  // wheel goes quiet for QUIET_MS, or when a NEW swipe begins: the tail decays
  // to near zero, so once it has dipped below it a delta back above PUSH is a
  // fresh push by the fingers.
  const wheel = useRef({ sum: 0, locked: false, lockUntil: 0, lastT: 0, decayed: false, push: 0 });
  const goRef = useRef(go);
  goRef.current = go;
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const THRESHOLD = 45;
    const MIN_LOCK_MS = 450;
    const QUIET_MS = 120;
    const TAIL_LOW = 8;
    const PUSH = 15;
    const PUSH_EVENTS = 3;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // vertical belongs to the browser
      e.preventDefault();
      const w = wheel.current;
      const now = performance.now();
      const abs = Math.abs(e.deltaX);
      const gap = now - w.lastT;
      w.lastT = now;
      if (w.locked) {
        if (abs < TAIL_LOW) w.decayed = true;
        // A fresh swipe is a SUSTAINED push, not a single spike in the tail.
        w.push = w.decayed && abs >= PUSH ? w.push + 1 : 0;
        const newPush = w.push >= PUSH_EVENTS;
        if (now < w.lockUntil || (gap <= QUIET_MS && !newPush)) return;
        w.locked = false;
        w.sum = 0;
      } else if (gap > QUIET_MS) {
        w.sum = 0;
      }
      w.sum += e.deltaX;
      if (Math.abs(w.sum) >= THRESHOLD) {
        w.locked = true;
        w.lockUntil = now + MIN_LOCK_MS;
        w.decayed = false;
        w.push = 0;
        goRef.current(w.sum > 0 ? 1 : -1);
        w.sum = 0;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [events]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  if (!events) return <p className="u-mono ev__loading">Loading.</p>;
  if (!entry) return <p className="u-mono ev__loading">No events.</p>;

  // Poster versions first, then everything else in harvest order. A night with
  // no flyer (none today, but the harvest allows it) leads with its first asset.
  const flyers = entry.assets.filter((a) => a.role === "flyer");
  const posters = flyers.length ? flyers : entry.assets.slice(0, 1);
  const rest = entry.assets.filter((a) => !posters.includes(a));
  const when = formatDateRange(eventDates(entry));
  const label = `${entry.venue.name}, ${when}`;
  const k = entry.eventId;

  let media;
  if (phone) media = <Cycle key={k} assets={[...posters, ...rest]} label={label} className="ev__stage--solo" />;
  else if (effective === "poster") media = <Cycle key={k} assets={posters} label={label} className="ev__stage--solo" />;
  else media = (
    <div className="ev__spread">
      <Cycle key={`${k}:p`} assets={posters} label={label} className="ev__stage--poster" />
      <Cycle key={`${k}:m`} assets={rest} label="" className="ev__stage--media" offset={0.5} />
    </div>
  );

  return (
    <section className="ev" ref={sectionRef} aria-label={label}>
      {media}
      <Info entry={entry} />
      {/* After the media in source order so they paint over it at the edges. */}
      <button className="ev__arrow ev__arrow--prev" type="button" onClick={() => go(-1)} aria-label="Previous night">
        <Arrow flip />
      </button>
      <button className="ev__arrow ev__arrow--next" type="button" onClick={() => go(1)} aria-label="Next night">
        <Arrow />
      </button>
    </section>
  );
}

/** All capitals or as written. One switch, so the two can be compared and the
 *  decision lives in one place. Nico leaned capitals, 2026-09-30. */
const INFO_CAPS = true;

/** The information, stacked and centred, the same spot in every layout. */
function Info({ entry }: { entry: EventEntry }) {
  return (
    <div className="ev__band">
      <div className={`ev__meta${INFO_CAPS ? " ev__meta--caps" : ""}`}>
        <p className="ev__venue">{entry.venue.name}</p>
        {entry.venue.address && (
          <p>{entry.venue.address}{entry.venue.city ? `, ${entry.venue.city}` : ""}</p>
        )}
        <p className="ev__date">{formatDateRange(eventDates(entry))}</p>
        {entry.djs.length > 0 && (
          <p className="ev__djs">
            {entry.djs.map((dj) => (
              <span key={dj.name}>
                {dj.instagram ? (
                  <a href={igUrl(dj.instagram)} target="_blank" rel="noreferrer noopener">{dj.name}</a>
                ) : dj.name}
              </span>
            ))}
          </p>
        )}
        {entry.specialGuests?.length ? (
          <p className="ev__presented">
            Special guest{entry.specialGuests.length > 1 ? "s" : ""}{" "}
            {entry.specialGuests.map((g, i) => (
              <span key={g.name}>
                {i > 0 && ", "}
                {g.instagram ? (
                  <a href={igUrl(g.instagram)} target="_blank" rel="noreferrer noopener">{g.name}</a>
                ) : g.name}
              </span>
            ))}
          </p>
        ) : null}
        {entry.presentedBy?.length ? (
          <p className="ev__presented">
            Presented by{" "}
            {entry.presentedBy.map((p, i) => (
              <span key={p.name}>
                {i > 0 && ", "}
                {p.instagram ? (
                  <a href={igUrl(p.instagram)} target="_blank" rel="noreferrer noopener">{p.name}</a>
                ) : p.name}
              </span>
            ))}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Short-stemmed arrow: the head carries it, the stem only points. */
function Arrow({ flip = false }: { flip?: boolean }) {
  return (
    <svg viewBox="0 0 14 12" aria-hidden="true" style={flip ? { transform: "scaleX(-1)" } : undefined}>
      <path d="M7.5 1.5 L12 6 L7.5 10.5 M12 6 H6" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/** One image, contained at its true ratio inside whatever box holds it. */
function Figure({ asset, alt, sizes, priority }: { asset: EventAsset; alt: string; sizes: string; priority?: boolean }) {
  return (
    <div className="ev__fig" style={{ "--ar": asset.aspectRatio } as CSSProperties}>
      <Poster
        assetId={asset.assetId}
        motion={asset.motion}
        aspectRatio={asset.aspectRatio}
        alt={alt}
        sizes={sizes}
        priority={priority}
      />
      {asset.credit && (
        <a
          className="ev__credit"
          href={igUrl(asset.credit)}
          target="_blank"
          rel="noreferrer noopener"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Photo by ${asset.credit}`}
          title={`Photo: @${asset.credit}`}
        >
          {/* Camera glyph: body, lens, viewfinder bump. */}
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path
              d="M2.5 5.5h2.2l1.1-1.6h4.4l1.1 1.6h2.2v7h-11z M8 7.2a2.1 2.1 0 1 0 0 4.2a2.1 2.1 0 1 0 0-4.2z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.1"
              strokeLinejoin="round"
            />
          </svg>
        </a>
      )}
    </div>
  );
}

/**
 * A set shown one at a time, dissolving in turn: the archive cell, widened.
 * A frame mounts once it is next up, so a 15-image night does not load 15 images
 * on arrival. Tap or click to advance. `offset` delays the first change by that
 * share of an interval, so two sets on one screen never change together.
 */
function Cycle({ assets, label, className, offset = 0 }: {
  assets: EventAsset[];
  label: string;
  className: string;
  offset?: number;
}) {
  const [i, setI] = useState(0);
  const [mounted, setMounted] = useState(() => new Set([0, 1 % assets.length]));
  const advance = useCallback(() => {
    setI((n) => {
      const next = (n + 1) % assets.length;
      const after = (next + 1) % assets.length;
      setMounted((s) => (s.has(after) ? s : new Set(s).add(after)));
      return next;
    });
  }, [assets.length]);

  useEffect(() => {
    if (assets.length < 2 || prefersReducedMotion()) return;
    const ms = motionTokens().focusCycle.interval * 1000;
    let id = 0;
    const start = window.setTimeout(() => {
      advance();
      id = window.setInterval(advance, ms);
    }, ms * (1 + offset));
    return () => { clearTimeout(start); clearInterval(id); };
  }, [assets.length, advance, offset]);

  const many = assets.length > 1;
  return (
    <div className={`ev__stage ${className}${many ? " is-cycling" : ""}`} onClick={many ? advance : undefined}>
      {assets.map((a, n) =>
        mounted.has(n) ? (
          <div key={a.assetId} className={`ev__slide${n === i ? " is-on" : ""}`} aria-hidden={n === i ? undefined : true}>
            <Figure asset={a} alt={n === 0 ? label : ""} sizes={SIZES.focus} priority={n === 0} />
          </div>
        ) : null,
      )}
    </div>
  );
}

function useMediaQuery(q: string) {
  const [match, setMatch] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setMatch(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [q]);
  return match;
}
