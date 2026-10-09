/**
 * The single source for every animated value in this app.
 *
 * No component may hardcode a duration, an easing, a stagger, a lerp factor, or
 * a parallax depth. They all come from here. Two reasons:
 *
 *   1. The entire motion character can be re-skinned by editing this one file.
 *   2. Token names stay identity-agnostic, so nothing about the motion reference
 *      that informed them leaks into this codebase as a name or an asset.
 *
 * Derived from MOTION-INVENTORY.md. Read that first if you are changing numbers,
 * because most of these are the conclusion of an observation rather than a taste.
 */

/** Seconds. GSAP speaks seconds; CSS gets these multiplied by 1000. */
export const duration = {
  /** Micro feedback: a filter restoring on hover. */
  quick: 0.28,
  /** Standard state change. */
  base: 0.6,
  /** A poster finishing its development. Deliberately slow. */
  develop: 1.1,
  /** Route change. */
  page: 0.8,
} as const;

/**
 * Easings. Named for their shape, never for a brand.
 * `settle` is the workhorse: a strong out-curve that decelerates late, which is
 * what makes a slow move read as weighted rather than sluggish.
 */
export const ease = {
  settle: "cubic-bezier(0.16, 1, 0.3, 1)",
  linear: "none",
  /** For anything that should feel mechanical, like an edge marker tracking scroll. */
  track: "cubic-bezier(0.4, 0, 0.2, 1)",
} as const;

/** Seconds between siblings in a group reveal. Small: the grid is dense. */
export const stagger = {
  tile: 0.035,
  line: 0.06,
} as const;

/**
 * Lenis. `lerp` is the single most character-defining number in the file: it is
 * the scroll's weight. Higher is snappier, lower is heavier.
 *
 * 0.085 is deliberately heavy. The reference's defining measurement was 2 scene
 * changes in 42 seconds: it does not cut, it moves, and it moves slowly.
 */
export const scroll = {
  lerp: 0.085,
  wheelMultiplier: 0.9,
  touchMultiplier: 1.5,
} as const;

/**
 * Parallax depth per layer, as a fraction of scroll distance. Positive lags
 * behind the scroll, negative leads it. Kept small on purpose: large parallax on
 * portrait flyers reads as a broken layout rather than depth.
 */
export const depth = {
  background: 0.12,
  poster: 0.06,
  caption: -0.03,
  none: 0,
} as const;

/**
 * The resting, under-developed state of a poster. This is the archive's default
 * look and the first half of the signature moment, so the two are guaranteed to
 * agree by construction.
 */
export const develop = {
  /** Resting filter for a tile nobody is looking at. */
  /** saturate 0.55: Nico 2026-09-30 raised it twice, 0.25 to 0.4 to 0.55, so the
   *  idle field keeps more of each poster's colour and hover still develops it. */
  restingFilter: "saturate(0.55) contrast(0.92) brightness(1.02)",
  restingOpacity: 0.55,
  /** Fully developed. */
  activeFilter: "saturate(1) contrast(1) brightness(1)",
  activeOpacity: 1,
  /** Blur applied to the ThumbHash placeholder underneath. */
  placeholderBlur: "12px",
  /** How far into a tile's scroll pass the development completes, 0 to 1. */
  scrubEnd: 0.65,
} as const;

/**
 * Dragging the nav.
 *
 * `followLerp` is what makes a drag feel authored rather than mechanical: the
 * nav chases the pointer instead of being pinned to it, so it lags slightly on
 * fast moves and settles on slow ones. Same idea as the scroll lerp and
 * deliberately in the same range, so the whole site shares one sense of weight.
 */
export const drag = {
  /** Per-frame approach factor toward the pointer. Lower is heavier. */
  followLerp: 0.18,
  /** Scale while held. Small on purpose: this is a nudge, not a pop. */
  grabScale: 1.04,
  /** How far the dotted frame expands when grabbed. */
  grabPadding: "0.55rem",
  /** Settle after release. */
  dropDuration: 0.42,
  /** Pixels of pointer movement before a press counts as a drag rather than a
   *  click, so grabbing the handle never eats a link activation. */
  threshold: 3,
} as const;

/**
 * Scroll lift: a wide, feathered band of colour at the edge you are scrolling
 * toward. Scroll down and it rises from the top edge, scroll up and it rises
 * from the bottom. It follows the scroll: it ramps with scroll speed and falls
 * away when you stop.
 *
 * One fixed overlay per edge with `backdrop-filter`, not a duplicate image per
 * poster. The per-poster version tracked 127 elements to answer a question the
 * viewport answers by itself. (L025 recorded backdrop-filter as rendering
 * nothing; that was applied inside each poster. On a fixed element it renders,
 * measured 2026-09-30.)
 */
export const edgeLift = {
  /** Band height, as a share of the viewport. Feathered over its full height. */
  extent: "33vh",
  /** Peak filter at full strength. Lifts a resting tile most of the way to its
   *  hover state: colour back, and a little light for the 0.55 resting opacity. */
  peak: "saturate(2.4) brightness(1.18)",
  /** Scroll speed, px per second, that reaches full strength. */
  fullSpeed: 1400,
  /** Per-frame easing toward the target: rise and fall, so the band breathes
   *  with the scroll rather than snapping. */
  rise: 0.18,
  fall: 0.07,
} as const;

/**
 * Wayfinding: circle or shake the pointer and the nav lights up.
 *
 * The nav is draggable, so it can be anywhere on screen, and it is deliberately
 * dim (difference-blended type with no chrome). Both of those are good for the
 * resting state and bad for the moment you have lost it. macOS solves the same
 * problem for the cursor with shake-to-find. This is that, for a thing the user
 * themselves moved.
 *
 * Detection, grounded in the prior art rather than invented:
 *
 *   `turnPerSecond` is the discriminator. Accumulating the ABSOLUTE angle
 *   between consecutive velocity vectors covers a circle and a shake with one
 *   number: a circle sweeps a steady 2pi per loop, a shake flips roughly pi per
 *   reversal, and purposeful travel accumulates almost nothing however fast it
 *   is. Microchip's circle-gesture patent (US9665204B2) integrates the signed
 *   angle between consecutive velocity vectors for circles; taking it unsigned
 *   generalizes it to shakes, which is exactly the oscillation term macOS-style
 *   shake detectors describe as "path length versus net displacement".
 *
 *   `maxEfficiency` is the guard. Efficiency is net displacement over path
 *   length. A deliberate seek wanders (low efficiency); crossing the screen to
 *   click something is direct (high efficiency), even along a curve. Without
 *   this, a fast arcing move to a link would trigger the effect.
 *
 *   `minPath` rejects jitter: a tiny tremor can rack up turn without being a
 *   gesture. The patent literature calls this the pattern size threshold.
 */
export const seek = {
  /** Sliding window of pointer samples, milliseconds. */
  window: 450,
  /** Radians per second of accumulated turning that counts as full intent.
   *  About one and a half loops per second, or a brisk shake. */
  turnPerSecond: 9,
  /** Above this net-displacement-to-path-length ratio it is travel, not a seek. */
  maxEfficiency: 0.55,
  /** Pixels of path within the window before anything is considered a gesture. */
  minPath: 140,
  /** Per-frame approach toward the target. Same weight family as scroll and drag. */
  ease: 0.16,
  /** Per-frame decay once the gesture stops, so it fades rather than snapping off. */
  decay: 0.94,
  /** How long full emphasis holds after a gesture ends, milliseconds. Long enough
   *  to actually look at where it is. */
  hold: 900,
} as const;

/**
 * The archive grid revolves: each night's tile cycles between its poster and one
 * or two other artifacts from that same night.
 *
 * The point is that a night was a real event with photographs, not just a piece
 * of paper. The poster is the index; the extras are evidence. Showing them in
 * the grid rather than only inside a night means the wall of flyers occasionally
 * admits a room full of people.
 *
 * Deliberately slow. This is an archive, not a carousel: at `intervalMin` a tile
 * changes about once every six seconds, and the crossfade is long enough to read
 * as a dissolve rather than a cut. Only 19 of 44 nights have anything to revolve
 * through, so most of the grid is still and the movement is occasional by
 * construction.
 *
 * Every tile gets its own interval and its own starting phase, both randomized,
 * so the grid never pulses in unison. That synchrony is the thing that makes a
 * rotating grid feel like a screensaver.
 */
export const revolve = {
  /** Most extras a tile will ever cycle through, on top of its poster. */
  maxExtras: 2,
  /** Seconds a frame is held. Randomized per tile within this range. */
  intervalMin: 6,
  intervalMax: 11,
  /** Seconds of crossfade between frames. */
  fade: 0.9,
  /** Largest random start delay, seconds, so tiles do not begin together. */
  maxPhase: 7,
} as const;

/**
 * Phone event view: one night's media, poster first, dissolving in turn. Faster
 * than the archive's revolve because here the night is the only thing on screen
 * and the cycle is how you see its photographs at all.
 */
export const focusCycle = {
  /** Seconds each frame is held. */
  interval: 5,
  /** Seconds of crossfade, shared with the archive so both dissolves match. */
  fade: revolve.fade,
} as const;

/**
 * Swipe between nights on the single-night view. A deliberate horizontal flick,
 * so a vertical drag, a slow drag or a tap never changes the night.
 */
export const swipe = {
  /** Pixels of horizontal travel before a touch counts as a swipe. */
  minDistance: 48,
  /** Horizontal travel must beat vertical travel by this factor. */
  minRatio: 1.5,
  /** Milliseconds: a touch held longer than this is a drag, not a swipe. */
  maxDuration: 700,
} as const;

/** Named patterns, so a component asks for a behavior rather than assembling one. */
export const pattern = {
  posterDevelop: {
    duration: duration.develop,
    ease: ease.settle,
    scrub: true,
  },
  tileFocus: {
    duration: duration.quick,
    ease: ease.settle,
    scrub: false,
  },
  drift: {
    depth: depth.poster,
    ease: ease.linear,
    scrub: true,
  },
  routeChange: {
    duration: duration.page,
    ease: ease.settle,
    scrub: false,
  },
  tileRevolve: {
    duration: revolve.fade,
    ease: ease.settle,
  },
  navSeek: {
    ease: seek.ease,
    decay: seek.decay,
  },
  navDrag: {
    lerp: drag.followLerp,
    scale: drag.grabScale,
    duration: drag.dropDuration,
    ease: ease.settle,
  },
} as const;

/**
 * The reduced-motion collapse.
 *
 * Note what survives: fixed chrome, the muted-by-default grid, and edge markers
 * are all static styling, so they are unaffected. Everything that moves position
 * or takes time goes to zero. A poster still develops, it just develops instantly.
 */
export const reduced = {
  duration: { quick: 0, base: 0, develop: 0, page: 0 },
  stagger: { tile: 0, line: 0 },
  scroll: { lerp: 1, wheelMultiplier: 1, touchMultiplier: 1 },
  depth: { background: 0, poster: 0, caption: 0, none: 0 },
  /** Dragging still works under reduced motion, it just stops easing: the nav
   *  tracks the pointer exactly and lands without a settle. */
  drag: { followLerp: 1, grabScale: 1, dropDuration: 0 },
} as const;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Resolve the active token set once, at call time, so a component never branches. */
export function motionTokens(reducedMotion = prefersReducedMotion()) {
  return reducedMotion
    ? { duration: reduced.duration, ease, stagger: reduced.stagger, scroll: reduced.scroll,
        depth: reduced.depth, develop, pattern, drag: { ...drag, ...reduced.drag },
        edgeLift, seek, revolve, focusCycle, swipe, reducedMotion: true }
    : { duration, ease, stagger, scroll, depth, develop, pattern, drag, edgeLift, seek, revolve, focusCycle, swipe, reducedMotion: false };
}

/** CSS custom properties, so stylesheets and JS cannot drift apart. */
export function motionCssVars(reducedMotion = prefersReducedMotion()): Record<string, string> {
  const t = motionTokens(reducedMotion);
  return {
    "--mo-quick": `${t.duration.quick}s`,
    "--mo-base": `${t.duration.base}s`,
    "--mo-develop": `${t.duration.develop}s`,
    "--mo-page": `${t.duration.page}s`,
    "--mo-ease": ease.settle,
    "--mo-ease-track": ease.track,
    "--mo-resting-filter": develop.restingFilter,
    "--mo-resting-opacity": reducedMotion ? "1" : String(develop.restingOpacity),
    "--mo-active-filter": develop.activeFilter,
    "--mo-placeholder-blur": develop.placeholderBlur,
    "--mo-drop": `${reducedMotion ? 0 : drag.dropDuration}s`,
    "--mo-grab-scale": String(reducedMotion ? 1 : drag.grabScale),
    "--mo-grab-pad": drag.grabPadding,
    "--mo-edge-extent": edgeLift.extent,
    "--mo-edge-peak": edgeLift.peak,
    "--mo-seek-hold": `${seek.hold}ms`,
    "--mo-revolve-fade": `${reducedMotion ? 0 : revolve.fade}s`,
  };
}
