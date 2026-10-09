#!/usr/bin/env python3
"""Generate responsive derivatives and ThumbHash strings from harvested originals.

For every file in assets/posters/originals/, emit into assets/posters/derived/:
  <assetId>-<width>.avif
  <assetId>-<width>.webp
  <assetId>-<width>.jpg
at widths [400, 800, 1200, 1600, 2000], plus a ThumbHash string per asset into
assets/posters/derivatives.json.

Design notes worth knowing before changing this:

  * Prunes as well as generates. A derivative whose original is gone is deleted,
    and its manifest entry with it, so derived/ always describes originals/ exactly.
  * Idempotent by design. A derivative is skipped when it already exists and is
    newer than its original. That is what makes the "swap in a print original
    later" seam cheap: drop a new file at the same assetId and rerun, and only
    that asset regenerates.
  * Never upscales. An original narrower than a target width is skipped for that
    width rather than blown up, and the emitted JSON records only the widths that
    actually exist, so <picture> never advertises a resolution that is not there.
  * 2000px is kept deliberately. Instagram serves this account at roughly 2005px,
    so the top rung is real detail rather than an upscale.
  * AVIF and WebP come from Pillow 12's native encoders. Verified on this machine
    with PIL.features.check('avif'), so no pillow-avif-plugin dependency.

Usage:
  python3 scripts/build_derivatives.py              # generate what is missing
  python3 scripts/build_derivatives.py --force      # regenerate everything
  python3 scripts/build_derivatives.py --validate   # check outputs, write nothing
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, features

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
POSTERS_DIR = PROJECT_DIR / "assets" / "posters"
ORIGINALS = POSTERS_DIR / "originals"
DERIVED = POSTERS_DIR / "derived"
# Lives INSIDE derived/ rather than beside it, deliberately: the web app serves
# derived/ as a static directory, and a symlink to a file that does not exist yet
# fails the Vite build outright. A directory that is merely empty does not.
OUT_JSON = DERIVED / "derivatives.json"

WIDTHS = [400, 800, 1200, 1600, 2000]
THUMBHASH_MAX = 100  # ThumbHash's documented input ceiling
ENCODER = SCRIPT_DIR / "thumbhash_encode.mjs"

FORMATS = [
    ("avif", {"quality": 55}),
    ("webp", {"quality": 78, "method": 5}),
    ("jpeg", {"quality": 82, "optimize": True, "progressive": True}),
]
EXT = {"avif": "avif", "webp": "webp", "jpeg": "jpg"}


def source_images() -> list[Path]:
    if not ORIGINALS.exists():
        return []
    return sorted(
        p for p in ORIGINALS.iterdir()
        if p.is_file() and not p.name.startswith(".") and p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}
    )


def thumbhash_for(img: Image.Image) -> str | None:
    """Downscale to ThumbHash's ceiling and hand the raw RGBA to the JS encoder."""
    small = img.convert("RGBA").copy()
    small.thumbnail((THUMBHASH_MAX, THUMBHASH_MAX), Image.Resampling.LANCZOS)
    with tempfile.NamedTemporaryFile(suffix=".rgba", delete=True) as tmp:
        tmp.write(small.tobytes())
        tmp.flush()
        try:
            result = subprocess.run(
                ["node", str(ENCODER), tmp.name, str(small.width), str(small.height)],
                capture_output=True, text=True, timeout=30,
            )
        except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
            print(f"    ! thumbhash skipped ({exc.__class__.__name__}). Blur-up degrades to a flat placeholder.")
            return None
    if result.returncode != 0:
        print(f"    ! thumbhash failed: {result.stderr.strip()}")
        return None
    return result.stdout.strip()


def prune(known: set[str], manifest: dict, dry_run: bool) -> tuple[int, int]:
    """Remove derived files and manifest entries whose original no longer exists.

    derived/ is 100% regenerable from originals/, so a derivative with no source
    is pure garbage: it inflates the deploy, and a stale manifest entry makes the
    app advertise an image it cannot serve. Without this, removing an original
    leaves both behind forever, because the generation pass only ever adds.

    Learned the hard way: four placeholder posters used for a preview deploy left
    45 orphaned files and 4 phantom manifest entries after their originals were
    moved out.
    """
    stale_files = [
        f for f in DERIVED.iterdir()
        if f.is_file() and f.name not in {".gitkeep", "derivatives.json"}
        and f.stem.rsplit("-", 1)[0] not in known
    ]
    stale_entries = [k for k in manifest if k not in known]

    if stale_files or stale_entries:
        verb = "would remove" if dry_run else "removed"
        print(f"  prune: {verb} {len(stale_files)} orphaned file(s) and {len(stale_entries)} stale manifest entry(ies)")
        for k in sorted(stale_entries):
            print(f"    stale entry: {k}")
        if not dry_run:
            for f in stale_files:
                f.unlink()
            for k in stale_entries:
                del manifest[k]
    return len(stale_files), len(stale_entries)


def build(force: bool, validate_only: bool) -> int:
    if not features.check("avif"):
        print("x Pillow has no AVIF support in this environment. Install a Pillow build with AVIF, or drop AVIF from FORMATS.")
        return 1

    originals = source_images()
    if not originals:
        print(f"No originals found in {ORIGINALS.relative_to(PROJECT_DIR)}.")
        print("The harvest (Checkpoint A) has not run. See HARVEST-COWORK-PROMPT.md.")
        return 0 if validate_only else 1

    DERIVED.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, dict] = {}
    if OUT_JSON.exists():
        try:
            manifest = json.loads(OUT_JSON.read_text())
        except json.JSONDecodeError:
            manifest = {}

    known = {src.stem for src in originals}
    prune(known, manifest, dry_run=validate_only)

    made = skipped = missing = 0

    for src in originals:
        asset_id = src.stem
        with Image.open(src) as im:
            im = im.convert("RGB")
            ow, oh = im.size
            print(f"  {asset_id}  {ow}x{oh}")

            emitted: dict[str, list[int]] = {fmt: [] for fmt, _ in FORMATS}
            for width in WIDTHS:
                if width > ow:
                    continue  # never upscale
                height = round(oh * width / ow)
                resized = None
                for fmt, opts in FORMATS:
                    out = DERIVED / f"{asset_id}-{width}.{EXT[fmt]}"
                    emitted[fmt].append(width)
                    fresh = out.exists() and out.stat().st_mtime >= src.stat().st_mtime
                    if validate_only:
                        if not fresh:
                            missing += 1
                            print(f"    missing or stale: {out.name}")
                        continue
                    if fresh and not force:
                        skipped += 1
                        continue
                    if resized is None:
                        resized = im.resize((width, height), Image.Resampling.LANCZOS)
                    resized.save(out, format=fmt.upper(), **opts)
                    made += 1

            if not validate_only:
                entry = manifest.get(asset_id, {})
                entry.update({
                    "assetId": asset_id,
                    "width": ow,
                    "height": oh,
                    "aspectRatio": round(ow / oh, 6),
                    "widths": sorted({w for ws in emitted.values() for w in ws}),
                    "formats": [EXT[f] for f, _ in FORMATS],
                })
                if force or not entry.get("thumbHash"):
                    th = thumbhash_for(im)
                    if th:
                        entry["thumbHash"] = th
                manifest[asset_id] = entry

    if validate_only:
        if missing:
            print(f"\nFAILED: {missing} derivative(s) missing or stale. Run without --validate.")
            return 1
        print(f"\nVALIDATION PASSED: derivatives present for {len(originals)} asset(s).")
        return 0

    OUT_JSON.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    hashed = sum(1 for v in manifest.values() if v.get("thumbHash"))
    print(f"\nWrote {made} derivative(s), skipped {skipped} already current.")
    print(f"ThumbHash on {hashed}/{len(manifest)} asset(s).")
    print(f"Manifest: {OUT_JSON.relative_to(PROJECT_DIR)}")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--force", action="store_true", help="regenerate even when current")
    ap.add_argument("--validate", action="store_true", help="check outputs without writing")
    a = ap.parse_args()
    sys.exit(build(a.force, a.validate))
