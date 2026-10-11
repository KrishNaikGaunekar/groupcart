import React from "react";
import { AbsoluteFill, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { FPS, H, IN_OUT, W, lerp } from "../theme";
import { SEGS, STARTS, Seg, frames } from "./cut";

/* The footage, and where the speaker sits in the frame.

   The overlays own the right-hand side: a phone with the minion beside it reaches in to
   x = 986, a panel to 1186. So while one is up, the picture is slid left until the speaker's
   shoulders end short of that (each recording says where its face goes, in cut.ts). Sliding
   uncovers the right edge of the recording. A mirrored copy of the picture continues it there,
   so shelves carry on as shelves, and the picture goes softly out of focus over its last
   FEATHER pixels and stays soft across the copy, so nothing in it reads as a reflection.
   Nearly all of that strip is behind the overlay anyway. */

const FEATHER = 220;
const SOFT = 16;

const Picture: React.FC<{ seg: Seg; side: number }> = ({ seg, side }) => {
  const scale = seg.scale;
  const x = lerp(seg.alone[0], seg.aside[0], side) - seg.face[0] * scale;
  const y = lerp(seg.alone[1], seg.aside[1], side) - seg.face[1] * scale;
  const src = staticFile(seg.file);
  const trim = Math.round(seg.from * FPS);
  const length = frames(seg.id);
  const video: React.CSSProperties = { position: "absolute", top: 0, width: W, height: H };
  // a few frames of fade at each end of a stretch, so a cut never clicks
  const volume = (f: number) => interpolate(f, [0, 3, length - 3, length], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fade = `linear-gradient(to right, transparent, #000 ${FEATHER}px)`;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, transformOrigin: "0 0", translate: `${x}px ${y}px`, scale: String(scale) }}>
      <OffthreadVideo src={src} trimBefore={trim} volume={volume} style={{ ...video, left: 0 }} />
      {side > 0 ? (
        <>
          <OffthreadVideo src={src} trimBefore={trim} muted style={{ ...video, left: W - 1, scale: "-1 1" }} />
          <div style={{ position: "absolute", left: W - FEATHER, top: 0, width: W + FEATHER, height: H, backdropFilter: `blur(${SOFT}px)`, WebkitBackdropFilter: `blur(${SOFT}px)`, maskImage: fade, WebkitMaskImage: fade }} />
        </>
      ) : null}
    </div>
  );
};

/** `framing` is a list of [frame, side]: 0 is the recording as shot, 1 is the speaker moved aside. */
export const Stage: React.FC<{ framing: [number, number][] }> = ({ framing }) => {
  const frame = useCurrentFrame();
  const side = framing.length > 1 ? interpolate(frame, framing.map((k) => k[0]), framing.map((k) => k[1]), { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: IN_OUT }) : (framing[0]?.[1] ?? 0);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {SEGS.map((seg) => (
        <Sequence key={seg.id} from={STARTS[seg.id]} durationInFrames={frames(seg.id)}>
          <Picture seg={seg} side={side} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
