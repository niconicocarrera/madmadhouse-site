import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { motionTokens } from "../motion/tokens";
import { startNavSeek } from "../lib/navSeek";
import "./Chrome.css";

/**
 * The nav. Fixed at the centre of the viewport, difference-blended, and
 * draggable.
 *
 * How the motion works, because it is the point rather than a flourish:
 * the nav does not track the pointer exactly. A rAF loop eases it toward the
 * pointer each frame at `drag.followLerp`, so it lags on a fast throw and
 * settles on a slow one. That is the same weighting as the page's scroll lerp,
 * so the whole site shares one sense of mass. On release the loop keeps running
 * until the remaining distance is sub-pixel, which is what gives the drop its
 * settle without a separate animation.
 *
 * A position the viewer dragged to persists per viewer in localStorage and wins
 * on every page. With nothing saved the nav rests at HOME (top left, MMH on the
 * gutter, see global.css), except on an event page in poster + media, which
 * publishes data-ev-view="both" and keeps it centred. Every access is wrapped: a
 * private window or blocked origin must not stop the nav rendering.
 *
 * Accessibility: the handle is a real button, so the nav can be moved from the
 * keyboard with the arrow keys, and Escape or a double click returns it to rest.
 * Rest is HOME (top left, MMH on the gutter, see global.css) on a phone and on
 * any page marked `data-nav-home`, and centre otherwise. On a phone the nav also
 * STARTS at home on every page instead of its remembered position; it can still
 * be dragged away. Under prefers-reduced-motion the lerp goes to 1, so it tracks exactly
 * and lands with no settle. Dragging still works; it just stops easing.
 */

const STORE_KEY = "mmh.nav.offset";
const KEY_STEP = 12;
/** Keep this much of the viewport edge free, so the nav is always grabbable. */
const EDGE_MARGIN = 8;

interface Offset { x: number; y: number }

/**
 * Constrain the offset so the dock stays fully on screen.
 *
 * Without this the nav can be thrown past the edge and becomes unreachable, and
 * because the position persists, reloading does not recover it. Clamping is
 * applied on drag, on keyboard nudge, on load (a stored offset may be out of
 * bounds for a smaller window than it was saved on) and on resize.
 *
 * The dock is centred, so the usable range is plus or minus half the leftover
 * space on each axis. A dock larger than the viewport clamps to 0 rather than
 * going negative, which keeps it centred instead of jumping.
 */
function clampOffset(o: Offset, el: HTMLElement | null, margin = EDGE_MARGIN): Offset {
  if (!el || typeof window === "undefined") return o;
  const { width, height } = el.getBoundingClientRect();
  const maxX = Math.max(0, (window.innerWidth - width) / 2 - margin);
  const maxY = Math.max(0, (window.innerHeight - height) / 2 - margin);
  return {
    x: Math.min(maxX, Math.max(-maxX, o.x)),
    y: Math.min(maxY, Math.max(-maxY, o.y)),
  };
}

/**
 * Resolve any CSS length (a token, a calc, a clamp) to px by letting the
 * browser lay it out. Custom properties come back as their unresolved text,
 * and --gutter is a clamp(), so parsing them by hand is not an option.
 */
function cssPx(length: string): number {
  const probe = document.createElement("div");
  probe.style.cssText = `position:absolute;visibility:hidden;padding-left:${length}`;
  document.body.appendChild(probe);
  const px = parseFloat(getComputedStyle(probe).paddingLeft);
  probe.remove();
  return Number.isNaN(px) ? 0 : px;
}

/** Poster + media event page: the only view where the nav starts and returns to centre. */
function viewIsBoth(): boolean {
  return document.documentElement.dataset.evView === "both";
}

/**
 * The nav's home: the first link's TEXT on the page gutter (not the dock's
 * box, which carries padding), the dock's top at --nav-home-top. Pages lay
 * their content out under it with --page-top, so nothing here measures a page.
 */
function homeOffset(dock: HTMLElement | null): Offset {
  const parent = dock?.offsetParent;
  if (!dock || !parent) return { x: 0, y: 0 };
  // The dock's box at offset 0, from layout rather than getBoundingClientRect:
  // the transform eases through a CSS transition, so a rect taken mid-move
  // would put home wherever the dock happened to be in flight.
  const p = parent.getBoundingClientRect();
  const baseLeft = p.left + dock.offsetLeft;
  const baseTop = p.top + dock.offsetTop;
  // Where the first link's glyphs start inside the dock, undoing any scale.
  const d = dock.getBoundingClientRect();
  const scale = d.width / dock.offsetWidth || 1;
  const link = dock.querySelector(".chrome__link");
  let inset = 0;
  if (link) {
    const range = document.createRange();
    range.selectNodeContents(link);
    inset = (range.getBoundingClientRect().left - d.left) / scale;
  }
  return {
    x: cssPx("var(--gutter)") - inset - baseLeft,
    y: cssPx("var(--nav-home-top)") - baseTop,
  };
}

function readStored(): Offset {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { x: 0, y: 0 };
    const v = JSON.parse(raw);
    if (typeof v?.x === "number" && typeof v?.y === "number") return v;
  } catch {
    /* private window, blocked storage, malformed value: start from centre */
  }
  return { x: 0, y: 0 };
}

function hasStored(): boolean {
  try { return localStorage.getItem(STORE_KEY) !== null; } catch { return false; }
}

/** Escape and double click forget a saved position, so the page default applies again. */
function clearStored() {
  try { localStorage.removeItem(STORE_KEY); } catch { /* nothing saved to clear */ }
}

function writeStored(o: Offset) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(o));
  } catch {
    /* nothing to do: the position simply will not persist */
  }
}

export function Chrome() {
  const dockRef = useRef<HTMLDivElement>(null);
  const [grabbed, setGrabbed] = useState(false);

  // Target is where the pointer says it should be; current is where it has
  // eased to. Refs, not state: these change every frame and must not re-render.
  const target = useRef<Offset>({ x: 0, y: 0 });
  const current = useRef<Offset>({ x: 0, y: 0 });
  const raf = useRef<number | null>(null);
  const dragging = useRef(false);
  const start = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  // True while the target is a page-declared home. A home is placed by the
  // page, fully on screen by construction, so it may sit closer to the edge
  // than EDGE_MARGIN (on a phone, aligning to the gutter needs ~6px). Any drag
  // or nudge clears it and the usual margin applies again.
  const atHome = useRef(false);
  // True once the viewer has moved the nav; only then is a position remembered.
  const userMoved = useRef(false);
  const margin = useCallback(() => (atHome.current ? 0 : EDGE_MARGIN), []);

  const apply = useCallback(() => {
    const el = dockRef.current;
    if (el) {
      el.style.setProperty("--dx", `${current.current.x.toFixed(2)}px`);
      el.style.setProperty("--dy", `${current.current.y.toFixed(2)}px`);
    }
  }, []);

  const tick = useCallback(() => {
    const { followLerp } = motionTokens().drag;
    // Clamp the TARGET every frame rather than only at the call sites: it means
    // drag, keyboard, restore and resize all inherit the bound for free, and a
    // throw decelerates into the edge instead of stopping dead outside it.
    target.current = clampOffset(target.current, dockRef.current, margin());
    const dx = target.current.x - current.current.x;
    const dy = target.current.y - current.current.y;
    current.current.x += dx * followLerp;
    current.current.y += dy * followLerp;
    apply();
    // Keep running while there is meaningful distance left, which is what makes
    // the release settle rather than stop dead.
    if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1 || dragging.current) {
      raf.current = requestAnimationFrame(tick);
    } else {
      current.current = { ...target.current };
      apply();
      raf.current = null;
      if (userMoved.current) writeStored(target.current);
    }
  }, [apply, margin]);

  const kick = useCallback(() => {
    if (raf.current == null) raf.current = requestAnimationFrame(tick);
  }, [tick]);

  // Placed once, on the initial load, then left alone: paging between nights or
  // changing route never moves the nav. A saved (dragged) position wins; else
  // centre when the event page is poster + media, top left everywhere else.
  const { pathname } = useLocation();
  const placed = useRef(false);
  const place = useCallback(() => {
    if (placed.current) return;
    placed.current = true;
    const el = dockRef.current;
    let next: Offset;
    if (hasStored()) {
      userMoved.current = true;
      next = clampOffset(readStored(), el);
    } else if (viewIsBoth()) {
      next = { x: 0, y: 0 };
    } else {
      atHome.current = true;
      next = clampOffset(homeOffset(el), el, 0);
    }
    target.current = next;
    current.current = { ...next };
    // Placed, not eased: the nav is simply there when the page appears.
    if (el) el.style.transition = "none";
    apply();
    el?.getBoundingClientRect(); // commit the jump before restoring
    if (el) el.style.transition = "";
  }, [apply]);

  useEffect(() => {
    // The event page knows its view only once its data has loaded, so on that
    // route wait for it (with a fallback if the data never arrives).
    const onView = () => requestAnimationFrame(place);
    let fallback = 0;
    if (pathname === "/") {
      window.addEventListener("mmh:navhome", onView);
      fallback = window.setTimeout(place, 2000);
    } else {
      onView();
    }
    return () => {
      window.removeEventListener("mmh:navhome", onView);
      clearTimeout(fallback);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wayfinding: circling or shaking the pointer lights the nav up.
  useEffect(() => startNavSeek(), []);

  useEffect(() => {
    const stored = clampOffset(readStored(), dockRef.current);
    target.current = stored;
    current.current = stored;
    apply();

    // Pages space their content under the homed nav with --page-top, which
    // needs the dock's real height.
    const publishHeight = () => {
      const h = dockRef.current?.offsetHeight;
      if (h) document.documentElement.style.setProperty("--nav-dock-h", `${h}px`);
    };
    publishHeight();

    // A position saved on a wide window can be off screen on a narrow one, so
    // re-clamp whenever the viewport changes.
    const onResize = () => {
      publishHeight();
      // Home moves with the gutter, which is fluid, so follow it.
      if (atHome.current) target.current = homeOffset(dockRef.current);
      const next = clampOffset(target.current, dockRef.current, margin());
      if (next.x !== target.current.x || next.y !== target.current.y) {
        target.current = next;
        kick();
      }
    };
    window.addEventListener("resize", onResize);

    // Recovery hatch: Escape ANYWHERE returns the nav to rest, not just when the
    // handle has focus. If the nav ever does end up somewhere unusable, the user
    // must not have to clear site data to get it back.
    const onGlobalKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Escape: centre on a poster + media page, top left everywhere else.
      recentre();
    };
    window.addEventListener("keydown", onGlobalKey);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onGlobalKey);
      if (raf.current != null) cancelAnimationFrame(raf.current);
    };
  }, [apply, kick]);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    // Capture so the drag survives the pointer leaving the 18px handle. It can
    // throw (a pointer id that is not active, some synthetic events), and a
    // throw here would abort the handler before the drag ever starts, so the
    // capture is best-effort and never gatekeeps the gesture.
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* drag still works, it just will not track outside the handle */
    }
    dragging.current = true;
    userMoved.current = true;
    atHome.current = false;
    setGrabbed(true);
    // Moving it is the other moment legibility matters, so the same emphasis
    // that wayfinding uses is raised for the duration of the drag.
    document.documentElement.style.setProperty("--nav-move", "1");
    start.current = { px: e.clientX, py: e.clientY, ox: target.current.x, oy: target.current.y };
    kick();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || !start.current) return;
    const { px, py, ox, oy } = start.current;
    target.current = { x: ox + (e.clientX - px), y: oy + (e.clientY - py) };
    kick();
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    try {
      (e.target as Element).releasePointerCapture?.(e.pointerId);
    } catch {
      /* nothing captured, nothing to release */
    }
    dragging.current = false;
    setGrabbed(false);
    document.documentElement.style.setProperty("--nav-move", "0");
    kick(); // let the loop ease the last few pixels, then persist
  };

  const recentre = () => {
    userMoved.current = false;
    clearStored();
    if (viewIsBoth()) {
      atHome.current = false;
      target.current = { x: 0, y: 0 };
    } else {
      atHome.current = true;
      target.current = homeOffset(dockRef.current);
    }
    kick();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const map: Record<string, Offset> = {
      ArrowLeft: { x: -KEY_STEP, y: 0 },
      ArrowRight: { x: KEY_STEP, y: 0 },
      ArrowUp: { x: 0, y: -KEY_STEP },
      ArrowDown: { x: 0, y: KEY_STEP },
    };
    if (e.key === "Escape") {
      e.preventDefault();
      recentre();
      return;
    }
    const d = map[e.key];
    if (!d) return;
    e.preventDefault();
    userMoved.current = true;
    atHome.current = false;
    target.current = { x: target.current.x + d.x, y: target.current.y + d.y };
    kick();
  };

  return (
    <div className="chrome">
      <div ref={dockRef} className={`chrome__dock${grabbed ? " is-grabbed" : ""}`}>
        <button
          type="button"
          className="chrome__grab"
          aria-label="Move the navigation. Arrow keys to nudge, Escape to return it home."
          title="Drag to move"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={recentre}
          onKeyDown={onKeyDown}
        >
          {/* Move cursor glyph: four arrows from a centre point. */}
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path
              d="M8 1.5v13M1.5 8h13M8 1.5 5.9 3.7M8 1.5l2.1 2.2M8 14.5l-2.1-2.2M8 14.5l2.1-2.2M1.5 8l2.2-2.1M1.5 8l2.2 2.1M14.5 8l-2.2-2.1M14.5 8l-2.2 2.1"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <nav className="chrome__links" aria-label="Primary">
          <NavLink className="chrome__link" to="/" end>MMH</NavLink>
          <NavLink className="chrome__link" to="/archive">Archive</NavLink>
          <NavLink className="chrome__link" to="/info">Info</NavLink>
        </nav>
      </div>
    </div>
  );
}
