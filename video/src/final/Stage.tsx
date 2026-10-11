import React from "react";
import { AbsoluteFill, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { FPS, H, IN_OUT, W, lerp } from "../theme";
import { SEGS, STARTS, Seg, frames } from "./cut";

/* The footage, and where the speaker sits in the frame.

   The overlays own the right-hand side: a phone clip reaches in to x = 986, a panel to 1186.
   So while one is up, the picture is pushed in a little and slid left until the speaker's face
   is at SIDE_X and their shoulders end short of 986. Sliding uncovers the right edge of the
   recording; a mirrored copy of the picture continues it there (shelves carry on as shelves),
   and nearly all of that strip is behind the overlay anyway. */

const SIDE_X = 472; // where the face goes while an overlay is up
const SIDE_SCALE = 1.08;

const Picture: React.FC<{ seg: Seg; side: number }> = ({ seg, side }) => {
  const scale = lerp(1, SIDE_SCALE, side);
  const x = lerp(seg.face[0], SIDE_X, side) - seg.face[0] * scale;
  const y = seg.face[1] - seg.face[1] * scale; // the face keeps its height
  const src = staticFile(seg.file);
  const trim = Math.round(seg.from * FPS);
  const video: React.CSSProperties = { position: "absolute", top: 0, width: W, height: H };
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, transformOrigin: "0 0", translate: `${x}px ${y}px`, scale: String(scale) }}>
      {side > 0 ? <OffthreadVideo src={src} trimBefore={trim} muted style={{ ...video, left: W - 1, scale: "-1 1" }} /> : null}
      <OffthreadVideo src={src} trimBefore={trim} style={{ ...video, left: 0 }} />
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
