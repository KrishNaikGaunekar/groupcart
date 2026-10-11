import React from "react";
import { Composition, Series } from "remotion";
import { Outro, MoneyFlow, Pipeline, SplitCard, TitleCard } from "./clips/diagrams";
import { AndroidToo, GroupsRelay } from "./clips/multi";
import { Hook, StepOne, StepThree, StepTwo } from "./clips/phones";
import { FPS, H, W } from "./theme";

/** Every clip, in the order the script uses them. The ids are also the file names of the renders. */
export const CLIPS: { id: string; component: React.FC; frames: number }[] = [
  { id: "01-hook", component: Hook, frames: 300 },
  { id: "02-title", component: TitleCard, frames: 165 },
  { id: "03-step1-text", component: StepOne, frames: 270 },
  { id: "04-pipeline", component: Pipeline, frames: 345 },
  { id: "05-step2-thumbs-up", component: StepTwo, frames: 240 },
  { id: "06-split", component: SplitCard, frames: 240 },
  { id: "07-step3-pay", component: StepThree, frames: 285 },
  { id: "08-money-flow", component: MoneyFlow, frames: 330 },
  { id: "09-groups-relay", component: GroupsRelay, frames: 345 },
  { id: "10-android", component: AndroidToo, frames: 315 },
  { id: "11-outro", component: Outro, frames: 150 },
];

/** All of them back to back, for a quick look at the whole set. */
const Reel: React.FC = () => (
  <Series>
    {CLIPS.map((clip) => (
      <Series.Sequence key={clip.id} durationInFrames={clip.frames}>
        <clip.component />
      </Series.Sequence>
    ))}
  </Series>
);

export const RemotionRoot: React.FC = () => (
  <>
    {CLIPS.map((clip) => (
      <Composition key={clip.id} id={clip.id} component={clip.component} durationInFrames={clip.frames} fps={FPS} width={W} height={H} />
    ))}
    <Composition id="00-reel" component={Reel} durationInFrames={CLIPS.reduce((sum, clip) => sum + clip.frames, 0)} fps={FPS} width={W} height={H} />
  </>
);
