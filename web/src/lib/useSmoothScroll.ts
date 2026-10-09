/**
 * Lenis, synced into GSAP's ticker.
 *
 * The one thing to not get wrong: Lenis and GSAP each want to own a RAF loop.
 * Running both is the standard way this pairing goes subtly wrong (motion that
 * looks fine at 120Hz and stutters at 60). So GSAP's ticker drives Lenis, and
 * gsap.ticker.lagSmoothing(0) stops GSAP from silently skipping time after a
 * long frame, which would desync the scrub.
 *
 * Under prefers-reduced-motion Lenis is not started at all. Native scrolling is
 * the accessible behavior, not a degraded one.
 */

import { useEffect } from "react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { motionTokens, prefersReducedMotion } from "../motion/tokens";

gsap.registerPlugin(ScrollTrigger);

export function useSmoothScroll() {
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const t = motionTokens(false);

    const lenis = new Lenis({
      lerp: t.scroll.lerp,
      wheelMultiplier: t.scroll.wheelMultiplier,
      touchMultiplier: t.scroll.touchMultiplier,
    });

    const root = document.documentElement;

    const onScroll = () => {
      ScrollTrigger.update();
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      root.style.setProperty("--scroll-progress", progress.toFixed(4));

    };
    lenis.on("scroll", onScroll);
    onScroll();

    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33); // restore the default
      lenis.destroy();
    };
  }, []);
}
