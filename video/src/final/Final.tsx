import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { FOOTAGE_FRAMES } from "./cut";
import { Stage } from "./Stage";
import { stepsShots } from "./steps";

/* The finished video: the footage, with every clip laid over it where the script says it. */

export const FINAL_FRAMES = FOOTAGE_FRAMES;

const SHOTS = [...stepsShots(FINAL_FRAMES + 60)];

export const Final: React.FC = () => (
  <AbsoluteFill>
    <Stage framing={[[0, 1]]} />
    {SHOTS.map((shot) => (
      <Sequence key={shot.id} name={shot.id} from={shot.from} durationInFrames={shot.total}>
        {shot.node}
      </Sequence>
    ))}
  </AbsoluteFill>
);
