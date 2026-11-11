#!/usr/bin/env bash
# Makes every Singapore picture one at a time with codex-image-gen. Skips ones already made, so it can be re-run.
cd "$(dirname "$0")"; mkdir -p out
while IFS=$'\t' read -r name ref; do
  [ -s "out/$name.png" ] && continue
  args=(-o "out/$name.png"); [ -n "$ref" ] && args+=(-i "$ref")
  echo "== $name $(date +%H:%M:%S)"
  if ~/tools/gpt-image.sh "${args[@]}" "$(cat "$name.txt")" > "out/$name.log" 2>&1; then echo "ok $name"; else echo "FAILED $name"; tail -3 "out/$name.log"; fi
done < list3.txt
echo "ALL DONE $(date +%H:%M:%S)"
