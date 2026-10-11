import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { TitleCard } from "../clips/pages";
import { at } from "./cut";
import { PhoneShot, Retime } from "./parts";
import { Placed, keys } from "./steps";

/* The first recording: the problem, then the title card.
   SAID is when each phrase starts, in seconds into it. */

export const SAID = {
  beenThere: 0.5, // "We've all been there:"
  payUpFront: 1.9, // "you pay up front for the group meal or shopping haul,"
  owesYou: 5.0, // "and now everyone owes you $7."
  problem: 7.5, // "The problem is not that they will forget to pay you back,"
  apps: 10.5, // "it's the trouble of opening apps,"
  figuring: 12.5, // "figuring out how much each person owes,"
  reminders: 15.0, // "and sending awkward reminder messages in the group chat"
  vibe: 18.0, // "that kill the vibe."
  enter: 20.0, // "Enter GroupCart,"
  chatbot: 21.2, // "a chat bot that makes it simple to search for items,"
  split: 24.5, // "split the bill accordingly, and collect everyone's share before checkout."
  steps: 28.5, // "And it only takes 3 steps:"
  end: 30.5, // the last word is out
};

const T = (seconds: number) => at("hook", seconds);

/** The frame the phone starts to come in on: the picture moves the speaker aside around it. */
export const HOOK_IN = T(SAID.payUpFront - 0.75);

/* The group chat nobody enjoys. The messages are the ones in 01-hook, in the order the script
   names the troubles: opening apps, working out who owes what, then the reminders. */
const hook = (): Placed => {
  const from = HOOK_IN;
  const total = T(SAID.enter - 0.1) - from;
  const f = (seconds: number) => T(seconds) - from;
  return {
    id: "hook",
    from,
    total,
    node: (
      <PhoneShot
        total={total}
        chat={{
          name: "movie night 🍿",
          group: true,
          rows: [
            { kind: "note", id: "n0", at: -100, text: "Today 9:12 PM" },
            { id: "a", from: "me", at: f(SAID.payUpFront + 0.9), text: "ok snacks are bought, it came to $28.11" },
            { id: "b", from: "me", at: f(SAID.owesYou + 0.5), text: "so everyone owes me about $7" },
            { id: "d", from: "them", sender: "Priya", tint: "#AF52DE", typing: 22, at: f(SAID.apps + 0.6), text: "can you send me a request? i'll do it later" },
            { id: "c", from: "them", sender: "Sam", tint: "#FF9F0A", typing: 22, at: f(SAID.figuring + 0.8), text: "wait, i only had the gummy worms" },
            { kind: "note", id: "n1", at: f(SAID.reminders + 0.2), text: "Thursday 4:02 PM" },
            { id: "e", from: "me", at: f(SAID.reminders + 0.8), text: "hey, still waiting on the $7 😅" },
            { id: "f", from: "me", at: f(SAID.vibe + 0.2), text: "guys?", delivered: true },
          ],
        }}
      />
    ),
  };
};

/** Fades its children in over the first frames it is on screen. */
const FadeIn: React.FC<{ frames?: number; children: React.ReactNode }> = ({ frames = 8, children }) => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ opacity: interpolate(frame, [0, frames], [0, 1], { extrapolateRight: "clamp" }) }}>{children}</AbsoluteFill>;
};

/* The title card fills the frame while the voice carries on underneath: the name on "Enter
   GroupCart", the minion's line across what it does, the three steps on "3 steps". */
const title = (until: number): Placed => {
  const from = T(SAID.enter - 0.3);
  const total = until - from;
  return {
    id: "title",
    from,
    total,
    node: (
      <FadeIn>
        <Retime
          keys={[
            ...keys(from, T, [
              [SAID.enter - 0.3, 0],
              [SAID.chatbot - 0.2, 28], // the name is up; the minion starts its line
              [SAID.split + 1.2, 80], // "search, split and collect, all by text."
              [SAID.steps, 84],
              [SAID.steps + 1.6, 140], // step 1, step 2, step 3
            ]),
            [total, 140 + (total - (T(SAID.steps + 1.6) - from))],
          ]}
        >
          <TitleCard />
        </Retime>
      </FadeIn>
    ),
  };
};

export const introShots = (titleUntil: number): Placed[] => [hook(), title(titleUntil)];
