#!/usr/bin/env bash
# Turn the phone recordings in footage/ into what the edit reads from public/footage/.
#
#   tools/prep-footage.sh              every footage/*.mov
#   tools/prep-footage.sh IMG_5813     just that one
#
# iPhones record HDR (HLG, 10 bit) at a wavering 60 fps, very quietly. The edit wants plain
# Rec. 709 at a steady 30 fps and a voice at a normal level, so for each recording:
#   1. avconvert (ships with macOS) tone-maps HDR to SDR the way Photos does;
#   2. ffmpeg makes it constant 30 fps and cleans the voice: rumble and hiss off, levelled,
#      then gained to -16 LUFS under a limiter.
# Needs macOS and ffmpeg. Neither footage/ nor public/footage/ is in git.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p public/footage footage/.work

TARGET=-16
VOICE="highpass=f=90,afftdn=nr=16:nf=-48,acompressor=threshold=-30dB:ratio=3:attack=5:release=150"

names=("$@")
if [ ${#names[@]} -eq 0 ]; then
  for f in footage/*.mov; do names+=("$(basename "$f" .mov)"); done
fi

for name in "${names[@]}"; do
  src="footage/$name.mov"
  sdr="footage/.work/$name-sdr.mov"
  out="public/footage/$name.mp4"
  [ -f "$src" ] || { echo "missing $src" >&2; exit 1; }

  echo "== $name: HDR to SDR"
  avconvert --preset Preset1920x1080 --source "$src" --output "$sdr" --replace >/dev/null

  # how loud the cleaned voice is before any gain, to know how much to add
  loud=$(ffmpeg -hide_banner -nostats -i "$sdr" -vn -af "$VOICE,ebur128" -f null - 2>&1 | awk '/Integrated loudness:/ {found=1} found && /I:/ {print $2; exit}')
  gain=$(python3 -c "print(round($TARGET - ($loud), 2))")
  echo "== $name: voice is $loud LUFS, adding $gain dB"

  ffmpeg -hide_banner -loglevel error -y -i "$sdr" \
    -vf "fps=30,format=yuv420p" -c:v libx264 -preset medium -crf 14 -g 15 \
    -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
    -af "$VOICE,volume=${gain}dB,alimiter=limit=0.84:level=false" -c:a aac -b:a 256k -ar 48000 \
    -movflags +faststart "$out"

  ffmpeg -hide_banner -loglevel error -y -i "$out" -vn -ac 1 -ar 16000 -c:a pcm_s16le "footage/.work/$name.wav"
  after=$(ffmpeg -hide_banner -nostats -i "$out" -vn -af ebur128=peak=true -f null - 2>&1 | awk '/Integrated loudness:/ {found=1} found && /I:/ {i=$2} found && /Peak:/ {p=$2} END {print i " LUFS, peak " p " dBFS"}')
  echo "== $name: wrote $out ($(ffprobe -v error -show_entries format=duration -of csv=p=0 "$out") s, $after)"
done
