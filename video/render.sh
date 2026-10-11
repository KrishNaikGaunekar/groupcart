#!/usr/bin/env bash
# Render every clip to out/<id>.mp4, then join them into out/00-reel.mp4.
#
#   ./render.sh              # all of them
#   ./render.sh 04-pipeline  # just these
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p out
all=$(grep -o 'id: "[0-9][0-9]-[a-z0-9-]*"' src/Root.tsx | cut -d'"' -f2)
for id in ${@:-$all}; do
    echo "rendering $id"
    npx remotion render src/index.ts "$id" "out/$id.mp4" --codec=h264 --crf=14 --log=error
done
: > out/reel.txt
for id in $all; do [ -f "out/$id.mp4" ] && echo "file '$id.mp4'" >> out/reel.txt; done
ffmpeg -y -loglevel error -f concat -safe 0 -i out/reel.txt -c copy out/00-reel.mp4
rm out/reel.txt
echo "joined $(grep -c . <<< "$all") clips into out/00-reel.mp4"
