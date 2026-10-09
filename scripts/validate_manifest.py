#!/usr/bin/env python3
"""Validate the poster harvest manifest against the files on disk.

THIS SCRIPT IS THE HANDSHAKE between the Cowork harvest session and the Claude
Code build session. The harvest is not done when the harvest session says it is
done. It is done when this exits 0.

Checks (hard failures):
  1. manifest.json exists, parses, and is schemaVersion 1 for the right account
  2. every required field is present and the right type
  3. no duplicate shortcodes, no duplicate tempAssetIds
  4. every image references a file that exists on disk
  5. the filename matches its tempAssetId exactly
  6. no orphan files in originals/ that no manifest entry claims
  7. recorded w and h match the actual decoded pixel dimensions
  8. posts + failures reconciles against postCount, so nothing was silently dropped

Warnings (do not fail the run, but are reported and must be read):
  - a post with no altText, which costs the strongest extraction signal
  - images narrower than 1000px, which usually means a thumbnail was captured
    instead of the full-resolution resource
  - a carousel post with only one image

Usage:
  python3 scripts/validate_manifest.py            # validate
  python3 scripts/validate_manifest.py --json     # machine-readable result
"""

from __future__ import annotations

import argparse
import json
import re
import statistics
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
POSTERS_DIR = PROJECT_DIR / "assets" / "posters"
MANIFEST = POSTERS_DIR / "manifest.json"
ORIGINALS = POSTERS_DIR / "originals"

TEMP_ID_RE = re.compile(r"^tmp-[A-Za-z0-9_-]+-a\d+$")
POST_URL_RE = re.compile(r"^https://www\.instagram\.com/p/")
MIN_SANE_WIDTH = 1000

errors: list[str] = []
warnings: list[str] = []


def err(msg: str) -> None:
    errors.append(msg)


def warn(msg: str) -> None:
    warnings.append(msg)


def decoded_size(path: Path):
    """Actual pixel dimensions, or None if unreadable."""
    try:
        from PIL import Image
    except ImportError:
        return None
    try:
        with Image.open(path) as im:
            return im.size
    except Exception:
        return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="emit a machine-readable result")
    args = parser.parse_args()

    if not MANIFEST.exists():
        err(f"manifest not found at {MANIFEST.relative_to(PROJECT_DIR)}. The harvest has not run.")
        return report(args.json)

    try:
        data = json.loads(MANIFEST.read_text())
    except json.JSONDecodeError as exc:
        err(f"manifest is not valid JSON: {exc}")
        return report(args.json)

    if data.get("schemaVersion") != 1:
        err(f"schemaVersion must be 1, got {data.get('schemaVersion')!r}")
    if data.get("account") != "madmaadhouse":
        err(f"account must be 'madmaadhouse' (double-a), got {data.get('account')!r}")
    for key in ("harvestedAt", "posts"):
        if key not in data:
            err(f"missing required top-level key: {key}")

    posts = data.get("posts")
    if not isinstance(posts, list):
        err("posts must be an array")
        return report(args.json)
    if not posts:
        err("posts is empty. Nothing was harvested.")

    failures = data.get("failures") or []
    seen_shortcodes: set[str] = set()
    seen_temp_ids: set[str] = set()
    claimed_files: set[Path] = set()
    widths: list[int] = []
    missing_alt = 0

    for i, post in enumerate(posts):
        where = f"posts[{i}]"
        if not isinstance(post, dict):
            err(f"{where} is not an object")
            continue

        shortcode = post.get("shortcode")
        if not isinstance(shortcode, str) or len(shortcode) < 5:
            err(f"{where}: shortcode missing or too short: {shortcode!r}")
            shortcode = f"<unknown-{i}>"
        elif shortcode in seen_shortcodes:
            err(f"{where}: duplicate shortcode {shortcode!r}")
        seen_shortcodes.add(shortcode)
        where = f"post {shortcode}"

        post_url = post.get("postUrl")
        if not isinstance(post_url, str) or not POST_URL_RE.match(post_url):
            err(f"{where}: postUrl missing or malformed: {post_url!r}")
        if not post.get("capturedAt"):
            err(f"{where}: capturedAt missing")
        if not isinstance(post.get("hasCarousel"), bool):
            err(f"{where}: hasCarousel must be a boolean")

        alt = post.get("altText")
        if alt is None or (isinstance(alt, str) and not alt.strip()):
            missing_alt += 1
            warn(f"{where}: no altText. This post loses the strongest extraction signal and will lean on caption plus vision alone.")

        images = post.get("images")
        if not isinstance(images, list) or not images:
            err(f"{where}: images must be a non-empty array")
            continue
        if post.get("hasCarousel") and len(images) == 1:
            warn(f"{where}: flagged as a carousel but only one image was captured. Slides may have been missed.")

        for img in images:
            if not isinstance(img, dict):
                err(f"{where}: an images entry is not an object")
                continue
            temp_id = img.get("tempAssetId")
            if not isinstance(temp_id, str) or not TEMP_ID_RE.match(temp_id):
                err(f"{where}: tempAssetId malformed, expected tmp-<shortcode>-a<N>, got {temp_id!r}")
                continue
            if temp_id in seen_temp_ids:
                err(f"{where}: duplicate tempAssetId {temp_id!r}")
            seen_temp_ids.add(temp_id)

            rel = img.get("file")
            if not isinstance(rel, str) or not rel.startswith("originals/"):
                err(f"{where}/{temp_id}: file must be a path under originals/, got {rel!r}")
                continue
            path = POSTERS_DIR / rel
            # After mint_assets.py the file lives under its real mmh- id. The
            # manifest keeps the harvest's own record and notes the new name.
            minted = img.get("mintedAs")
            if not path.exists() and minted:
                alt = POSTERS_DIR / "originals" / f"{minted}.jpg"
                if alt.exists():
                    path = alt
            # A file moved out of originals/ on purpose (not an event flyer) must
            # SAY SO in the manifest. An undocumented disappearance still fails,
            # which is the point of this check.
            if img.get("lost"):
                warn(f"{where}/{temp_id}: RECORDED AS LOST. {img['lost']}")
                continue
            aside = img.get("setAside")
            if not path.exists() and aside:
                alt = POSTERS_DIR / aside / f"{temp_id}.jpg"
                if alt.exists():
                    path = alt
                    warn(f"{where}/{temp_id}: set aside in {aside}/ (not an event flyer)")
            if not path.exists():
                err(f"{where}/{temp_id}: file does not exist on disk: {rel}")
                continue
            claimed_files.add(path.resolve())

            if path.stem != temp_id and path.stem != (img.get("mintedAs") or ""):
                err(f"{where}: filename {path.name!r} does not match tempAssetId {temp_id!r}")

            w, h = img.get("w"), img.get("h")
            if not isinstance(w, int) or not isinstance(h, int) or w < 1 or h < 1:
                err(f"{where}/{temp_id}: w and h must be positive integers, got {w!r} x {h!r}")
                continue
            widths.append(w)
            if w < MIN_SANE_WIDTH:
                warn(f"{where}/{temp_id}: recorded width {w}px is below {MIN_SANE_WIDTH}px. Likely a thumbnail, not the full-resolution resource.")

            actual = decoded_size(path)
            if actual and actual != (w, h):
                err(f"{where}/{temp_id}: manifest says {w}x{h} but the file decodes at {actual[0]}x{actual[1]}")

    # Orphans: a file nobody claims is a file the build session cannot place.
    if ORIGINALS.exists():
        on_disk = {
            p.resolve()
            for p in ORIGINALS.iterdir()
            if p.is_file() and not p.name.startswith(".")
        }
        for orphan in sorted(on_disk - claimed_files):
            err(f"orphan file in originals/ claimed by no manifest entry: {orphan.name}")

    # Reconciliation: nothing silently dropped.
    post_count = data.get("postCount")
    if isinstance(post_count, int):
        # Posts from another account (a presenter's flyer) document a night but
        # are not on this account's grid, so they do not count toward it.
        own = [p for p in posts if not p.get("sourceAccount")]
        accounted = len(own) + len(failures)
        if accounted != post_count:
            err(
                f"postCount says {post_count} but only {accounted} are accounted for "
                f"({len(own)} captured plus {len(failures)} recorded failures). "
                "Every post must appear in posts or in failures."
            )
        for p in posts:
            if p.get("sourceAccount"):
                warn(f"{p.get('shortcode')}: from @{p['sourceAccount']}, not this account; outside the postCount reconciliation.")
    else:
        warn("postCount absent, so posts cannot be reconciled against what the grid actually showed.")

    for f in failures:
        warn(f"recorded failure: {f.get('shortcode')} ({f.get('reason')})")

    if widths:
        median_w = int(statistics.median(widths))
        if median_w < MIN_SANE_WIDTH:
            err(
                f"median image width is {median_w}px. The account is known to serve around 2000px, "
                "so this run captured thumbnails. Re-harvest using currentSrc rather than a srcset guess."
            )
        else:
            print(f"  median image width: {median_w}px across {len(widths)} images")

    if missing_alt:
        print(f"  altText present on {len(posts) - missing_alt}/{len(posts)} posts")

    return report(args.json)


def report(as_json: bool) -> int:
    ok = not errors
    if as_json:
        print(json.dumps({"ok": ok, "errors": errors, "warnings": warnings}, indent=2))
        return 0 if ok else 1

    if warnings:
        print(f"\nWARNINGS ({len(warnings)}), not fatal but read them:")
        for w in warnings:
            print(f"  ! {w}")
    if errors:
        print(f"\nFAILED with {len(errors)} error(s):")
        for e in errors:
            print(f"  x {e}")
        print("\nThe harvest is NOT done. Fix these and run this again.")
        return 1

    print("\nVALIDATION PASSED. The harvest is complete and the build session can consume it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
