import { TitleCard } from "../clips/pages";
import { at } from "./cut";
import { FadeIn, PhoneShot, Retime } from "./parts";
import { Placed, keys } from "./steps";

/* The first recording: the problem, then the title card.
   Times are seconds into it; what is being said then is quoted beside each. */

const T = (seconds: number) => at("hook", seconds);

/** The frame the phone starts to come in on: the picture moves the speaker aside around it.
 *  "We have all been there," (1.2 - 2.12) is said to camera first. */
export const HOOK_IN = T(2.0);

/* The group chat nobody enjoys, with the messages of 01-hook landing on the trouble each one is. */
const hook = (): Placed => {
  const from = HOOK_IN;
  const total = T(18.35) - from;
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
            { id: "a", from: "me", at: f(3.1), text: "ok snacks are bought, it came to $28.11" }, // "you pay up front for the group meal or shopping haul"
            { id: "b", from: "me", at: f(5.0), text: "so everyone owes me about $7" }, // "and now everyone owes you $7."
            // "The problem is not that they will forget to pay you back,"   6.9 - 9.14
            { id: "c", from: "them", sender: "Sam", tint: "#FF9F0A", typing: 22, at: f(10.6), text: "wait, i only had the gummy worms" }, // "figuring out how much each person owes,"
            { id: "d", from: "them", sender: "Priya", tint: "#AF52DE", typing: 20, at: f(13.2), text: "can you send me a request? i'll do it later" }, // "opening different payment apps,"
            { kind: "note", id: "n1", at: f(14.45), text: "Thursday 4:02 PM" },
            { id: "e", from: "me", at: f(15.0), text: "hey, still waiting on the $7 😅" }, // "and sending awkward reminder messages"
            { id: "f", from: "me", at: f(16.9), text: "guys?", delivered: true }, // "in the group chat that kill the vibe."
          ],
        }}
      />
    ),
  };
};

/* The title card fills the frame while the voice carries on underneath. Its minion types
   "bello! this is groupcart. search, split and collect, all by text." and each of those three
   words is typed as its own is said; the three steps come up on "three simple steps". */
const title = (until: number): Placed => {
  const from = T(18.15);
  const total = until - from;
  return {
    id: "title",
    from,
    total,
    node: (
      <FadeIn>
        <Retime
          keys={keys(from, T, [
            [18.15, 0],
            [18.95, 24], // "Enter GroupCart,": the name
            [19.6, 28], // "a chat bot that makes it simple to": the minion starts its line
            [21.3, 52], // "search for items,"
            [22.5, 57.5], // "split the bill accordingly,"
            [23.95, 66.5], // "and collect everyone's share"
            [25.2, 78], // "before checkout."
            [26.45, 84], // "And it only takes"
            [28.3, 140], // "three simple steps.": step 1, step 2, step 3
            [28.63, 150],
          ])}
        >
          <TitleCard />
        </Retime>
      </FadeIn>
    ),
  };
};

export const introShots = (titleUntil: number): Placed[] => [hook(), title(titleUntil)];
