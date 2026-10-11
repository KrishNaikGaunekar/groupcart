import React from "react";
import { Pipeline, SplitCard } from "../clips/panels";
import { groupcart } from "../clips/phones";
import { ASK, OFFERS, added } from "../clips/story";
import { at } from "./cut";
import { PhoneShot, Retime } from "./parts";

/* The middle recording: steps one and two, and the split.
   Times are seconds into it; what is being said then is quoted beside each. */

export type Placed = { id: string; from: number; total: number; node: React.ReactNode };

const T = (seconds: number) => at("steps", seconds);

/** [seconds, frame of the clip] pairs -> keys for <Retime>, on the clock of a shot starting at `from`. */
export const keys = (from: number, clock: (seconds: number) => number, pairs: [number, number][]): [number, number][] => pairs.map(([seconds, clip]) => [clock(seconds) - from, clip]);

/* "First, you text GroupCart what items you want."   1.17 - 3.48 */
const stepOne = (): Placed => {
  const from = T(0.8);
  const total = T(3.72) - from;
  const f = (seconds: number) => T(seconds) - from;
  return {
    id: "step one",
    from,
    total,
    node: (
      <PhoneShot
        total={total}
        says={[{ text: "step 1. text what you want.", from: 0 }]}
        chat={{
          name: "GroupCart",
          avatar: groupcart,
          composes: [{ text: ASK, start: f(1.45), send: f(2.6) }], // typed over "you text GroupCart", sent on "what items"
          rows: [
            { kind: "note", id: "n0", at: -100, text: "iMessage · Today 9:41 PM" },
            { id: "ask", from: "me", at: f(2.6), text: ASK, delivered: true },
          ],
        }}
      />
    ),
  };
};

/* "Using Photon Spectrum, it directs the text message into Gemini that creates a function call
   which searches for the items using SerpAPI. GroupCart then outputs a list of products"   4.03 - 13.54 */
const pipeline = (): Placed => {
  const from = T(3.6);
  const total = T(13.57) - from;
  return {
    id: "pipeline",
    from,
    total,
    node: (
      <Retime
        keys={keys(from, T, [
          [3.6, 0],
          [4.2, 18], // in
          [4.55, 44], // "Using": your text lights
          [4.85, 60], // "Photon Spectrum": the message reaches it
          [5.95, 78], // "it directs the text message"
          [6.45, 94], // "into"
          [6.75, 100], // "Gemini" lights
          [8.35, 140], // "that creates a function call": the call is typed out
          [8.5, 152],
          [9.0, 168], // "which searches": on to serpapi
          [9.25, 175], // "for the items using SerpAPI"
          [11.55, 180], // "GroupCart then outputs"
          [13.1, 226.5], // "a list of products": the three prices, then "three options, back in your texts."
          [13.14, 286],
          [13.57, 300], // out
        ])}
      >
        <Pipeline />
      </Retime>
    ),
  };
};

/* "detailing prices, which retailer it is from, and availability."                    13.6 - 17.5
   "Then, you react with a thumbs up to the specific item you want to buy."           19.52 - 23.3
   "GroupCart adds that to the total cart,"                                           24.09 - 25.8 */
const stepTwo = (): Placed => {
  const from = T(13.45);
  const total = T(26.05) - from;
  const f = (seconds: number) => T(seconds) - from;
  return {
    id: "step two",
    from,
    total,
    node: (
      <PhoneShot
        total={total}
        says={[{ text: "step 2. thumbs up the one you want.", from: f(19.3), jumps: [f(21.36)] }]} // in on "Then,"
        chat={{
          name: "GroupCart",
          avatar: groupcart,
          tapbacks: [{ target: "o1", picker: 26, at: f(21.3) }], // held on "you react with a", lands on "thumbs up"
          rows: [
            { id: "ask", from: "me", at: -90, text: ASK },
            { id: "o1", from: "them", typing: 14, at: f(14.1), text: OFFERS.popcorn, offer: true }, // "prices,"
            { id: "o2", from: "them", at: f(14.75), text: OFFERS.cola, offer: true },
            { id: "o3", from: "them", at: f(15.45), text: OFFERS.gummy, offer: true }, // "which retailer it is from,"
            { id: "w", from: "them", typing: 22, at: f(24.5), text: added("William", 22.47, 2) }, // "adds that to the total cart"
          ],
        }}
      />
    ),
  };
};

/* "and once everyone is done adding items, it will send a text detailing how much each person
   owes."   26.23 - 30.9.  It stays up until `until`, a frame of the finished video. */
const split = (until: number): Placed => {
  const from = T(25.95);
  const total = until - from;
  return {
    id: "split",
    from,
    total,
    node: (
      <Retime
        keys={[
          ...keys(from, T, [
            [25.95, 0],
            [26.55, 18], // in
            [27.95, 60], // "once everyone is done adding items": the three items, then the total
            [28.35, 70], // "it will send a text": each person is texted their own share
            [28.8, 84],
            [29.35, 104], // "detailing how much"
            [29.95, 124], // "each person owes."
            [30.75, 150],
            [31.55, 174],
          ]),
          [total - 15, 235],
          [total, 250], // out
        ]}
      >
        <SplitCard />
      </Retime>
    ),
  };
};

export const stepsShots = (splitUntil: number): Placed[] => [stepOne(), pipeline(), stepTwo(), split(splitUntil)];
