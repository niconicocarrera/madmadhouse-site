# MADMADHOUSE: MOTION-INVENTORY.md

_Phase 6 of `PLAN.md`. Built 2026-09-20 from the reference Nico supplied
(`~/Desktop/jarodtaber.mov`, 42s, 1920x1248, 60fps screen capture of
jarodtaber.com and jarodtaber.com/archive), sampled at 4fps into 168 frames plus
scene-change detection._

**The rule this document exists to enforce:** borrow technique, never content,
imagery, or brand. Everything below is a behavior and a mechanism. No reference
imagery is committed to this repo, no token is named after the reference, and the
signature moment is deliberately replaced rather than reproduced. Where a behavior
could not be honestly separated from the reference's identity, it is listed under
**Do not take** with the reason.

---

## First finding, from the measurement rather than the eye

Scene-change detection at a 0.25 threshold found **2 cuts in 42 seconds**. A site
of this density would normally produce dozens. That single number characterizes
the whole piece before any frame is examined: **this reference does not cut, it
moves.** Every change of state is continuous, which means the motion is
scroll-driven and scrubbed rather than triggered and played. Any implementation
that reaches for timeline-triggered entrance animations is already the wrong
shape, regardless of how the easing is tuned.

The second measurement that matters: a single full-bleed image is held from
roughly 0.75s to 5.25s. **Four and a half seconds on one image.** The pacing is
unhurried to the point of being confrontational, and that confidence is most of
the character.

## The two surfaces

| Surface | What it is | MMH equivalent |
|---|---|---|
| Index / archive | A dense grid of mixed-aspect images, every tile held at low contrast, vertical scroll, fixed nav overlaid | ARCHIVE |
| Feature river | A near-white field where one or two large works drift through at varied scale and vertical offset, with small fixed edge markers | MMH, the CV |

The correspondence to MADMADHOUSE is close enough to be worth stating plainly:
the reference's two modes are exactly the two modes an archive of flyers needs.
That is why this reference was a good choice, and also why the copying risk is
real enough to need this document.

---

## Motion inventory

### 1. Fixed chrome, moving content
The nav (`JAROD TABER  INFORMATION  INDEX`) sits centered and **never moves**
while everything underneath changes. It is not a header that scrolls away and
returns; it is a permanent overlay that the content passes behind.

**Technique:** `position: fixed`, `mix-blend-mode: difference` so one nav color
reads against both a white field and a black one. No JS.
**Take it.** This is a layout decision, not an identity.

### 2. Default-muted media, restored on focus
Every grid tile renders **desaturated and low-contrast by default**. At 13.00s a
single tile sits at full saturation while every neighbor stays washed out. The
grid is quiet until you point at it.

**Technique:** `filter: saturate(.25) contrast(.9) opacity(.55)` as the resting
state, transitioning to `none` on hover and on `:focus-visible`. A CSS transition
on `filter` is enough; this does not need GSAP.
**Take it, and it earns its place here more than anywhere.** MMH's posters are
loud, saturated, hand-made objects. A grid of 59 loud flyers at full volume is
noise. Muting by default turns the archive into a field and makes attention the
thing that restores color. It also serves the brief's own instruction that the
chrome stay restrained and the posters carry the color: this is how you honor
that while still showing 59 of them at once.

### 3. Velocity-driven horizontal smear (the signature moment)
At 10.75s to 11.00s the screen goes black and fills with horizontal white
streaks: tiles stretched along the scroll axis at high velocity, resolving back
into the grid. It is the piece's one showpiece.

**Technique:** track scroll velocity from Lenis, map it to a horizontal
`scaleX` plus blur (or a WebGL displacement pass for the smear quality seen here).
**DO NOT TAKE.** See "Do not take" below. An MMH-native replacement is specified
instead.

### 4. Long holds and generous pacing
Full-bleed media holds 4 to 5 seconds. Cards in the river hold 1 to 2.5 seconds
while drifting.

**Technique:** this is not an animation, it is a scroll-distance decision. Give
each feature enough scroll length that a normal scroll rate produces a multi-second
dwell. In practice: tall sections, small parallax deltas.
**Take it.** Pacing is not ownable.

### 5. Continuous drift, not entrance animation
Cards in the river are always in motion, entering and leaving frame at varied
vertical offsets and scales. Nothing "arrives" and stops.

**Technique:** ScrollTrigger with `scrub`, mapping scroll progress to `y` and
`scale` across the full section, with a different depth factor per card.
**Take it,** with one adjustment: the reference's drift is horizontal-leaning.
MMH's flyers are portrait objects, so the drift should run vertical with small
horizontal offsets, which suits the aspect ratios actually in the archive.

### 6. Edge markers
Small dots sit at the left, right, and bottom viewport edges, fixed, marking
position without a scrollbar.

**Technique:** fixed pseudo-elements whose offset is bound to scroll progress.
**Take it.** Useful and generic.

### 7. Perspective mockups composited with flat cards
At 24.5s to 25.5s a magazine spread is shown in 3D perspective, then a flat image
slides across it.

**Technique:** CSS 3D transforms on a flat image, or a pre-rendered mockup.
**Skip for now.** MMH's artifact is a flyer, not a print portfolio, and a fake
3D magazine would be borrowed staging rather than borrowed technique. If a
physical treatment is wanted later, photograph an actual printed flyer.

### 8. Inline autoplaying video tiles
At 29s to 32s a video tile plays inline in the grid alongside stills.

**Technique:** `<video muted playsinline loop autoplay preload="none">` with an
IntersectionObserver pausing it off-screen.
**Take it when there is footage.** MMH has none yet. The grid already accepts a
video tile by aspect ratio, so this costs nothing to leave ready.

---

## Do not take

**The horizontal light-smear transition.** Three reasons, in order of weight:

1. **It is the piece's signature.** It is the one moment a viewer would recognize
   and attribute. Reproducing it is not borrowing a technique, it is wearing
   someone's face. The brief's instruction is explicit and this is the exact
   thing it is about.
2. **It is expensive.** The smear quality visible in the frames points at a WebGL
   displacement pass, which means a canvas, a shader, and a second renderer on a
   page whose Lighthouse mobile budget is already spoken for by 59 images.
3. **It is not about flyers.** The effect reads as film, speed, light leak. MMH's
   material is printed paper photographed and posted.

## The MMH-native signature moment: the poster develops

The replacement is already half-built, which is why it is the right one.

Every asset carries a ThumbHash, generated by `build_derivatives.py` for the
blur-up placeholder. A ThumbHash decodes to a blurred, color-accurate ghost of the
image. **So the loading state already looks like a photograph in the developer
tray.** The signature moment is to stop hiding that and stage it:

- A poster enters as its ThumbHash: blurred, flat, slightly cool.
- As it settles, the full image cross-dissolves in over the blur while a slight
  contrast and saturation ramp runs, resolving from washed to full.
- The development is **scroll-scrubbed, not timed**, so scrolling back un-develops
  it. That reversibility is what makes it feel like a material rather than an
  animation.
- On the ARCHIVE grid the same mechanism does double duty: the resting state of
  every tile (muted, per behavior 2) is simply an under-developed poster, and
  focus finishes developing it.

Why this is the right answer rather than a consolation prize:

- It is **native to the material.** Flyers are printed photographic objects.
- It is **free.** ThumbHash blur-up is already required for zero-CLS loading. The
  identity moment and the performance technique are the same code, so the site
  gets its signature without a shader, a canvas, or a kilobyte of new dependency.
- It **degrades honestly.** Under `prefers-reduced-motion` the development becomes
  an instant swap, and nothing about the page stops making sense.
- It **cannot be mistaken for the reference.** Nothing smears, nothing streaks.

Risk to watch: cross-dissolving a full-resolution 2000px image over a blur, on 59
tiles, will thrash if every tile does it at once. Mitigation already planned:
below-the-fold tiles are lazy, the dissolve runs on the decoded image only
(`img.decode()` before the swap), and the scrubbed ramp is a compositor-only
property pair (`opacity` and `filter`), never a layout property.

---

## Mapping to tokens

Every behavior above lands in `web/src/motion/tokens.ts` under an
identity-agnostic name. No token is named for the reference, and no token encodes
reference imagery. The file is the only place a duration, easing, stagger, lerp,
or depth is written, so re-skinning the entire motion character is one file.

Under `prefers-reduced-motion`, the token file collapses: durations go to 0,
scrub becomes instant, parallax depths go to 0, and the development becomes a
swap. Behaviors 1, 2, and 6 survive because none of them animate position.
