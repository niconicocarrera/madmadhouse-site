/**
 * Detects a deliberate "where is it" pointer gesture and publishes its strength.
 *
 * One signal covers circling AND shaking, because they are the same intent:
 * motion that is energetic but goes nowhere. See motion/tokens.ts `seek` for the
 * reasoning and the prior art. In short:
 *
 *   turn       accumulated ABSOLUTE angle between consecutive velocity vectors.
 *              A circle sweeps 2pi per loop, a shake flips ~pi per reversal,
 *              purposeful travel accumulates almost nothing however fast it is.
 *   efficiency net displacement / path length. A seek wanders, travel is direct.
 *   path       total distance, so a tremor cannot qualify.
 *
 * Published as `--nav-seek` on :root, 0 to 1, eased rather than raw so the nav
 * swells and fades instead of flickering with the sample rate.
 *
 * Suppressed while a pointer button is down, which is the same rule
 * shake-to-find implementations use: dragging must never trigger it. Here that
 * matters twice over, because the nav itself is draggable.
 */

import { motionTokens, prefersReducedMotion } from "../motion/tokens";

interface Sample { x: number; y: number; t: number }

const samples: Sample[] = [];
let target = 0;
let current = 0;
let raf: number | null = null;
let holdUntil = 0;
let buttonDown = false;
let started = false;

function angleBetween(ax: number, ay: number, bx: number, by: number) {
  // atan2 of the cross and dot products gives the signed turn directly. Taken
  // unsigned so a circle and a shake both register.
  const cross = ax * by - ay * bx;
  const dot = ax * bx + ay * by;
  return Math.abs(Math.atan2(cross, dot));
}

function score(now: number): number {
  const { seek } = motionTokens();
  while (samples.length && now - samples[0].t > seek.window) samples.shift();
  if (samples.length < 4) return 0;

  let path = 0;
  let turn = 0;
  let px = 0, py = 0;
  for (let i = 1; i < samples.length; i++) {
    const vx = samples[i].x - samples[i - 1].x;
    const vy = samples[i].y - samples[i - 1].y;
    const len = Math.hypot(vx, vy);
    if (len < 0.5) continue;           // ignore sub-pixel noise between samples
    path += len;
    if (px || py) turn += angleBetween(px, py, vx, vy);
    px = vx; py = vy;
  }
  if (path < seek.minPath) return 0;

  const first = samples[0];
  const last = samples[samples.length - 1];
  const displacement = Math.hypot(last.x - first.x, last.y - first.y);
  const efficiency = displacement / path;
  if (efficiency > seek.maxEfficiency) return 0;   // travelling, not searching

  const seconds = Math.max(0.001, (last.t - first.t) / 1000);
  const rate = turn / seconds;
  return Math.min(1, rate / seek.turnPerSecond);
}

function tick() {
  const { seek } = motionTokens();
  const now = performance.now();

  if (now > holdUntil) target *= seek.decay;
  current += (target - current) * seek.ease;
  if (current < 0.002 && target < 0.002) {
    current = 0;
    document.documentElement.style.setProperty("--nav-seek", "0");
    raf = null;
    return;
  }
  document.documentElement.style.setProperty("--nav-seek", current.toFixed(3));
  raf = requestAnimationFrame(tick);
}

function kick() {
  if (raf == null) raf = requestAnimationFrame(tick);
}

function onMove(e: PointerEvent) {
  // Never while a button is held: that is a drag, and the nav is draggable.
  if (buttonDown) {
    samples.length = 0;
    return;
  }
  const now = performance.now();
  samples.push({ x: e.clientX, y: e.clientY, t: now });
  const s = score(now);
  if (s > target) {
    target = s;
    // Full intent earns a hold, so the nav stays lit long enough to actually
    // find it rather than fading the instant the hand stops.
    if (s > 0.6) holdUntil = now + motionTokens().seek.hold;
  }
  if (target > 0) kick();
}

const onDown = () => { buttonDown = true; samples.length = 0; };
const onUp = () => { buttonDown = false; samples.length = 0; };

/** Start listening. Returns a teardown. Safe to call more than once. */
export function startNavSeek(): () => void {
  if (typeof window === "undefined" || started) return () => {};
  // Pure wayfinding decoration driven by motion: under a reduced-motion
  // preference it does not run at all, and the nav keeps its resting contrast.
  if (prefersReducedMotion()) return () => {};
  started = true;
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerdown", onDown, { passive: true });
  window.addEventListener("pointerup", onUp, { passive: true });
  window.addEventListener("pointercancel", onUp, { passive: true });
  return () => {
    started = false;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    if (raf != null) cancelAnimationFrame(raf);
    raf = null;
    samples.length = 0;
    target = current = 0;
    document.documentElement.style.setProperty("--nav-seek", "0");
  };
}

/** Exposed for testing the detector against synthetic pointer paths. */
export const __test = { score, samples };
