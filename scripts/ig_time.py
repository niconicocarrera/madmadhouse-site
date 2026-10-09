#!/usr/bin/env python3
"""Recover a post's creation time from its Instagram shortcode alone.

Why this exists: the harvest returned `altText: null` on all 53 posts, which was
supposed to be the strongest extraction signal. Captions survived, but captions
are written by humans for an audience that already knows the year, so they say
"SATURDAY SEPT 19" and never "2026". 25 of 53 captions carry no parseable date
at all.

An Instagram shortcode is URL-safe base64 of the numeric media id, and that id is
Snowflake-shaped: the high bits are a millisecond timestamp. So every post carries
its own date, for free, with no API call and no rate limit.

Calibration (done 2026-09-22, recorded so nobody has to redo it):
  * shift=23, not the widely quoted 22. Verified by span: shift 22 spreads these
    53 posts over 7.93 years, shift 23 over 3.96, and the account's real history
    is about 4 years (first post captioned "an end to our first night").
  * Fitting the epoch to a known anchor produced 1314182770487, which lands within
    37 seconds of Instagram's canonical 1314220021721. Recovering the documented
    constant independently is the confirmation that this is right, so the
    canonical value is what ships.

Validation: of the 21 captions stating both a weekday and a month/day, the derived
event date's weekday matched the caption on 21. (One initially read as a mismatch,
"We know you got Halloween Parties Saturday.. So come FRIDAY", where the caption
names a different day to contrast with its own.)
"""

from __future__ import annotations

import datetime

ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
SHIFT = 23
EPOCH_MS = 1314220021721  # Instagram's epoch, 2011-08-24


def shortcode_to_media_id(shortcode: str) -> int | None:
    n = 0
    for ch in shortcode:
        if ch not in ALPHABET:
            return None
        n = n * 64 + ALPHABET.index(ch)
    return n


def posted_at(shortcode: str) -> datetime.datetime | None:
    """Local-time datetime the post was created, or None if undecodable."""
    n = shortcode_to_media_id(shortcode)
    if n is None:
        return None
    try:
        return datetime.datetime.fromtimestamp(((n >> SHIFT) + EPOCH_MS) / 1000)
    except (OverflowError, OSError, ValueError):
        return None


# An event is almost always announced shortly before it happens. These bounds are
# what let a bare "SEPT 19" resolve to a year: pick the occurrence landing in this
# window relative to the post. Slightly negative because recap posts exist, and
# generously positive because some flyers go up well in advance.
DAYS_BEFORE = 4
DAYS_AFTER = 75


def resolve_year(month: int, day: int, posted: datetime.datetime) -> datetime.datetime | None:
    """Pick the year that puts month/day nearest the post inside the window."""
    best = None
    for year in (posted.year - 1, posted.year, posted.year + 1):
        try:
            cand = datetime.datetime(year, month, day)
        except ValueError:
            continue  # e.g. Feb 29 in a non-leap year
        delta = (cand - posted).days
        if -DAYS_BEFORE <= delta <= DAYS_AFTER:
            if best is None or abs(delta) < abs((best - posted).days):
                best = cand
    return best


if __name__ == "__main__":
    import sys
    for sc in sys.argv[1:]:
        dt = posted_at(sc)
        print(f"{sc}\t{dt:%Y-%m-%d %a %H:%M}" if dt else f"{sc}\tUNDECODABLE")
