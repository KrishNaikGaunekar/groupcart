import React from "react";
import { Composition, Series } from "remotion";
import "./fonts";
import { Outro, OUTRO, TITLE, TitleCard } from "./clips/pages";
import { ANDROID, AndroidToo, GROUPS, GroupsRelay, MONEY, MoneyFlow, PIPELINE, Pipeline, SPLIT, SplitCard } from "./clips/panels";
import { HOOK, Hook, STEP_ONE, STEP_THREE, STEP_TWO, StepOne, StepThree, StepTwo } from "./clips/phones";
import { Footage } from "./Site";
import { FPS, H, W } from "./theme";

/** Every clip, in the order the script uses them. The ids are also the file names of the renders.
 *  Overlays have no background and are rendered with transparency; the other two fill the frame. */
export const CLIPS: { id: string; component: React.FC; frames: number; overlay: boolean }[] = [
  { id: "01-hook", component: Hook, frames: HOOK, overlay: true },
  { id: "02-title", component: TitleCard, frames: TITLE, overlay: false },
  { id: "03-step1-text", component: StepOne, frames: STEP_ONE, overlay: true },
  { id: "04-pipeline", component: Pipeline, frames: PIPELINE, overlay: true },
  { id: "05-step2-thumbs-up", component: StepTwo, frames: STEP_TWO, overlay: true },
  { id: "06-split", component: SplitCard, frames: SPLIT, overlay: true },
  { id: "07-step3-pay", component: StepThree, frames: STEP_THREE, overlay: true },
  { id: "08-money-flow", component: MoneyFlow, frames: MONEY, overlay: true },
  { id: "09-groups-relay", component: GroupsRelay, frames: GROUPS, overlay: true },
  { id: "10-android", component: AndroidToo, frames: ANDROID, overlay: true },
  { id: "11-outro", component: Outro, frames: OUTRO, overlay: false },
];

/** All of them back to back, with the overlays over a stand-in for the footage. For looking, not for editing. */
const Preview: React.FC = () => (
  <Series>
    {CLIPS.map((clip) => (
      <Series.Sequence key={clip.id} durationInFrames={clip.frames}>
        {clip.overlay ? (
          <Footage>
            <clip.component />
          </Footage>
        ) : (
          <clip.component />
        )}
      </Series.Sequence>
    ))}
  </Series>
);

export const RemotionRoot: React.FC = () => (
  <>
    {CLIPS.map((clip) => (
      <Composition key={clip.id} id={clip.id} component={clip.component} durationInFrames={clip.frames} fps={FPS} width={W} height={H} />
    ))}
    <Composition id="00-preview" component={Preview} durationInFrames={CLIPS.reduce((sum, clip) => sum + clip.frames, 0)} fps={FPS} width={W} height={H} />
  </>
);
