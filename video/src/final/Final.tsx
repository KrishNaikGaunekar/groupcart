import React from "react";
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from "remotion";
import { STARTS } from "./cut";
import { MONEY_OUT, OUTRO_OUT, SPLIT_OUT, endingShots } from "./ending";
import { HOOK_IN, introShots } from "./intro";
import { Stage } from "./Stage";
import { stepsShots } from "./steps";

/* The finished video: the three recordings end to end, with every clip laid over them where the
   script says it. The speaker is in the middle of the frame while they are alone in it, and is
   moved aside from the first overlay until the last one has gone. */

export const FINAL_FRAMES = OUTRO_OUT;

const SHOTS = [...introShots(STARTS.steps), ...stepsShots(SPLIT_OUT), ...endingShots()];

const FRAMING: [number, number][] = [
  [0, 0],
  [HOOK_IN - 14, 0],
  [HOOK_IN + 8, 1],
  [MONEY_OUT - 14, 1],
  [MONEY_OUT + 10, 0],
];

/** Up from black at the start, down to black at the end. */
const Fades: React.FC = () => {
  const frame = useCurrentFrame();
  const black = interpolate(frame, [0, 6, FINAL_FRAMES - 14, FINAL_FRAMES - 1], [1, 0, 0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ background: "#000", opacity: black }} />;
};

export const Final: React.FC = () => (
  <AbsoluteFill style={{ background: "#000" }}>
    <Stage framing={FRAMING} />
    {SHOTS.map((shot) => (
      <Sequence key={shot.id} name={shot.id} from={shot.from} durationInFrames={shot.total}>
        {shot.node}
      </Sequence>
    ))}
    <Fades />
  </AbsoluteFill>
);
