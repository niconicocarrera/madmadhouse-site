import { Outlet, ScrollRestoration } from "react-router-dom";
import { Chrome } from "./components/Chrome";
import { useSmoothScroll } from "./lib/useSmoothScroll";
import { useMotionVars } from "./lib/useMotionVars";

/**
 * The shell. Behaviors 1 and 6 from MOTION-INVENTORY.md: chrome that never
 * moves while content passes behind it, and edge markers that report position
 * without a scrollbar. Neither animates position, so both survive
 * prefers-reduced-motion untouched.
 */
export default function App() {
  useMotionVars();
  useSmoothScroll();

  return (
    <>
      <a className="u-skip" href="#main">Skip to content</a>

      <Chrome />

      <main id="main">
        <Outlet />
      </main>

      <ScrollRestoration />
    </>
  );
}
