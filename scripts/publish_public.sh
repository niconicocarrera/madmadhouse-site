#!/usr/bin/env bash
# Mirror the publishable part of this project to the public repo (madmadhouse-site).
#
# ALLOWLIST, not denylist: only the paths below are ever copied, so a new private file
# (call notes, logs, raw extraction data) stays private by default. A leak gate scans the
# staged tree and aborts the push on a secret pattern, a phone number, a personal email,
# or a forbidden file name. Runs on every `npm run deploy` (web/package.json), so the
# public repo has no upkeep. Public history is one commit per sync, never the private one.
#
#   scripts/publish_public.sh            sync and push
#   DRY_RUN=1 scripts/publish_public.sh  stage, gate, and show the diff; push nothing
set -euo pipefail

REPO="niconicocarrera/madmadhouse-site"
SRC="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

ALLOW=(
  README.md PLAN.md OVERVIEW.md DESIGN-DECISIONS.md MOTION-INVENTORY.md
  archive.config.json asset-kinds.json venue-aliases.json venue-coords.json
  assets/brand assets/posters/manifest.json assets/posters/derived/derivatives.json
  scripts web
)
FORBIDDEN='(^|/)(LOG|CONTENT|CALL-SHEET|IG-HANDLE-AUDIT|REVIEW|HANDOFF-PROMPT|HARVEST-COWORK-PROMPT|HARVEST-HANDBACK|MOTION-AND-VERIFY-HANDOFF)\.md$|(^|/)(events\.draft|vision-findings|people\.private)\.json$|vision-worksheet\.md$|extraction-review\.html$|(^|/)calls/|\.env$'

gh repo clone "$REPO" "$TMP/pub" -- --quiet
find "$TMP/pub" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +

for p in "${ALLOW[@]}"; do
  [ -e "$SRC/$p" ] || continue
  mkdir -p "$TMP/pub/$(dirname "$p")"
  rsync -a --exclude node_modules --exclude dist --exclude .DS_Store --exclude __pycache__ \
        --exclude '*.pyc' --exclude '.env*' "$SRC/$p" "$TMP/pub/$(dirname "$p")/"
done
printf '.DS_Store\nnode_modules\ndist\n.env*\n' > "$TMP/pub/.gitignore"

cd "$TMP/pub"
bad=0
if find . -path ./.git -prune -o -type f -print | sed 's|^\./||' | grep -E "$FORBIDDEN"; then
  echo "GATE: forbidden file staged" >&2; bad=1; fi
if grep -rInE 'sk-ant|sk-[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20}|BEGIN (RSA|OPENSSH|PRIVATE)|service_role|[0-9]{3}-[0-9]{3}-[0-9]{4}|\([0-9]{3}\) [0-9]{3}-[0-9]{4}|@gmail\.com' \
     --exclude-dir=.git --exclude='*.svg' --exclude=package-lock.json --exclude=publish_public.sh .; then
  echo "GATE: secret, phone, or personal email in staged tree" >&2; bad=1; fi
[ "$bad" = 0 ] || { echo "Aborted: nothing pushed." >&2; exit 1; }

git add -A
if git diff --cached --quiet; then echo "Public repo already up to date."; exit 0; fi
git diff --cached --stat | tail -5
[ -z "${DRY_RUN:-}" ] || { echo "DRY_RUN: not pushing."; exit 0; }
git commit -q -m "Sync from workshop $(date +%Y-%m-%d)"
git push -q origin HEAD:main
echo "Published to https://github.com/$REPO"
