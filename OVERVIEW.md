# MADMADHOUSE: OVERVIEW.md

_Cold-start orientation. Read this first, then `PLAN.md` for the method._

MADMADHOUSE (IG: @madmaadhouse, note the double-a) is a DJ and party collective
operating between Aurora and Chicago. Their entire history exists as flyers on a
public Instagram of roughly 59 posts and nowhere else durable. This project turns
that feed into a visual CV: a three-page site (MMH, ARCHIVE, INFO) where the poster
is the primary artifact, upcoming shows carry real actions, past shows preserve the
printed detail, and the chrome stays quiet enough that the flyers carry the color.
Instagram is the acquisition source, not a runtime dependency. A key verified fact
shapes the whole pipeline: IG serves this account at roughly 2000px wide, which is
near print quality, so the harvested images are the archive rather than placeholders
awaiting originals. A second verified fact shapes extraction: the image `alt`
attribute already carries transcribed flyer text with @handles inline, giving a
third signal alongside the caption and a vision pass.

**Status as of 2026-09-20: Active, early.** Scaffolded this session. No real event
data exists yet. The site is built and verified against 3 seeded placeholder
entries. The acquisition harvest has not run.

**The one structural decision to know:** all data access goes through
`src/data/getEvents.ts`. Components never import `events.ts`. Swapping in a CMS
later means replacing the body of one function.

**The one coordination fact to know:** acquisition cannot run in Claude Code, which
has no logged-in browser. It runs in a Cowork / Claude-in-Chrome session against
`HARVEST-COWORK-PROMPT.md`. The two sessions meet at
`assets/posters/` and at one executable contract: the harvest is done when
`python3 scripts/validate_manifest.py` exits 0.

**What is blocking:** Checkpoint A (the harvest itself), the MMH wordmark file,
CONTENT.md copy for the INFO page, and a registered domain. The motion reference
landed 2026-09-20 and is no longer blocking.
