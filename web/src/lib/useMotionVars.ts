/**
 * Publishes the motion tokens as CSS custom properties on :root, and republishes
 * them when the user's reduced-motion preference changes mid-session.
 *
 * This is why no stylesheet hardcodes a duration: the values a stylesheet reads
 * and the values GSAP reads come from the same object.
 */

import { useEffect } from "react";
import { motionCssVars } from "../motion/tokens";

export function useMotionVars() {
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      const vars = motionCssVars(mq.matches);
      for (const [k, v] of Object.entries(vars)) {
        document.documentElement.style.setProperty(k, v);
      }
      document.documentElement.dataset.reducedMotion = String(mq.matches);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
}
