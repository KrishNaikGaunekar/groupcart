#!/usr/bin/env bash
# Make the finished video, out/groupcart-demo.mp4, from the three recordings in footage/.
#
#   ./final.sh           # prepare the footage if it is not prepared yet, then render
#   ./final.sh --prep    # prepare the footage again first (after changing a recording)
set -euo pipefail
cd "$(dirname "$0")"
need=0
for name in IMG_5812 IMG_5813 IMG_5814; do
    [ -f "public/footage/$name.mp4" ] || need=1
done
if [ "$need" = 1 ] || [ "${1:-}" = "--prep" ]; then tools/prep-footage.sh IMG_5812 IMG_5813 IMG_5814; fi
mkdir -p out
npx remotion render src/index.ts final out/groupcart-demo.mp4 --codec=h264 --crf=16 --color-space=bt709 --audio-bitrate=320k --log=error
ffprobe -v error -show_entries format=duration -of csv=p=0 out/groupcart-demo.mp4 | awk '{printf "out/groupcart-demo.mp4: %.1f seconds\n", $1}'
