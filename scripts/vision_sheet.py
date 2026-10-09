#!/usr/bin/env python3
"""Build a contact sheet of flyers that still need a human or vision read.

Pairs with vision-findings.json. The loop is:
    python3 scripts/vision_sheet.py --batch 6      -> /tmp/mmh-vision-<n>.png
    (a Claude session reads the sheet and appends to vision-findings.json)
    python3 scripts/extract_flyers.py              -> merges findings into drafts

Why a sheet instead of one image at a time: reading six flyers in a single image
costs a fraction of the context of six separate reads, and the flyers are legible
at 760px wide because they are poster art with large display type.

Skips posts already recorded in vision-findings.json, so repeated runs march
through the backlog without repeating work.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
DERIVED = PROJECT_DIR / "assets" / "posters" / "derived"
DRAFTS = PROJECT_DIR / "events.draft.json"
FINDINGS = PROJECT_DIR / "vision-findings.json"
TILE_W = 760


def load_findings() -> dict:
    if not FINDINGS.exists():
        return {}
    return {k: v for k, v in json.loads(FINDINGS.read_text()).items() if not k.startswith("_")}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--batch", type=int, default=6, help="flyers per sheet")
    ap.add_argument("--out", default="/tmp/mmh-vision.png")
    ap.add_argument("--all", action="store_true", help="include posts that already have a venue")
    args = ap.parse_args()

    drafts = json.loads(DRAFTS.read_text())
    done = load_findings()
    # Surface anything MISSING ANY of the three things the site actually shows:
    # venue, date, lineup. The first pass filtered on venue alone, which left 11
    # events with no lineup even though their flyers print it.
    def incomplete(d):
        return (not d["venue"]["name"]
                or not d["djs"]
                or d["review"]["fields"].get("date") == "low")

    # Gate on whether the DRAFT is still missing something, not on whether this
    # post has been looked at once. A finding can exist and still be incomplete.
    # `visionChecked: true` in a finding means "I read the flyer and this is all
    # it prints", which stops an unanswerable post cycling forever.
    pending = [
        d for d in drafts
        if not done.get(d["shortcode"], {}).get("visionChecked")
        and (args.all or incomplete(d))
    ]
    if not pending:
        print("Nothing pending. Every flyer needing a read has a finding recorded.")
        return 0

    batch = pending[: args.batch]
    tiles = []
    for d in batch:
        # After mint_assets.py the files carry the real mmh- id, so try that first
        # and fall back to the temp id for a not-yet-minted archive.
        ids = [d["assets"][0].get("targetAssetId"), d["assets"][0].get("tempAssetId")]
        src = next((DERIVED / f"{aid}-{w}.jpg"
                    for aid in ids if aid
                    for w in (800, 400, 1200)
                    if (DERIVED / f"{aid}-{w}.jpg").exists()), None)
        if src is None:
            continue
        im = Image.open(src)
        im.thumbnail((TILE_W, 1100), Image.Resampling.LANCZOS)
        tiles.append((d, im))

    if not tiles:
        print("Pending posts have no readable derivative on disk.")
        return 0
    cols = 3 if len(tiles) > 2 else len(tiles)
    rows = (len(tiles) + cols - 1) // cols
    rowh = max(t[1].height for t in tiles) + 26
    sheet = Image.new("RGB", (cols * TILE_W, rows * rowh), (12, 12, 12))
    dr = ImageDraw.Draw(sheet)
    for i, (d, im) in enumerate(tiles):
        x, y = (i % cols) * TILE_W, (i // cols) * rowh
        sheet.paste(im, (x, y))
        dr.text((x + 4, y + im.height + 6),
                f"{i+1}. {d['shortcode']}  posted {d['postedAt'][:10]}  {d['slideCount']} slide(s)",
                fill=(200, 200, 200))
    sheet.save(args.out)

    print(f"{len(pending)} still pending, {len(tiles)} on this sheet -> {args.out}")
    for i, (d, _) in enumerate(tiles):
        print(f"  {i+1}. {d['shortcode']}  posted {d['postedAt'][:10]}  caption: {d['info'][:95] or '(none)'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
