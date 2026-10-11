#!/usr/bin/env bash
# Render every clip into out/, plus out/00-preview.mp4 with all of them back to back.
#
#   overlays -> out/<id>.mov   ProRes 4444 with transparency: put them on a track above the footage
#   pages    -> out/<id>.mp4   the two clips that fill the frame (intro and sign-off)
#
#   ./render.sh              # everything
#   ./render.sh 04-pipeline  # just these, and no preview
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p out
clips=$(sed -nE 's/.*id: "([0-9]{2}-[a-z0-9-]+)".*overlay: (true|false).*/\1:\2/p' src/Root.tsx)
for clip in $clips; do
    id=${clip%%:*}
    if [ $# -gt 0 ] && [[ " $* " != *" $id "* ]]; then continue; fi
    echo "rendering $id"
    if [ "${clip##*:}" = true ]; then
        npx remotion render src/index.ts "$id" "out/$id.mov" --codec=prores --prores-profile=4444 --pixel-format=yuva444p10le --image-format=png --log=error
    else
        npx remotion render src/index.ts "$id" "out/$id.mp4" --codec=h264 --crf=14 --log=error
    fi
done
if [ $# -eq 0 ]; then
    echo "rendering 00-preview"
    npx remotion render src/index.ts 00-preview out/00-preview.mp4 --codec=h264 --crf=16 --log=error
fi
