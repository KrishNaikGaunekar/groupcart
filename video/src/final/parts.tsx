import React from "react";
import { AbsoluteFill, Freeze, Sequence, interpolate, useCurrentFrame } from "remotion";
import { Chat, ChatProps } from "../Chat";
import { PHONE } from "../clips/phones";
import { IdleClock, Minion } from "../Minion";
import { Overlay, Speech } from "../Site";

/* What the finished video is assembled from: the same phone, minion and panels as the clips in
   src/clips/, but placed by the speech instead of by a clip's own clock. */

/** Plays a clip on another clock. `keys` are [frame here, frame of the clip], joined by straight
 *  lines: a clip made to its own timing is slowed, held and hurried so that each thing in it
 *  happens on the word it belongs to. The minion keeps idling at normal speed throughout. */
export const Retime: React.FC<{ keys: [number, number][]; children: React.ReactNode }> = ({ keys, children }) => {
  const frame = useCurrentFrame();
  const clip = interpolate(frame, keys.map((k) => k[0]), keys.map((k) => k[1]), { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <IdleClock.Provider value={frame}>
      <Freeze frame={clip}>{children}</Freeze>
    </IdleClock.Provider>
  );
};

export type Say = { text: string; from: number; to?: number; jumps?: number[] };

/** A phone on the right, as in src/clips/phones.tsx, for `total` frames. The minion can come and
 *  go while the phone stays: each `say` is the frames it is there for and what its bubble says.
 *  A say's `jumps` are frames of the phone's clock, like everything else here. */
export const PhoneShot: React.FC<{ total: number; says?: Say[]; chat: Omit<ChatProps, "width" | "height"> }> = ({ total, says = [], chat }) => (
  <AbsoluteFill>
    {says.map((say) => {
      const length = (say.to ?? total) - say.from;
      return (
        <Sequence key={say.text} from={say.from} durationInFrames={length} layout="none">
          <Overlay total={length} delay={6} from="right" style={{ left: 986, top: 300, width: 330 }}>
            <Speech text={say.text} at={16} width={316} style={{ marginLeft: 14 }} />
            <Minion scale={1.75} wave={[[10, 64]]} talk={[[16, 16 + say.text.length * 0.75]]} jumps={(say.jumps ?? []).map((f) => f - say.from)} look={[3, -1]} style={{ marginTop: -6 }} />
          </Overlay>
        </Sequence>
      );
    })}
    <Overlay total={total} style={{ left: 1330, top: 45 }}>
      <Chat {...PHONE} {...chat} />
    </Overlay>
  </AbsoluteFill>
);
