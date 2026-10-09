#!/usr/bin/env python3
"""Geocode venue street addresses to coordinates via OpenStreetMap Nominatim.

Nico wants to see locations rendered as coordinates as well as street addresses,
so both are kept and either can be displayed. Nothing is ever invented: an
address that does not resolve is recorded as null and the UI shows N/A rather
than a plausible-looking wrong point.

Nominatim's usage policy: identify yourself, at most 1 request per second, cache
results. This caches to venue-coords.json and only queries addresses it has not
already resolved, so a rerun costs nothing.

  python3 scripts/geocode_venues.py
  python3 scripts/geocode_venues.py --show
"""
from __future__ import annotations
import argparse, json, sys, time, urllib.parse, urllib.request
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
DRAFTS = PROJECT / "events.draft.json"
CACHE = PROJECT / "venue-coords.json"
UA = "madmadhouse-archive/1.0 (https://github.com/niconicocarrera/madmadhouse)"


def query(addr: str):
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {"q": addr, "format": "json", "limit": 1})
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.loads(r.read())
    except Exception as exc:
        print(f"    ! {addr}: {exc}")
        return None
    if not data:
        return None
    return {"lat": round(float(data[0]["lat"]), 6),
            "lon": round(float(data[0]["lon"]), 6),
            "matched": data[0].get("display_name", "")}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--show", action="store_true", help="print the cache and exit")
    args = ap.parse_args()

    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    if args.show:
        for k, v in sorted(cache.items()):
            if k.startswith("_"): continue
            print(f"  {k:<46} {v['lat'] if v else 'N/A':>10} {v['lon'] if v else '':>11}")
        return 0

    drafts = json.loads(DRAFTS.read_text())
    # Key on the fullest address string available for each venue.
    targets: dict[str, str] = {}
    for d in drafts:
        v = d["venue"]
        if not v.get("address"):
            continue
        city = v.get("city") or ""
        # Strip a parenthetical like "(backdoor under bridge)" from the STREET
        # before appending the city. Doing it afterwards deletes the city too,
        # which is how "65 S LaSalle, Aurora, IL" once resolved to Lasalle, France.
        street = v["address"].split("(")[0].strip().rstrip(",")
        targets[v["address"]] = f"{street}, {city}, IL" if city else street

    todo = [k for k in targets if k not in cache]
    print(f"  {len(targets)} distinct street address(es), {len(todo)} not yet cached")
    for i, key in enumerate(todo):
        q = targets[key]
        print(f"    [{i+1}/{len(todo)}] {q}")
        cache[key] = query(q)
        time.sleep(1.1)  # Nominatim: max 1 req/sec

    cache["_doc"] = ("Geocoded via OpenStreetMap Nominatim. Keyed by the street address exactly as it "
                     "appears in events. null means the address did not resolve; show N/A, never a guess. "
                     "Data (c) OpenStreetMap contributors, ODbL.")
    CACHE.write_text(json.dumps(cache, indent=2, sort_keys=True) + "\n")
    ok = sum(1 for k, v in cache.items() if not k.startswith("_") and v)
    print(f"  resolved {ok}/{len([k for k in cache if not k.startswith('_')])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
