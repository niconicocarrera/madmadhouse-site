#!/usr/bin/env python3
"""Cross-check the three places an asset can exist, and report the gaps.

The three places are:
  1. the data      web/src/data/events.ts        (every assets[].assetId)
  2. the originals assets/posters/originals/     (<assetId>.<ext>)
  3. the derived   assets/posters/derivatives.json + derived/

A healthy archive has exactly the same asset ids in all three. This reports each
direction of drift separately, because they mean different things:

  in data, not on disk      a broken image on the live site
  on disk, not in data      an orphan, harvested but never placed in an event
  on disk, not derived      build_derivatives.py has not run since the harvest
  aspectRatio disagrees     the data's ratio was hand-edited or the file changed,
                            which reintroduces layout shift on that tile

Seed placeholder ids (anything matching the placeholder pattern) are reported
separately and never counted as failures, so this stays usable before the
harvest has run.

Usage:
  python3 scripts/validate_assets.py
  python3 scripts/validate_assets.py --json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
POSTERS_DIR = PROJECT_DIR / "assets" / "posters"
ORIGINALS = POSTERS_DIR / "originals"
DERIVATIVES = POSTERS_DIR / "derived" / "derivatives.json"
EVENTS_TS = PROJECT_DIR / "web" / "src" / "data" / "events.ts"
KINDS = PROJECT_DIR / "asset-kinds.json"

ASSET_ID_RE = re.compile(r'assetId:\s*"([^"]+)"')
ASPECT_RE = re.compile(r'assetId:\s*"([^"]+)"[^}]*?aspectRatio:\s*([0-9.]+)', re.S)
PLACEHOLDER_RE = re.compile(r"placeholder|^tmp-", re.I)
ASPECT_TOLERANCE = 0.01


def data_assets() -> dict[str, float]:
    if not EVENTS_TS.exists():
        return {}
    text = EVENTS_TS.read_text()
    out = {aid: float(ar) for aid, ar in ASPECT_RE.findall(text)}
    for aid in ASSET_ID_RE.findall(text):
        out.setdefault(aid, float("nan"))
    return out


def disk_assets() -> dict[str, Path]:
    if not ORIGINALS.exists():
        return {}
    return {
        p.stem: p
        for p in sorted(ORIGINALS.iterdir())
        if p.is_file() and not p.name.startswith(".")
    }


def derived_assets() -> dict[str, dict]:
    if not DERIVATIVES.exists():
        return {}
    try:
        return json.loads(DERIVATIVES.read_text())
    except json.JSONDecodeError:
        return {}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    data, disk, derived = data_assets(), disk_assets(), derived_assets()
    errors: list[str] = []
    notes: list[str] = []

    real_data = {k: v for k, v in data.items() if not PLACEHOLDER_RE.search(k)}
    placeholders = sorted(set(data) - set(real_data))

    for aid in sorted(set(real_data) - set(disk)):
        errors.append(f"in data but no file on disk: {aid}  (renders as a broken image)")
    # An asset can be deliberately absent from every event: the static twin of an
    # animated flyer is the same artwork twice, so it stays on disk and in the
    # manifest but is not shown. That is a RECORDED exclusion, not an orphan. An
    # unrecorded disappearance still fails, which is the point (L023).
    suppressed = {}
    if KINDS.exists():
        suppressed = {k: (f"duplicate of {v['duplicateOf']}" if v.get("duplicateOf") else f"hidden: {v['hidden']}")
                      for k, v in json.loads(KINDS.read_text()).items()
                      if not k.startswith("_") and (v.get("duplicateOf") or v.get("hidden"))}
    for aid in sorted(set(disk) - set(data)):
        if aid in suppressed:
            notes.append(f"{aid} deliberately not shown: {suppressed[aid]}")
            continue
        errors.append(f"file on disk but in no event: {aid}  (orphan, harvested and never placed)")
    for aid in sorted(set(disk) - set(derived)):
        errors.append(f"original present but no derivatives: {aid}  (run build_derivatives.py)")

    for aid, entry in sorted(derived.items()):
        declared = data.get(aid)
        actual = entry.get("aspectRatio")
        if declared is None or actual is None or declared != declared:  # NaN check
            continue
        if abs(declared - actual) > ASPECT_TOLERANCE:
            errors.append(
                f"aspectRatio mismatch on {aid}: data says {declared:.4f}, "
                f"the file is {actual:.4f}. This tile will shift on load."
            )

    if placeholders:
        notes.append(f"{len(placeholders)} placeholder asset id(s) ignored: {', '.join(placeholders[:3])}{'...' if len(placeholders) > 3 else ''}")
    if not disk:
        notes.append("originals/ is empty. The harvest (Checkpoint A) has not run.")

    if derived:
        print(f"  {len(derived)} asset(s) with derivatives")
        for aid, e in sorted(derived.items()):
            print(f"    {aid}  {e.get('width')}x{e.get('height')}  ar {e.get('aspectRatio')}  widths {e.get('widths')}  thumbhash {'yes' if e.get('thumbHash') else 'NO'}")

    if args.json:
        print(json.dumps({"ok": not errors, "errors": errors, "notes": notes}, indent=2))
        return 0 if errors == [] else 1

    for n in notes:
        print(f"  . {n}")
    if errors:
        print(f"\nFAILED with {len(errors)} problem(s):")
        for e in errors:
            print(f"  x {e}")
        return 1
    print("\nVALIDATION PASSED: data, originals, and derivatives agree.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
