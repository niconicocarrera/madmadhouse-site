#!/usr/bin/env python3
"""Turn the harvested manifest into draft events, with per-field confidence.

WHAT CHANGED FROM THE PLAN, and why this script is shaped the way it is:

PLAN.md specified three extraction signals: altText, caption, and vision. The
harvest returned altText NULL on all 53 posts (Instagram only exposes
accessibility_caption on the profile-grid GraphQL, which was rate limited). So
the strongest signal is simply gone.

Two things replace it:

  1. A signal the plan never anticipated: the POST DATE, recovered from the
     shortcode itself (see ig_time.py). This is deterministic, needs no API, and
     covers 100% of posts. It matters more than it sounds, because captions are
     written for people who already know the year: they say "SATURDAY SEPT 19",
     never 2026. The post date resolves the year, and it is the fallback date for
     the 25 of 53 captions with no parseable date at all.

  2. Vision, run IN SESSION rather than through an API. This follows lesson L009:
     reasoning that needs a model happens in the Claude session, deterministic
     assembly happens in Python. So this script does not call Gemini. It does
     everything decidable from text, then emits vision-worksheet.md naming
     exactly which fields on which posts still need eyes on the flyer.

Outputs:
  events.draft.json        machine-readable draft, per-field confidence
  vision-worksheet.md      what still needs a human or a vision pass, ranked
  extraction-review.html   Checkpoint B review surface, color coded

Nothing here writes events.ts. That is a separate deliberate step after review.

Usage:
  python3 scripts/extract_flyers.py
  python3 scripts/extract_flyers.py --validate
"""

from __future__ import annotations

import argparse
import datetime
import html
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ig_time import posted_at, resolve_year  # noqa: E402

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
POSTERS = PROJECT_DIR / "assets" / "posters"
MANIFEST = POSTERS / "manifest.json"
DERIVATIVES = POSTERS / "derived" / "derivatives.json"
OUT_JSON = PROJECT_DIR / "events.draft.json"
OUT_WORKSHEET = PROJECT_DIR / "vision-worksheet.md"
OUT_REVIEW = PROJECT_DIR / "extraction-review.html"
FINDINGS = PROJECT_DIR / "vision-findings.json"
ALIASES = PROJECT_DIR / "venue-aliases.json"
COORDS = PROJECT_DIR / "venue-coords.json"
PEOPLE = PROJECT_DIR / "people.private.json"
KINDS = PROJECT_DIR / "asset-kinds.json"

MONTHS = {m: i + 1 for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}
WEEKDAYS = {"monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
            "friday": 4, "saturday": 5, "sunday": 6}

# The account's own handle is never a DJ credit or a venue.
SELF = {"madmaadhouse", "madmadhouse"}

# Tokens that mark a handle as a place rather than a person. Built by reading the
# actual handle list, not guessed: eastwind.club, holaamor.naperville,
# aidansrags, market96 and so on.
VENUE_TOKENS = ("club", "bar", "lounge", "market", "gallery", "cafe", "coffee",
                "shop", "store", "rags", "vintage", "studio", "hall", "room",
                "house.", "venue", "naperville", "aurora", "chicago", ".il")
VENUE_CONTEXT = re.compile(
    r"(?:\bat\b|\@\s|takin[g]?\s+over|taking\s+over|hosted\s+by|back\s+at|live\s+at|inside)\s+@?([A-Za-z0-9._]+)",
    re.I)
DJ_CONTEXT = re.compile(
    r"@([A-Za-z0-9._]+)(?=[^@]{0,40}?\b(?:spinning|performing|playing|b2b|set|sounds|dj)\b)", re.I)

TIME_RE = re.compile(
    r"\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:-|to|until|till|–|—)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)|"
    r"\d{1,2}(?::\d{2})?\s*(?:am|pm)\s*(?:-|to|until|till)\s*(?:late|close)|"
    r"\d{1,2}\s*(?:am|pm)\s*(?:-|–)\s*(?:LATE|late))\b", re.I)

EMOJI = re.compile("[\U0001F000-\U0001FAFF☀-➿️←-⇿⬀-⯿]")


def sanitize(text: str) -> str:
    """L006: an em dash must not reach a generated artifact, even copied verbatim."""
    return re.sub(r"\s*—\s*", ", ", text)


def slugify(s: str) -> str:
    s = EMOJI.sub("", s)
    # An apostrophe joins its word: Carmine's is carmines, not carmine-s.
    s = re.sub(r"['\u2019]", "", s)
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s or "unknown"


def parse_date(caption: str, posted: datetime.datetime):
    """Return (datetime, confidence, why). Falls back to the post date."""
    stated_wd = None
    wm = re.findall(r"\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b", caption, re.I)

    m = re.search(r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b",
                  caption, re.I)
    if m:
        month, day = MONTHS[m.group(1).lower()[:3]], int(m.group(2))
    else:
        m2 = re.search(r"\b(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\b", caption)
        if not m2:
            return posted, "low", "no date in caption; using the post date as a stand-in"
        month, day = int(m2.group(1)), int(m2.group(2))

    resolved = resolve_year(month, day, posted)
    if resolved is None:
        return posted, "low", f"caption says {month}/{day} but no year puts it near the post"

    # A stated weekday that agrees is the single strongest confirmation available.
    if wm:
        for w in wm:
            if resolved.weekday() == WEEKDAYS[w.lower()]:
                stated_wd = w
                break
        if stated_wd:
            return resolved, "high", f"caption date plus weekday '{stated_wd}' agree with the resolved year"
        return resolved, "medium", f"caption names {wm[0]} but the resolved date is a {resolved:%A}; caption may name another day"
    return resolved, "medium", "caption date, year resolved from the post date, no weekday to confirm"


def link(name: str, handles: dict[str, str], mentioned: set[str]) -> str | None:
    """A verified handle for a credited name, or None. Confirmed mappings first,
    then the name itself when the collective @mentioned exactly it in the caption."""
    key = name.lower().lstrip("@")
    return handles.get(key) or (key if key in mentioned else None)


def classify_handles(caption: str):
    """Split @handles into venue candidates and DJ candidates."""
    all_handles = [h.lower().rstrip(".") for h in re.findall(r"@([A-Za-z0-9._]+)", caption)]
    venues = {h.lower().rstrip(".") for h in VENUE_CONTEXT.findall(caption) if h}
    djs_ctx = {h.lower().rstrip(".") for h in DJ_CONTEXT.findall(caption)}
    venue_set, dj_set = [], []
    for h in dict.fromkeys(all_handles):
        if h in SELF:
            continue
        # PRECEDENCE MATTERS. An explicit "at @x" / "takin over @x" is a direct
        # statement of place and must beat the DJ heuristic, which is only
        # proximity to words like "set" or "dj". Found the hard way: the caption
        # "AT @aidansrags MEDIA MARKET 12PM-6PM | LIVE DJ SET" put "DJ SET"
        # within the proximity window and turned a venue into a performer.
        if h in venues:
            venue_set.append(h)
        elif h in djs_ctx:
            dj_set.append(h)
        elif any(t in h for t in VENUE_TOKENS):
            venue_set.append(h)
        else:
            dj_set.append(h)
    return venue_set, dj_set


def build():
    manifest = json.loads(MANIFEST.read_text())
    derivatives = json.loads(DERIVATIVES.read_text()) if DERIVATIVES.exists() else {}
    # Vision findings are read directly off the flyer and OUTRANK anything derived
    # from caption text, because the flyer is the primary artifact: it prints the
    # venue, the street address, the exact date, and the age limit that captions
    # routinely omit.
    # Billed alias -> verified handle. Only CONFIRMED people produce a link: an
    # unverified guess would point at a stranger's account, which is worse than
    # no link at all. Real names stay in the private file and never reach the
    # build.
    handles: dict[str, str] = {}
    groups: dict[str, list[str]] = {}
    if PEOPLE.exists():
        pdata = json.loads(PEOPLE.read_text())
        # A duo billed as one act is credited as its members.
        groups = {k.lower(): v["members"] for k, v in pdata.get("groups", {}).items()}
        for person in pdata.get("people", []):
            if not person.get("confirmed") or not person.get("instagram"):
                continue
            for a in person.get("aliases", []):
                handles[a["billed"].lower()] = person["instagram"]
        # Presenters follow the same rule as performers: linked only once
        # confirmed, and to the handle on record, which can differ from the
        # billed name (gardencollective is @gardencollective_).
        for p in pdata.get("presenters", []):
            if p.get("confirmed") and p.get("instagram"):
                handles[p["billed"].lower()] = p["instagram"]

    # What each asset IS, read off the image. Replaces the old index rule (slide
    # one is the poster, the rest are not), which was wrong in both directions:
    # a recap post's first slide is a photograph, and a flyer post's later slides
    # are often additional poster designs. Six assets were mislabelled that way.
    kinds = {}
    if KINDS.exists():
        kind_rows = {k: v for k, v in json.loads(KINDS.read_text()).items()
                     if not k.startswith("_")}
        kinds = {k: v["kind"] for k, v in kind_rows.items()}

    kind_rows = kind_rows if KINDS.exists() else {}

    coords = {}
    if COORDS.exists():
        coords = {k: v for k, v in json.loads(COORDS.read_text()).items() if not k.startswith("_")}
    aliases = {}
    if ALIASES.exists():
        aliases = {k: v for k, v in json.loads(ALIASES.read_text()).items() if not k.startswith("_")}
    findings = {}
    if FINDINGS.exists():
        findings = {k: v for k, v in json.loads(FINDINGS.read_text()).items() if not k.startswith("_")}
    drafts = []

    for post in manifest["posts"]:
        sc = post["shortcode"]
        caption = sanitize((post.get("captionText") or "").replace("\n", " ").strip())
        posted = posted_at(sc) or datetime.datetime(1970, 1, 1)

        date, date_conf, date_why = parse_date(caption, posted)
        venues, djs = classify_handles(caption)
        # Every @handle the collective itself wrote in this caption. Rule 8: a
        # caption @mention is ground truth for a handle, so a credited name that
        # appears here links to itself without needing people.private.json.
        mentioned = {h.lower().rstrip(".") for h in re.findall(r"@([A-Za-z0-9._]+)", caption)} - set(SELF)
        tm = TIME_RE.search(caption)

        venue_name = venues[0] if venues else None
        venue_conf = "medium" if venues else "low"

        fields = {
            "date": date_conf,
            "venue.name": venue_conf,
            "timeText": "medium" if tm else "low",
            "djs": "medium" if djs else "low",
        }
        # ---- merge the vision finding, if one exists ----
        vf = findings.get(sc, {})
        if vf.get("notAFlyer"):
            continue  # a promo or mood post, not an event. Deliberately dropped.
        if vf.get("date"):
            date = datetime.datetime.strptime(vf["date"], "%Y-%m-%d")
            fields["date"] = "high"
            date_why = "read off the flyer" + (f": {vf['note']}" if vf.get("note") else "")
        if vf.get("venue"):
            venue_name = vf["venue"].get("name") or venue_name
            fields["venue.name"] = "high"
        if vf.get("timeText"):
            tm_text = vf["timeText"]
            fields["timeText"] = "high"
        else:
            tm_text = tm.group(0).strip() if tm else ""
        if vf.get("djs"):
            djs = vf["djs"]
            fields["djs"] = "high"
        # A presenter or promoter is credited as presenting, never also as a DJ,
        # whichever source the name came from (a caption @mention or the flyer).
        # Exception, named explicitly: a promoter that also played its own night
        # (Le Bump at its 2 Year Party, on RA's lineup) stays in the lineup.
        performs = {p.lower().lstrip("@") for p in vf.get("alsoPerforms", [])}
        presenters = {p.lower().lstrip("@") for p in vf.get("presentedBy", [])} - performs
        # Match by account as well as by name: @vadozevents in a caption is the
        # presenter "vadoz" (both resolve to @vadozclub), not a DJ.
        presenter_accounts = {handles[p] for p in presenters if p in handles}
        djs = [d for d in djs
               if d.lower().lstrip("@") not in presenters
               and handles.get(d.lower().lstrip("@")) not in presenter_accounts]
        # The collective is never credited as a DJ: a flyer billing "MADMADHOUSE"
        # means whichever members played, and the crew rotates (Luis, 2026-09-30).
        # `crew` in vision-findings.json names those members, by billed alias.
        djs = [d for d in djs if d.lower().lstrip("@") not in SELF]
        for member in vf.get("crew", []):
            if member.lower() not in {d.lower() for d in djs}:
                djs.append(member)
        if vf.get("crew"):
            fields["djs"] = "high"
        djs = [m for d in djs for m in groups.get(d.lower(), [d])]
        needs_review = any(c == "low" for c in fields.values()) or (
            len(post["images"]) > 1 and not vf)

        # Canonicalize: a caption yields the handle (eastwind.club), a flyer yields
        # the printed name (East Wind Social Club). Same place, and without this the
        # archive lists it as several venues.
        raw_venue = (vf.get("venue") or {}).get("name") or venue_name or ""
        canon = aliases.get(raw_venue.lower().strip())
        if canon:
            venue_name = canon["name"]
            venue_city = canon.get("city", "")
            venue_addr = canon.get("address", "")
        else:
            venue_name = raw_venue
            venue_city = (vf.get("venue") or {}).get("city", "")
            venue_addr = (vf.get("venue") or {}).get("address", "")
        # An alias may normalize the NAME only (East Wind has occupied several
        # addresses), so fall back to whatever this event's own flyer printed.
        if not venue_addr:
            venue_addr = (vf.get("venue") or {}).get("address", "")
        if not venue_city:
            venue_city = (vf.get("venue") or {}).get("city", "")

        # A withheld location is shown as just "Undisclosed". The flyer's "DM for
        # address" is an instruction for that night, not information for an archive.
        if re.match(r"\s*(undisclosed|tba|tbd|dm\b|location\s*(tba|tbd))", venue_name or "", re.I):
            venue_name, venue_city, venue_addr = "Undisclosed", "", ""
        slug = slugify(venue_name or "unknown-venue")
        event_id = f"mmh-{date:%Y-%m-%d}--{slug}--01"

        drafts.append({
            "eventId": event_id,
            "title": vf.get("title", ""),
            "shortcode": sc,
            "postedAt": posted.isoformat(timespec="seconds"),
            "date": date.strftime("%Y-%m-%d"),
            "dateWhy": date_why,
            "venue": {"name": venue_name, "city": venue_city, "address": venue_addr,
                      "coords": coords.get(venue_addr) if venue_addr else None},
            "timeText": tm_text,
            "djs": [{"name": h, "instagram": link(h, handles, mentioned), "confidence": "medium"} for h in djs],
            "_mentioned": sorted(mentioned),
            "specialGuests": [{"name": g, "instagram": link(g, handles, mentioned)}
                              for g in vf.get("specialGuests", [])],
            "presentedBy": [{"name": p, "instagram": link(p, handles, mentioned),
                             **({"alsoPerforms": True} if p.lower().lstrip("@") in performs else {})}
                            for p in vf.get("presentedBy", [])],
            "info": caption[:300],
            "assets": [
                # A 'lost' image is skipped: the event keeps its remaining assets
                # rather than referencing a file that no longer exists.
                {
                    "tempAssetId": img["tempAssetId"],
                    "targetAssetId": f"{event_id}--a{img['index']}",
                    "aspectRatio": round(
                        derivatives.get(img["tempAssetId"], {}).get("aspectRatio", img["w"] / img["h"]), 6),
                    # Default only: an unclassified slide one is assumed to be the
                    # poster. asset-kinds.json overrides this wherever it has an
                    # opinion, and the merge below applies it.
                    "role": "flyer" if img["index"] == 1 else "extra",
                    "thumbHash": derivatives.get(img["tempAssetId"], {}).get("thumbHash"),
                    # The photographer, from the post's own credit line. Carried
                    # with the asset through a merge, shown small on the night.
                    **({"credit": vf["photoCredit"]} if vf.get("photoCredit") else {}),
                }
                for img in post["images"] if not img.get("lost")
            ],
            "slideCount": len(post["images"]),
            "source": {"igShortcode": sc, "caption": caption, "altText": None},
            "review": {"fields": fields, "needsHumanReview": needs_review},
        })

    # ---- MERGE PASS ----------------------------------------------------------
    # Posts are not events. A flyer posted beforehand and a photo recap posted
    # afterwards document the SAME night, so counting one event per post inflates
    # the archive. `mergeWith` in vision-findings.json names the partner post;
    # its assets are absorbed and its own draft dropped.
    by_sc = {d["shortcode"]: d for d in drafts}
    absorbed = set()
    for d in drafts:
        for partner_sc in (findings.get(d["shortcode"], {}).get("mergeWith") or []):
            partner = by_sc.get(partner_sc)
            if not partner or partner_sc in absorbed:
                continue
            for a in partner["assets"]:
                # Absorbed from a recap post, so photographs unless classified.
                a = dict(a, role="extra", kind=a.get("kind", "image"))
                a["targetAssetId"] = f"{d['eventId']}--a{len(d['assets']) + 1}"
                d["assets"].append(a)
            d["mergedFrom"] = d.get("mergedFrom", []) + [partner_sc]
            absorbed.add(partner_sc)
    drafts = [d for d in drafts if d["shortcode"] not in absorbed]

    # ---- MOVE PASS -----------------------------------------------------------
    # A post can carry slides from a different night: Market96's carousel holds
    # two polaroids shot at the Aidansrags market two weeks earlier. `moveSlides`
    # in vision-findings.json moves named slides to the night they document.
    # Moved slides are appended to the end of the target, so nothing already on
    # that night is renumbered and only the moved files are reminted.
    by_sc = {d["shortcode"]: d for d in drafts}
    for d in drafts:
        for mv in findings.get(d["shortcode"], {}).get("moveSlides") or []:
            tmp = f"tmp-{d['shortcode']}-a{mv['index']}"
            target = by_sc.get(mv["to"])
            asset = next((a for a in d["assets"] if a["tempAssetId"] == tmp), None)
            if not target or not asset:
                print(f"  ! moveSlides: cannot move {tmp} to {mv['to']}")
                continue
            d["assets"].remove(asset)
            asset = dict(asset, role="extra", movedFrom=d["shortcode"])
            asset["targetAssetId"] = f"{target['eventId']}--a{len(target['assets']) + 1}"
            target["assets"].append(asset)

    # ---- MULTI-NIGHT PASS ----------------------------------------------------
    # One flyer can advertise a run of nights (C0m-6VGukVo prints Friday 12.8.23
    # and Saturday 12.9.23). That is ONE event spanning the run: `date` is the
    # first night, `endDate` the last, and the lineup is every DJ from every
    # night, in billing order, each once. Decided by Nico 2026-09-30, replacing
    # the earlier split into two events that shared one poster. `multiEvent` in
    # vision-findings.json lists the nights and their DJs.
    for d in drafts:
        nights = findings.get(d["shortcode"], {}).get("multiEvent")
        if not nights:
            continue
        nights = sorted(nights, key=lambda n: n["date"])
        d["date"], d["endDate"] = nights[0]["date"], nights[-1]["date"]
        seen, lineup = set(), []
        for n in nights:
            for h in n.get("djs", []):
                if h.lower() not in seen:
                    seen.add(h.lower())
                    lineup.append(h)
        d["djs"] = [{"name": h, "instagram": link(h, handles, set(d.get("_mentioned", []))), "confidence": "high"} for h in lineup]
        slug = d["eventId"].split("--")[1]
        d["eventId"] = f"mmh-{d['date']}--{slug}--01"
        d["info"] = (" / ".join(n.get("note", "") for n in nights) + " " + d["info"]).strip()

    # ---- KIND PASS ----------------------------------------------------------
    # `kind` is what the asset IS (poster / image / video); `role` is derived
    # from it as the app-facing "is this the night's flyer" flag.
    #
    # RUNS LAST, AFTER MERGE AND SPLIT, and that ordering is load bearing. A
    # flyer post and its recap resolve to the same night, so before merging they
    # are two drafts sharing one eventId, which means their targetAssetIds
    # COLLIDE: both have an --a1. Classifying at that point let the recap's first
    # photograph inherit the flyer's classification, and the merge then re-keyed
    # it to --a4 carrying the wrong kind with it. Same shape as the minting
    # collision in L023: an id namespace that is only unique once every pass that
    # rewrites ids has finished.
    for d in drafts:
        for a in d["assets"]:
            k = kinds.get(a["targetAssetId"])
            if k is None:
                k = "poster" if a["role"] == "flyer" else "image"
            a["kind"] = k
            # A video IS the flyer when it is the animated version of one.
            a["role"] = "flyer" if k in ("poster", "video") else "extra"
            row = kind_rows.get(a["targetAssetId"], {})
            # An animated artifact whose motion file exists plays; one that is
            # still pending renders as its still and nothing breaks.
            mot = row.get("motion")
            if mot:
                a["motion"] = mot
            if row.get("duplicateOf"):
                a["duplicateOf"] = row["duplicateOf"]
            if row.get("hidden"):
                a["hidden"] = row["hidden"]


    # A static twin of an animated flyer is the same artwork twice, and a
    # `hidden` asset is one Nico chose not to show. Both stay on disk and in the
    # manifest; they are only dropped from the event.
    for d in drafts:
        d["assets"] = [a for a in d["assets"] if not a.get("duplicateOf") and not a.get("hidden")]

    drafts.sort(key=lambda d: d["date"], reverse=True)
    return drafts


def write_outputs(drafts):
    dj_names = {}
    if PEOPLE.exists():
        dj_names = {p["instagram"]: p["djName"] for p in json.loads(PEOPLE.read_text()).get("people", [])
                    if p.get("djName") and p.get("instagram") and p.get("confirmed")}
    # A handle the collective @mentioned in ANY caption is verified everywhere it
    # is credited, including nights whose own caption did not mention it.
    everywhere = set().union(*(set(d.get("_mentioned", [])) for d in drafts)) if drafts else set()
    for d in drafts:
        d.pop("_mentioned", None)  # working data for linking, not part of the record
        for dj in d["djs"]:
            if not dj.get("instagram"):
                dj["instagram"] = link(dj["name"], {}, everywhere)
        # A person with a `djName` is always credited by it in a lineup, whatever
        # a caption or flyer called them (thy_niconico and nico nico are blinco).
        # Then drop anyone listed twice on one night.
        seen = set()
        lineup = []
        for dj in d["djs"]:
            name = dj_names.get(dj.get("instagram") or "", dj["name"])
            if (dj.get("instagram") or name.lower()) in seen:
                continue
            seen.add(dj.get("instagram") or name.lower())
            lineup.append(dict(dj, name=name))
        d["djs"] = lineup
    OUT_JSON.write_text(json.dumps(drafts, indent=2) + "\n")

    # ---- worksheet: only what actually needs eyes, ranked by what is missing ----
    no_venue = [d for d in drafts if not d["venue"]["name"]]
    low_date = [d for d in drafts if d["review"]["fields"]["date"] == "low"]
    carousels = [d for d in drafts if d["slideCount"] > 1]
    lines = [
        "# Vision worksheet",
        "",
        "_Generated by `scripts/extract_flyers.py`. These are the gaps text alone cannot close._",
        "_`altText` came back null on every post, so the flyer image itself is the only remaining_",
        "_source for anything the caption does not state._",
        "",
        f"- **{len(no_venue)}** of {len(drafts)} posts have no venue from the caption. The flyer almost always prints it.",
        f"- **{len(low_date)}** have no caption date, so they are currently standing on the post date.",
        f"- **{len(carousels)}** are carousels. Some are recap or multi flyer sets where slides are DIFFERENT events, so these cannot be assumed to be one event each.",
        "",
        "## Posts with no venue",
        "",
    ]
    for d in no_venue:
        lines.append(f"- `{d['shortcode']}` ({d['date']}, {d['slideCount']} slide(s)) first asset `{d['assets'][0]['tempAssetId']}`")
        lines.append(f"  - caption: {d['info'][:130] or '(none)'}")
    lines += ["", "## Posts standing on the post date only", ""]
    for d in low_date:
        lines.append(f"- `{d['shortcode']}` assumed {d['date']} ({d['dateWhy']}), asset `{d['assets'][0]['tempAssetId']}`")
    # Addresses the site cannot show. The card omits the line entirely rather than
    # printing N/A, so without this list the gap would be invisible to everyone,
    # including us.
    no_addr = [d for d in drafts if not d["venue"].get("address")]
    lines += ["", "## Events with no street address", "",
              "_The card omits the address line entirely for these rather than printing N/A._",
              "_All of them still carry a venue name, a date and a lineup, so the entry reads fine._",
              "_Listed here so the gap stays tracked. A flyer that never printed a street is not a bug._",
              ""]
    for d in no_addr:
        lines.append(f"- `{d['shortcode']}` {d['date']} {d['venue']['name']}")
    lines += ["", "## Carousels to split or confirm", ""]
    for d in carousels:
        lines.append(f"- `{d['shortcode']}` {d['slideCount']} slides, {d['date']}")
    OUT_WORKSHEET.write_text(sanitize("\n".join(lines)) + "\n")

    # ---- review surface ----
    def chip(c):
        return f'<span class="c c-{c}">{c}</span>'
    rows = []
    for d in drafts:
        a = d["assets"][0]
        img = f'/posters/{a["tempAssetId"]}-400.jpg'
        rows.append(f"""
      <tr class="{'flag' if d['review']['needsHumanReview'] else ''}">
        <td><img src="{img}" loading="lazy" alt=""></td>
        <td><code>{html.escape(d['shortcode'])}</code><br><small>{d['slideCount']} slide(s)</small></td>
        <td>{d['date']} {chip(d['review']['fields']['date'])}<br><small>{html.escape(d['dateWhy'])}</small></td>
        <td>{html.escape(d['venue']['name'] or '(none)')} {chip(d['review']['fields']['venue.name'])}</td>
        <td>{html.escape(d['timeText'] or '(none)')} {chip(d['review']['fields']['timeText'])}</td>
        <td>{html.escape(', '.join(x['name'] for x in d['djs']) or '(none)')} {chip(d['review']['fields']['djs'])}</td>
        <td><small>{html.escape(d['info'][:150])}</small></td>
      </tr>""")
    OUT_REVIEW.write_text(f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>MMH extraction review</title>
<style>
 body{{background:#0b0b0c;color:#f2f0ec;font:14px/1.45 -apple-system,system-ui,sans-serif;margin:0;padding:24px}}
 h1{{font-size:22px;letter-spacing:-.02em}} p{{color:#8a8a8f;max-width:70ch}}
 table{{border-collapse:collapse;width:100%;margin-top:20px}}
 th,td{{border-bottom:1px solid #232327;padding:8px;vertical-align:top;text-align:left}}
 th{{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#8a8a8f}}
 img{{width:96px;height:auto;display:block;background:#141416}}
 tr.flag{{background:#17110f}}
 code{{font:12px ui-monospace,Menlo,monospace;color:#8a8a8f}}
 .c{{font-size:10px;padding:1px 6px;border-radius:2px;text-transform:uppercase;letter-spacing:.08em}}
 .c-high{{background:#12331d;color:#7fdca0}} .c-medium{{background:#33290f;color:#e3c369}} .c-low{{background:#3a1414;color:#f08b8b}}
</style></head><body>
<h1>MADMADHOUSE extraction review</h1>
<p>Checkpoint B. {len(drafts)} posts. Highlighted rows need a human. Note that
<code>altText</code> was null on every post, so dates without a caption date are
standing on the post's own timestamp and venues are frequently missing: the flyer
image itself is the remaining source. Confidence is per field.</p>
<table><thead><tr><th>Flyer</th><th>Post</th><th>Date</th><th>Venue</th><th>Time</th><th>DJs</th><th>Caption</th></tr></thead>
<tbody>{''.join(rows)}</tbody></table></body></html>
""")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--validate", action="store_true")
    args = ap.parse_args()

    if not MANIFEST.exists():
        print("No manifest. The harvest has not run.")
        return 1
    drafts = build()

    conf = {"high": 0, "medium": 0, "low": 0}
    for d in drafts:
        for c in d["review"]["fields"].values():
            conf[c] += 1
    flagged = sum(1 for d in drafts if d["review"]["needsHumanReview"])
    print(f"  {len(drafts)} posts -> drafts")
    print(f"  field confidence: high={conf['high']} medium={conf['medium']} low={conf['low']}")
    print(f"  need human review: {flagged}/{len(drafts)}")
    print(f"  with a venue: {sum(1 for d in drafts if d['venue']['name'])}/{len(drafts)}")
    print(f"  date from caption: {sum(1 for d in drafts if d['review']['fields']['date'] != 'low')}/{len(drafts)}")

    if args.validate:
        bad = [d for d in drafts if not d["eventId"] or not d["assets"]]
        if bad:
            print(f"FAILED: {len(bad)} draft(s) missing an id or assets")
            return 1
        for d in drafts:
            for a in d["assets"]:
                tmp_f = POSTERS / "originals" / f"{a['tempAssetId']}.jpg"
                minted_f = POSTERS / "originals" / f"{a['targetAssetId']}.jpg"
                if not tmp_f.exists() and not minted_f.exists():
                    print(f"FAILED: {a['tempAssetId']} has no original on disk (nor minted as {a['targetAssetId']})")
                    return 1
        print("\nVALIDATION PASSED: every draft has an id, assets, and files on disk.")
        return 0

    write_outputs(drafts)
    for p in (OUT_JSON, OUT_WORKSHEET, OUT_REVIEW):
        print(f"  wrote {p.relative_to(PROJECT_DIR)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
