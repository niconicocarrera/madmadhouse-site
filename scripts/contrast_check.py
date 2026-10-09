#!/usr/bin/env python3
"""WCAG contrast audit for the site's colour tokens, both schemes.

Parses web/src/styles/tokens.css rather than taking hard-coded copies, so the
check cannot drift from the real palette. Every foreground/background pair the
site actually renders is listed here explicitly: an audit that only tests the
pairs you remembered is not an audit.

Thresholds (WCAG 2.2):
  4.5:1  normal text           AA
  3.0:1  large text (>=24px, or >=18.66px bold)  AA
  3.0:1  UI component boundaries and focus indicators  AA (1.4.11)

Usage:
  python3 scripts/contrast_check.py            # report
  python3 scripts/contrast_check.py --validate # exit 1 on any AA failure
"""
from __future__ import annotations
import argparse, re, sys
from pathlib import Path

TOKENS = Path(__file__).resolve().parent.parent / "web" / "src" / "styles" / "tokens.css"


def parse_blocks(css: str) -> dict[str, dict[str, str]]:
    """Return {scheme: {token: hex}} for the default block and any
    prefers-color-scheme override."""
    schemes: dict[str, dict[str, str]] = {"dark": {}, "light": {}}
    # default :root block
    root = re.search(r":root\s*\{(.*?)\n\}", css, re.S)
    base = dict(re.findall(r"(--[\w-]+):\s*(#[0-9a-fA-F]{3,8}|[0-9]*\.?[0-9]+)\s*;", root.group(1))) if root else {}
    schemes["dark"].update(base)
    schemes["light"].update(base)
    for m in re.finditer(r"@media\s*\(prefers-color-scheme:\s*(light|dark)\s*\)\s*\{(.*?)\n\}\s*\n", css, re.S):
        which, body = m.group(1), m.group(2)
        schemes[which].update(dict(re.findall(r"(--[\w-]+):\s*(#[0-9a-fA-F]{3,8}|[0-9]*\.?[0-9]+)\s*;", body)))
    return schemes


def srgb_to_lin(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luminance(hex_color: str) -> float:
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join(ch * 2 for ch in h)
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return 0.2126 * srgb_to_lin(r) + 0.7152 * srgb_to_lin(g) + 0.0722 * srgb_to_lin(b)


def ratio(fg: str, bg: str) -> float:
    a, b = luminance(fg), luminance(bg)
    hi, lo = max(a, b), min(a, b)
    return (hi + 0.05) / (lo + 0.05)


def blend(fg: str, bg: str, alpha: float) -> str:
    """Flatten a translucent foreground over a background, since that is what the
    eye actually receives. A token that passes at full opacity can fail at the
    opacity it is really drawn with."""
    fh, bh = fg.lstrip("#"), bg.lstrip("#")
    out = []
    for i in (0, 2, 4):
        f, b = int(fh[i:i + 2], 16), int(bh[i:i + 2], 16)
        out.append(round(f * alpha + b * (1 - alpha)))
    return "#%02x%02x%02x" % tuple(out)


# (label, fg token, bg token, min ratio, alpha applied to fg, required)
# alpha may be a token name, read from tokens.css like the colours are.
#
# `required=False` means WCAG does not mandate the ratio for this element and the
# number is reported for information only. Used for exactly one thing: the
# hairline rule. 1.4.11 covers visual information needed to identify components
# and their states; a divider that carries no state and bounds no control is
# decorative, and raising it to 3:1 would turn a hairline into a drawn line.
# Everything that carries content is required and has no exemption.
PAIRS = [
    ("body text",                      "--c-ink",       "--c-field",        4.5, 1.0,  True),
    ("dimmed text (address, info)",    "--c-ink-dim",   "--c-field",        4.5, 1.0,  True),
    ("faint text (grid captions)",     "--c-ink-faint", "--c-field",        4.5, 1.0,  True),
    ("body text on a raised surface",  "--c-ink",       "--c-field-raised", 4.5, 1.0,  True),
    ("nav, arrows, title at rest",     "#ffffff",       "--c-field",        4.5, "--chrome-rest", True, "difference"),
    ("event card label",               "--c-ink-dim",   "--c-field",        4.5, 1.0,  True),
    ("hairline rule (decorative)",     "--c-rule",      "--c-field",        3.0, 1.0,  False),
]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--validate", action="store_true")
    args = ap.parse_args()

    css = TOKENS.read_text()
    schemes = parse_blocks(css)
    failures = 0

    for scheme in ("dark", "light"):
        tokens = schemes[scheme]
        if not tokens:
            print(f"\n{scheme.upper()}: no tokens found")
            continue
        has_override = any(
            k in re.sub(r":root\s*\{.*?\n\}", "", css, flags=re.S)
            for k in ("prefers-color-scheme: " + scheme,)
        )
        note = "" if scheme == "dark" or has_override else "   (NO LIGHT OVERRIDE DEFINED, showing the dark values)"
        print(f"\n{scheme.upper()}{note}")
        print(f"  {'pair':34s} {'fg':>9s} {'on':>9s} {'ratio':>7s}  {'need':>5s}  result")
        for label, fg_t, bg_t, need, alpha, required, *mode in PAIRS:
            fg = fg_t if fg_t.startswith("#") else tokens.get(fg_t)
            bg = tokens.get(bg_t)
            if not fg or not bg:
                continue
            if isinstance(alpha, str):
                alpha = float(tokens.get(alpha) or schemes["dark"][alpha])
            if mode and mode[0] == "difference":
                # mix-blend-mode: difference, then opacity over the same backdrop:
                # what the nav really renders, not ink at reduced alpha.
                f = [int(fg[i:i + 2], 16) for i in (1, 3, 5)]
                b = [int(bg[i:i + 2], 16) for i in (1, 3, 5)]
                eff = "#" + "".join(f"{round(bc + alpha * (abs(fc - bc) - bc)):02x}" for fc, bc in zip(f, b))
            else:
                eff = blend(fg, bg, alpha) if alpha < 1 else fg
            r = ratio(eff, bg)
            ok = r >= need
            if not ok and required:
                failures += 1
            verdict = ("PASS" if ok else "FAIL") if required else ("pass" if ok else "info, not required")
            print(f"  {label:34s} {eff:>9s} {bg:>9s} {r:6.2f}:1  {need:5.1f}  {verdict}")

    print()
    if failures:
        print(f"{failures} pair(s) below WCAG AA.")
        return 1 if args.validate else 0
    print("All required pairs meet WCAG AA, in both schemes.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
