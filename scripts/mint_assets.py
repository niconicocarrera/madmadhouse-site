#!/usr/bin/env python3
"""Rename temporary shortcode-keyed assets to their real mmh- ids.

PLAN.md: images are addressed by assetId only, and the file on disk is
`<assetId>.<ext>`. The harvest could not know the date or venue, so it wrote
`tmp-<shortcode>-a<N>`. Once extraction resolves date and venue, this mints the
documented `mmh-YYYY-MM-DD--venue-slug--NN--aN` form.

Renames, never re-encodes. The derivative ladders are already correct pixels, so
this is pure file renaming plus a key rewrite in derivatives.json. That is why
minting was deliberately deferred until venues were resolved: doing it earlier
would have meant renaming twice.

Idempotent: a file already at its target name is left alone.

  python3 scripts/mint_assets.py --dry-run
  python3 scripts/mint_assets.py
"""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
POSTERS = PROJECT / "assets" / "posters"
ORIGINALS, DERIVED = POSTERS / "originals", POSTERS / "derived"
DERIV_JSON = DERIVED / "derivatives.json"
DRAFTS = PROJECT / "events.draft.json"
MANIFEST = POSTERS / "manifest.json"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    drafts = json.loads(DRAFTS.read_text())
    # One temp asset can back two events when a single flyer advertises two
    # nights. The first claim wins; the second event references the same file.
    mapping: dict[str, str] = {}
    for d in drafts:
        for a in d["assets"]:
            mapping.setdefault(a["tempAssetId"], a["targetAssetId"])

    deriv = json.loads(DERIV_JSON.read_text()) if DERIV_JSON.exists() else {}
    # Where each asset currently LIVES, which is not always its temp name: a
    # previous mint may have named it after an event id that has since changed
    # (a corrected date changes the event id, and with it the asset id). The
    # manifest records the last minted name, so re-minting can find the file.
    man = json.loads(MANIFEST.read_text())
    current = {img["tempAssetId"]: img.get("mintedAs")
               for post in man["posts"] for img in post["images"]}
    renamed = files = skipped = 0

    # TWO PHASE, and this is not optional. Renaming in place can rename a file
    # ONTO a name another file still holds: if X--a1 must become X--a2 while a
    # different file must become X--a1, a single pass destroys one of them. That
    # happened once here and cost an image permanently. Phase 1 parks everything
    # under a unique temporary name, phase 2 puts it at its target, so no rename
    # ever lands on an occupied name.
    plan = []
    for tmp, target in sorted(mapping.items()):
        live = current.get(tmp)
        src = ORIGINALS / f"{tmp}.jpg"
        if not src.exists() and live:
            src = ORIGINALS / f"{live}.jpg"
        if src.exists() and src.stem != target and not args.dry_run:
            park = ORIGINALS / f"__minting__{src.stem}.jpg"
            src.rename(park)
            for f in sorted(DERIVED.glob(f"{src.stem}-*")):
                f.rename(DERIVED / f"__minting__{f.name}")
            plan.append((src.stem, park, target))
    for stem, park, target in plan:
        park.rename(ORIGINALS / f"{target}.jpg")
        for f in sorted(DERIVED.glob(f"__minting__{stem}-*")):
            f.rename(DERIVED / f.name.replace(f"__minting__{stem}", target, 1))

    # derivatives.json is rekeyed the same way, and for the same reason: moving
    # a1's entry onto a2 in place overwrites a2 before a2 has moved. Read every
    # entry by its OLD key first, then write them all under their new keys.
    old_key = {tmp: (current.get(tmp) if current.get(tmp) in deriv else tmp) for tmp in mapping}
    moved = {k for k in old_key.values() if k in deriv}
    rekeyed = {k: v for k, v in deriv.items() if k not in moved}
    for tmp, target in sorted(mapping.items()):
        entry = deriv.get(old_key[tmp])
        if entry is None:
            print(f"  ! no derivatives entry for {tmp}")
            continue
        rekeyed[target] = {**entry, "assetId": target}
        if old_key[tmp] != target:
            renamed += 1
        else:
            skipped += 1
        missing = not (ORIGINALS / f"{target}.jpg").exists() and not args.dry_run
        if missing:
            print(f"  ! {target} did not materialize")
        files += len(list(DERIVED.glob(f"{target}-*")))
    deriv = rekeyed

    if not args.dry_run:
        DERIV_JSON.write_text(json.dumps(deriv, indent=2, sort_keys=True) + "\n")
        # Record the minted id IN the manifest rather than rewriting its paths.
        # The manifest is the harvest's record of what Instagram served and should
        # stay true to that; `mintedAs` says where the file lives now, so
        # validate_manifest.py can still find it.
        man = json.loads(MANIFEST.read_text())
        for post in man["posts"]:
            for img in post["images"]:
                if img["tempAssetId"] in mapping:
                    img["mintedAs"] = mapping[img["tempAssetId"]]
        MANIFEST.write_text(json.dumps(man, indent=2) + "\n")

    verb = "would rekey" if args.dry_run else "rekeyed"
    print(f"  {verb} {renamed} asset(s); {skipped} already at their target; {files} derivative file(s) on disk")
    print(f"  derivatives.json now keyed by {len(deriv)} asset id(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
