#!/usr/bin/env bash
# Downloads every catalogue image into src/assets/img so the mock is
# self-contained and keeps working if the source store goes away.
#
#   ./scripts/fetch-images.sh
#
# Reads raw/image-manifest.txt, written by scripts/build-catalog.mjs.
set -euo pipefail
cd "$(dirname "$0")/.."

manifest="raw/image-manifest.txt"
[ -f "$manifest" ] || { echo "missing $manifest — run scripts/build-catalog.mjs first" >&2; exit 1; }

count=0
skipped=0
while IFS=$'\t' read -r url path; do
  [ -z "${url:-}" ] && continue
  dest="src/$path"
  mkdir -p "$(dirname "$dest")"
  if [ -s "$dest" ]; then
    skipped=$((skipped + 1))
    continue
  fi
  if curl -sfL -H "Accept: image/webp,image/*" --max-time 60 "$url" -o "$dest"; then
    count=$((count + 1))
    printf '.'
  else
    echo >&2
    echo "FAILED $url" >&2
    rm -f "$dest"
  fi
done < "$manifest"

echo
echo "downloaded $count, already present $skipped"
du -sh src/assets/img
