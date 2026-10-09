#!/usr/bin/env python3
"""Contact sheets for classifying an asset as poster, image, or video.

The archive shows a night's POSTER and its PHOTOGRAPHS as separate grid cells, so
which is which has to be right. It was being decided by carousel position (slide
one is the poster, the rest are not), which is wrong in both directions: a recap
post's first slide is a photograph, and a flyer post's second slide is often a
second poster design.

Scope, computed rather than assumed:
  50 assets come from posts a vision pass already identified as recaps, so they
     are photographs.
  43 are slide one of a flyer post, so almost certainly the poster.
  34 are slides 2..n of a flyer post and genuinely ambiguous. Only those need eyes.

Each sheet leads with that night's slide one as a REFERENCE tile, so the question
is the concrete "is this the same kind of thing as the poster beside it" rather
than an abstract judgement.

  python3 scripts/classify_sheet.py --batch 6 --out /tmp/mmh-kind-1.png
"""
from __future__ import annotations
import argparse, json
from pathlib import Path
from PIL import Image, ImageDraw

PROJECT = Path(__file__).resolve().parent.parent
DERIVED = PROJECT / "assets" / "posters" / "derived"
DRAFTS = PROJECT / "events.draft.json"
MANIFEST = PROJECT / "assets" / "posters" / "manifest.json"
KINDS = PROJECT / "asset-kinds.json"
TILE_W = 460


def load_kinds() -> dict:
    if not KINDS.exists():
        return {}
    return {k: v for k, v in json.loads(KINDS.read_text()).items() if not k.startswith("_")}


def unknown_assets():
    d = json.loads(DRAFTS.read_text())
    man = json.loads(MANIFEST.read_text())
    per_sc = {p["shortcode"]: len([i for i in p["images"] if not i.get("setAside") and not i.get("lost")])
              for p in man["posts"]}
    done = load_kinds()
    out = []
    for x in d:
        merged = x.get("mergedFrom") or []
        n_recap = sum(per_sc.get(sc, 0) for sc in merged)
        own = len(x["assets"]) - n_recap
        if own <= 1:
            continue
        ref = x["assets"][0]
        for a in x["assets"][1:own]:
            if a["targetAssetId"] in done:
                continue
            out.append({"event": x, "asset": a, "ref": ref})
    return out


def src(aid: str):
    for w in (800, 400, 1200):
        f = DERIVED / f"{aid}-{w}.jpg"
        if f.exists():
            return f
    return None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--batch", type=int, default=6)
    ap.add_argument("--out", default="/tmp/mmh-kind.png")
    a = ap.parse_args()

    pending = unknown_assets()
    if not pending:
        print("Nothing pending: every ambiguous asset has a recorded kind.")
        return 0
    batch = pending[: a.batch]

    pairs = []
    for item in batch:
        fa, fr = src(item["asset"]["targetAssetId"]), src(item["ref"]["targetAssetId"])
        if not fa:
            continue
        pairs.append((item, fa, fr))

    cols = 3 if len(pairs) > 2 else max(1, len(pairs))
    rows = (len(pairs) + cols - 1) // cols
    cell_h = 0
    loaded = []
    for item, fa, fr in pairs:
        im = Image.open(fa); im.thumbnail((TILE_W, 620), Image.Resampling.LANCZOS)
        ref = None
        if fr:
            ref = Image.open(fr); ref.thumbnail((TILE_W // 3, 210), Image.Resampling.LANCZOS)
        loaded.append((item, im, ref))
        cell_h = max(cell_h, im.height + (ref.height if ref else 0) + 46)

    sheet = Image.new("RGB", (cols * TILE_W, rows * cell_h), (12, 12, 12))
    dr = ImageDraw.Draw(sheet)
    for i, (item, im, ref) in enumerate(loaded):
        x, y = (i % cols) * TILE_W, (i // cols) * cell_h
        sheet.paste(im, (x, y))
        yy = y + im.height + 4
        if ref:
            sheet.paste(ref, (x, yy))
            dr.text((x + ref.width + 8, yy + 4), "<- slide 1 of this night,", fill=(150, 150, 150))
            dr.text((x + ref.width + 8, yy + 18), "   for comparison", fill=(150, 150, 150))
            yy += ref.height + 4
        dr.text((x + 4, yy), f"{i+1}. {item['asset']['targetAssetId'][-30:]}", fill=(210, 210, 210))
    sheet.save(a.out)

    print(f"{len(pending)} ambiguous asset(s) pending, {len(loaded)} on this sheet -> {a.out}")
    for i, (item, _, _) in enumerate(loaded):
        e = item["event"]
        print(f"  {i+1}. {e['date']} {e['venue']['name'][:24]:<24} {item['asset']['targetAssetId'][-28:]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
