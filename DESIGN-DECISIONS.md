# MADMADHOUSE: DESIGN-DECISIONS.md

_Decisions worth defending, written up while the reasoning is still intact._
_Case-study material: each entry is a problem, the prior art, the mechanism, and_
_the evidence it works. Motion values all live in `web/src/motion/tokens.ts`._

---

## 01. Wayfinding: circle the pointer to find the nav

**Date:** 2026-09-30

### The problem this project created for itself

Two earlier decisions were each right on their own and collide:

1. The nav is **deliberately quiet**. No bar, no background, no border. Three
   words of small uppercase type, difference-blended so they survive over a black
   field and over a full-bleed poster. The archive's content is loud printed
   artifacts; the chrome stays out of their way.
2. The nav is **draggable**, and it remembers where you put it. It sits at the
   centre of the viewport by default, but it can be anywhere.

Together: a low-contrast element, in a position only the user knows, over
constantly changing imagery. The resting state is correct and the lost state is
the user's own doing. That is precisely the condition an affordance should exist
for, and precisely the condition where a permanent affordance would undo
decision 1.

### The precedent

macOS solves the identical shape of problem for the cursor: shake the pointer and
it grows, proportionally, then settles back. The design properties worth stealing
are not the visual, they are the contract:

- **Nothing at rest.** It costs the quiet state nothing.
- **Summoned by an act that is already what you do when lost.** Nobody has to
  learn it. Hunting for something you cannot see produces this motion naturally.
- **Proportional, not binary.** The response tracks how hard you gesture, so it
  reads as physical rather than as a triggered animation.
- **Suppressed while a button is held.** Dragging must never fire it. That
  matters twice here, because the nav is itself dragged.

### The mechanism, and why the obvious version fails

The naive detector is speed: move fast, light it up. That fails immediately,
because crossing the screen quickly to click a link is fast and purposeful, and
lighting up the nav every time someone moves decisively is worse than not having
the feature.

The real discriminator is that a seek is **energetic but goes nowhere**.

Three measurements over a 450ms sliding window:

| Term | What it is | What it rejects |
|---|---|---|
| **Accumulated turn** | Sum of the ABSOLUTE angle between consecutive velocity vectors | Straight travel, however fast |
| **Efficiency** | Net displacement over total path length | A fast but purposeful curved move |
| **Path length** | Total distance travelled in the window | Tremor and jitter |

The first term is the interesting one, because it unifies two different gestures
under one number. A circle sweeps a steady 2pi per loop. A shake flips roughly pi
per reversal. Purposeful travel, at any speed, accumulates almost nothing. So
"circle it" and "shake it" both work without either being special-cased, and the
user does not have to know which one the site wants.

This is not invented. Microchip's continuous circle-gesture patent (US9665204B2)
integrates the **signed** angle between consecutive velocity vectors to count
loops. Taking the same integral **unsigned** generalizes it from circles to any
non-productive motion, which is exactly the "total path length versus net
displacement" oscillation term that macOS-style shake detectors are described as
using. The efficiency guard and the minimum-path threshold are the patent
literature's pattern-size filters, which exist to reject "scattered meaningless
movements".

### Verified, not asserted

The detector was run against seven synthetic pointer paths sampled at 120Hz, four
of which are the failure modes that matter:

| Gesture | Score | Expected | |
|---|---|---|---|
| Circle, 1.5 loops, r=70 | 1.00 | fire | PASS |
| Circle, slow half loop | 0.00 | quiet | PASS |
| Shake, 5 reversals, 90px | 1.00 | fire | PASS |
| **Fast straight travel, 600px** | 0.00 | quiet | PASS |
| **Fast wide arc** | 0.00 | quiet | PASS |
| Tiny jitter | 0.00 | quiet | PASS |
| Slow drift toward a link | 0.00 | quiet | PASS |

The two bolded rows are the ones a speed-based detector fails. They are the
reason the design is three terms instead of one.

### What it does when it fires, after one revision

**A halo was built first and cut.** A radial white field behind the links,
inverted by the difference blend. It worked and it was wrong: it read as a glow
laid over the page rather than as the nav itself becoming legible. For an
interface whose whole argument is that the chrome stays out of the way, the
moment it speaks up it should speak *as itself*, not summon a new object.

What shipped instead is the same emphasis carried entirely by the existing
element: the type goes to full opacity, the tracking opens, the dotted frame
surfaces, and a hairline rule draws itself in from the centre. Nothing is added
to the page. The nav gets louder the way type gets louder.

The cut version, for the record, was a radial white halo behind the links. The nav's parent already carries
`mix-blend-mode: difference`, so a white field **inverts** whatever is underneath
rather than sitting on top of it. That produces maximum contrast over a near-black
page and over a bright poster with one rule, no measurement, and no second colour
scheme for light backgrounds. The type firms up at the same time: opacity to
full, tracking widening slightly so it reads as a deliberate state rather than a
hover.

The halo scales as it fades in, so the arrival has direction. Intensity is eased
toward the detector's output at the same weight as the scroll lerp and the nav
drag lerp, so it swells and settles rather than flickering at the pointer sample
rate. A strong gesture earns a hold before the decay starts, because fading the
instant the hand stops would defeat the purpose: you need a moment to actually
look at where it is.

### One signal, two sources

Dragging the nav raises the same emphasis. The two moments the nav must stop
being quiet are "I cannot find it" and "I am moving it", so they share a single
`--emph` value (`max(--nav-seek, --nav-move)`) and therefore a single visual
language. Adding a second treatment for the drag state would have been two
vocabularies for one idea.

### Accessibility and cost

Under `prefers-reduced-motion` the detector does not run at all and the halo is
pinned off, so the nav keeps its resting contrast and nothing animates. This is
decoration driven purely by motion, so the honest reduction is none of it, not a
slower version of it.

The listener is passive and the rAF loop only runs while emphasis is non-zero,
stopping itself otherwise. A still pointer costs nothing.

### The case-study line

The interesting part is not the effect. It is that a quiet interface and a movable
one create a findability problem that neither creates alone, and that the fix is a
gesture people already perform when lost, detected by the thing that actually
distinguishes searching from travelling: motion that spends energy without
covering ground.

---

## 02. Light and dark from the system, and what adding it caught

**Date:** 2026-09-30

### Not an inversion

The dark field is near-black because a nightlife archive of scanned flyers reads
that way. The light field is a warm paper tone for the same reason: the artifacts
sit on something that behaves like the stock they were printed on, rather than on
a UI white. Two considered surfaces, not one surface and its negative.

### Solved against WCAG, not picked

Every quiet token was solved for the **least-extreme value that still clears
4.5:1**, rather than defaulted to black or white. That keeps the hierarchy as
quiet as it can honestly be: dimmed text passes at 4.50:1 rather than being
dragged to 8:1 and flattening the difference between it and body text.

`scripts/contrast_check.py` parses `tokens.css` directly, so the audit cannot
drift from the palette, and it flattens translucent foregrounds over their
background before measuring, because a token that passes at full opacity can fail
at the opacity it is actually drawn with.

### The audit found a pre-existing failure

The archive's date captions were `#4e4e55` on `#0b0b0c`: **2.38:1**, against a
4.5 requirement. Not a light-mode regression, a bug that had been shipping. A
date is content, not decoration. Raised to the least-extreme passing value,
4.55:1.

The hairline rule measures 1.26:1 and is reported as informational rather than as
a failure: 1.4.11 covers visual information needed to identify components and
their states, and a divider that carries no state and bounds no control is
decorative. Forcing it to 3:1 would turn a hairline into a drawn line. The
checker classifies this explicitly rather than quietly lowering a threshold.

### The blend mode paid for itself twice

The nav and the event-view metadata are white type under
`mix-blend-mode: difference`. That was chosen so they stay legible over
full-bleed posters. It turns out to cover the colour scheme for free, because
difference inverts whatever is behind it:

| Backdrop | Renders as | Contrast |
|---|---|---|
| Dark field | `#f4f4f3` | 17.88:1 |
| Paper field | `#0c0e13` | 17.10:1 |
| A dark poster | `#e5ebe7` | 15.01:1 |
| A bright poster | `#17263b` | 11.01:1 |

One declaration, no light-mode override, and it beats AA everywhere by a wide
margin. A choice made for one reason turning out to solve a second is worth
noticing, because it is an argument for picking mechanisms over patches.

### What light mode caught that dark mode was hiding

The event view's thumbnail strip had been moved inside the difference-blended
container, so **every thumbnail image was being inverted**. Nobody saw it,
because against a near-black field `|image - 11|` is close enough to the image to
look right. On a paper field it inverts hard: a warm brown pixel `#8a6f52`
renders `#7f6446` on dark and `#69829a`, a cold blue, on light.

A blended ancestor blends its entire rendered result, images included, so a child
cannot opt out. The fix was structural: the blend belongs on the text block
alone, which is the only part that needs to survive a poster behind it.

The general lesson, and the case-study line: **a second colour scheme is a test,
not a feature.** It re-renders every assumption against a different backdrop and
surfaces the ones that were only ever true because the background happened to be
near zero.
