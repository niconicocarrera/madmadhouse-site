# MADMADHOUSE: PLAN.md

**Domain:** projects (creative tech)
**Client:** Nico (REMAGEN). Subject: MADMADHOUSE, a DJ/party collective.
**Nico's role:** designer and builder of the collective's public archive
**Project status:** Active (early). Scaffolded 2026-09-20, no real data yet.
**Source of record:** Instagram @madmaadhouse (double-a), public, ~59 posts, all flyers
**Related:** `OVERVIEW.md`, `LOG.md`, `CONTENT.md`, `HANDOFF-PROMPT.md` (the original brief)

---

## What it is

MADMADHOUSE is a visual CV for a party collective: an archive site whose primary
artifact is the flyer. Every show the collective has thrown exists as a poster on
their Instagram, and nowhere else in a durable, browsable, or citable form. This
site turns that scattered feed into a structured, permanent record: upcoming shows
with real actions attached (tickets, email, SMS), past shows with the full printed
detail preserved (venue, date, time, the DJs as linked handles), and an archive
grid where the posters are the design. The chrome stays quiet so the flyers carry
the color. Instagram is the acquisition source, not the dependency: once harvested,
the archive stands on its own files.

## Stack

| Layer | Choice | Note |
|---|---|---|
| Bundler | Vite | REMAGEN default |
| UI | React 19 + TypeScript | |
| Routing | React Router v6 | with scroll restoration |
| Smooth scroll | Lenis | synced into `gsap.ticker`, lagSmoothing off |
| Motion | GSAP + ScrollTrigger + SplitText | SplitText is free as of GSAP 3.13 |
| Styling | Native CSS, Grid + custom properties | no framework |
| Image decode | ThumbHash | blur-up placeholder, string stored per asset |
| Extraction | Python 3.11 + Pillow 12 | native AVIF and WebP, no extra codec dep |
| Vision | gemini-2.5-pro via LiteLLM proxy | multimodal flyer read |
| Deploy | Cloudflare Pages | unlimited bandwidth, image-heavy site |

## The three-page IA

| Route | Name | What it does |
|---|---|---|
| `/` | MMH | The CV. Reverse-chronological. Upcoming entries surface tickets, email, and SMS actions; past entries show the poster with full printed info. |
| `/archive` | ARCHIVE | A fluid grid of every poster, all aspect ratios accepted, nothing cropped. |
| `/info` | INFO | Bio, contact, booking. Sourced from `CONTENT.md`. |

Ratio rule for the grid: justified rows or masonry, never a fixed-ratio crop. Each
tile declares its `aspect-ratio` from stored metadata so the layout settles before
any image loads (target: zero CLS). Below the fold is lazy, ThumbHash blurs up,
`<picture>` serves AVIF then WebP then JPEG.

## Data model and the getEvents() seam

All data access goes through exactly one module, `src/data/getEvents.ts`, exporting
`getEvents(): Promise<EventEntry[]>`. Today it reads a local typed array. A CMS
later replaces the body of that one function and no component changes. Nothing
else in the app may import `events.ts` directly.

```ts
type Confidence = "high" | "medium" | "low";
type EventEntry = {
  eventId: string;              // mmh-YYYY-MM-DD--venue-slug--NN
  status: "upcoming" | "past";  // DERIVED from date vs now, never hand-set
  title?: string;
  venue: { name: string; city?: string; address?: string };
  date: string;                 // ISO 8601
  timeText?: string;            // verbatim as printed ("10PM-2AM")
  djs: Array<{ name: string; instagram?: string; confidence: Confidence }>;
  info?: string;
  links?: { tickets?: string; email?: string; sms?: string };
  assets: Array<{ assetId: string; aspectRatio: number; role: "flyer" | "extra" }>;
  source: { igShortcode?: string; caption?: string; altText?: string };
  review: { fields: Record<string, Confidence>; needsHumanReview: boolean };
};
```

Required fields: `eventId`, `status`, `venue.name`, `date`, and at least one asset.
`status` is computed at read time, so an upcoming show becomes a past show with no
edit. Seeded with 3 placeholder entries (1 upcoming, 2 past) so the site builds and
renders before any real data exists.

## Asset naming and the swap-originals seam

Images are referenced **only** by `assetId`. The file on disk is `<assetId>.<ext>`.
No component, route, or data file ever holds a path or a URL.

Provenance lives in a parallel `sourceMeta` record, never in `EventEntry`:
`{ assetId, igShortcode, igImageWidth, igImageHeight, capturedAt, isOriginal: false }`.

The swap seam: replacing an Instagram-sourced flyer with a print original means
dropping the new file at the same `assetId`, flipping `isOriginal` to true, and
rerunning `build_derivatives.py`. Nothing else moves. **This is now low priority.**
Instagram serves this account at roughly 2000px wide (a verified pull returned
2005 x 2673), which is near print quality, so the IG pull is treated as the archive
source of truth rather than a placeholder.

## Acquisition and triple-signal extraction

Acquisition runs in a Cowork / Claude-in-Chrome session, because Claude Code has no
logged-in browser. The two sessions meet at one directory and one executable
contract, not at a conversation.

```
CLAUDE CODE (build)          COWORK / CHROME (harvest)      CLAUDE CODE (build)
 writes the contract     ->   runs it                   ->   consumes it
  HARVEST-COWORK-              metadata pass                 validate_manifest.py
    PROMPT.md                  browser-triggered download    build_derivatives.py
  manifest.schema.json         writes manifest.json          extract_flyers.py
  validate_manifest.py         writes originals/*.jpg        -> events.ts
  empty originals/             runs validate, needs exit 0   -> site renders real data
```

The handshake is executable: the harvest session is done when
`python3 scripts/validate_manifest.py` exits 0, not when it says it is done. This
follows lesson L015 (a generator ships a `--validate` mode and is not reported done
until validation passes).

Three signals feed every field, and every field carries its own confidence:

| Signal | Source | Strength |
|---|---|---|
| `altText` | the IG image `alt` attribute | strong. Already carries transcribed flyer text with @handles inline. |
| `captionText` | `og:description` and the caption DOM node | strong for @mentions, loose for detail |
| vision | gemini-2.5-pro reading the flyer image | catches what the other two omit, weakest on stylized type |

Cross-reference rule: signals agree = `high`. Single source = `medium`. Disagree or
illegible = `low` plus `needsHumanReview`. Caption and alt @mentions are ground
truth for DJ Instagram handles; a vision-read DJ name with no matching handle is
flagged, never guessed.

**The three human checkpoints:**
- **A (Chrome):** run the harvest. Images in `originals/`, `manifest.json` written, validator green.
- **B (Nico):** verify the low-confidence fields in `extraction-review.html`. Corrections write back to `events.ts`.
- **C (Nico):** supply the motion reference, which unlocks Phase 6.

## Motion system and the token file

Every animated value in the app comes from `src/motion/tokens.ts`: durations,
easings, stagger, scroll lerp, parallax depths, and named patterns. No component
hardcodes a duration or an easing. Two reasons: the whole motion character can be
re-skinned in one file once the reference lands, and the token names stay
identity-agnostic so nothing about the reference's brand leaks into this codebase.

Lenis drives scroll, synced into `gsap.ticker` with `lagSmoothing` off (running two
RAF loops is the standard way this pairing breaks). All non-essential motion is
gated behind `prefers-reduced-motion`.

The reference protocol (Phase 6) borrows technique and never content, imagery, or
brand: build a motion inventory, map each behavior to a web technique with
tradeoffs, fill the tokens, then invent an MMH-native equivalent for the signature
moment rather than copying the effect.

## Visual system

Decided 2026-09-20: the palette is **derived from the flyers**, not from a supplied
brand file. Once posters land, `scripts/extract_palette.py` samples dominant colors
across the archive and proposes the color roles. Until then the site runs on
restrained neutral chrome. The MMH wordmark is still a TODO (see blockers).

## Deploy

Cloudflare Pages. Custom domain is a **TODO**: none registered yet, so the launch
target is the `*.pages.dev` subdomain and the domain gets wired later.
Pre-deploy runs through the `deploy-prep` checklist.

## Definition of done

1. All ~59 posts harvested, validator exits 0, every assetId resolves to a file and back.
2. Every event either reads `high` confidence across its required fields or is
   explicitly human-verified at Checkpoint B.
3. Lighthouse mobile >= 85. If JS weight sinks it, the documented fallback is Astro
   islands with React only for the interactive grid. Do not switch preemptively.
4. No horizontal scroll and no layout shift on image load, at mobile and desktop widths.
5. `prefers-reduced-motion` honored across every animated surface.
6. Every DJ Instagram link resolves.
7. Upcoming and past render correctly, with `status` derived and never hand-set.
8. No em dashes anywhere in the repo (L006), verified by grep.
9. Would a senior engineer at a good agency ship this?

## Open blockers

| Blocker | Owner | Note |
|---|---|---|
| Checkpoint A: the harvest has not run | Nico (Cowork session) | Everything downstream of real data waits on this. Prompt is written and ready to paste. |
| Checkpoint C: motion reference | Nico | Offered 2026-09-20. Site ships tasteful defaults until it lands. |
| MMH wordmark file | Nico | Palette is derived from flyers, but the mark itself still has to be supplied. |
| Custom domain | Nico | Not registered. Launch on `pages.dev` until then. |
| CONTENT.md is unfilled | Nico | Bio, contact, booking copy. The INFO page is a shell until filled. |
| No ticketing or list provider chosen | Nico | `links` seam is built so mailto and a signup placeholder swap for real providers with no layout change. |
