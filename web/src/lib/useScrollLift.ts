import { useEffect } from "react";
import { motionTokens, prefersReducedMotion } from "../motion/tokens";

/**
 * Drives `--lift-top` and `--lift-bottom` (0 to 1) on the given element from
 * scroll direction and speed. Down lights the top edge, up lights the bottom.
 * One rAF loop, running only while a value is moving.
 */
export function useScrollLift(target: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = target.current;
    if (!el || prefersReducedMotion()) return;
    const { edgeLift } = motionTokens();

    let lastY = window.scrollY;
    let lastT = performance.now();
    let want = { top: 0, bottom: 0 };
    const now = { top: 0, bottom: 0 };
    let raf = 0;

    const tick = () => {
      // No scroll event for a frame or two means the scroll has stopped.
      if (performance.now() - lastT > 80) want = { top: 0, bottom: 0 };
      let moving = false;
      for (const k of ["top", "bottom"] as const) {
        const rate = want[k] > now[k] ? edgeLift.rise : edgeLift.fall;
        now[k] += (want[k] - now[k]) * rate;
        if (Math.abs(want[k] - now[k]) < 0.002) now[k] = want[k];
        else moving = true;
      }
      el.style.setProperty("--lift-top", now.top.toFixed(3));
      el.style.setProperty("--lift-bottom", now.bottom.toFixed(3));
      raf = moving || want.top || want.bottom ? requestAnimationFrame(tick) : 0;
    };

    const onScroll = () => {
      const t = performance.now();
      const dy = window.scrollY - lastY;
      const dt = Math.max(1, t - lastT);
      lastY = window.scrollY;
      lastT = t;
      const speed = Math.min(1, Math.abs(dy / dt) * 1000 / edgeLift.fullSpeed);
      want = dy > 0 ? { top: speed, bottom: 0 } : dy < 0 ? { top: 0, bottom: speed } : want;
      if (!raf) raf = requestAnimationFrame(tick);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [target]);
}
