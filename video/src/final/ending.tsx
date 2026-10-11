import { MoneyFlow } from "../clips/panels";
import { Outro } from "../clips/pages";
import { groupcart } from "../clips/phones";
import { added, youOwe } from "../clips/story";
import { at } from "./cut";
import { PhoneShot, Retime } from "./parts";
import { Placed, keys, withExit } from "./steps";

/* The last recording: step three, where the money goes, and the sign-off.
   SAID is when each phrase starts, in seconds into it. */

export const SAID = {
  finally: 0.6, // "Finally,"
  react: 1.2, // "just react with a"
  thumbsUp: 2.0, // "thumbs up" (when it has been said)
  confirm: 2.6, // "to confirm the payment."
  nessie: 4.8, // "GroupCart will use Capital One's Nessie API sandbox"
  collect: 8.0, // "to collect all the funds securely first"
  payStore: 10.5, // "then pay the store after everyone confirms,"
  fronts: 13.0, // "ensuring nobody fronts the bill."
  pattern: 15.0, // "Payments are made by strict pattern matching,"
  never: 17.5, // "so the AI never hallucinates amounts."
  withGroupCart: 21.0, // "With GroupCart, you can handle all the shopping, calculating who owes what,"
  checkOut: 25.5, // "and check out all in one place:"
  groupChat: 27.5, // "your group chat."
  end: 29.0, // the last word is out
};

const T = (seconds: number) => at("pay", seconds);

/** The frame the split panel from the recording before leaves by. */
export const SPLIT_OUT = T(SAID.finally - 0.15);
/** The frame the last overlay is gone by: the picture brings the speaker back to the middle after it. */
export const MONEY_OUT = T(SAID.withGroupCart - 0.1);
/** The frame the sign-off takes over on, and how long it stays after the voice stops. */
export const OUTRO_IN = T(SAID.checkOut - 0.2);
const OUTRO_HOLD = 3.2;
export const OUTRO_OUT = T(SAID.end + OUTRO_HOLD);

/* "Finally, just react with a thumbs up to confirm the payment." */
const stepThree = (): Placed => {
  const from = T(SAID.finally - 0.35);
  const total = T(SAID.nessie - 0.1) - from;
  const f = (seconds: number) => T(seconds) - from;
  return {
    id: "step three",
    from,
    total,
    node: (
      <PhoneShot
        total={total}
        says={[{ text: "step 3. thumbs up again to pay.", from: 0, jumps: [f(SAID.thumbsUp) + 2] }]}
        chat={{
          name: "GroupCart",
          avatar: groupcart,
          tapbacks: [{ target: "owe", picker: 24, at: f(SAID.thumbsUp) }], // open on "react with a", lands on "thumbs up"
          rows: [
            { id: "k", from: "them", at: -60, text: added("Krish", 35.45, 3) },
            { id: "owe", from: "them", at: -30, text: youOwe("William", 9.63) },
            { id: "p1", from: "them", typing: 14, at: f(SAID.confirm + 0.5), text: "💸 William paid $9.63 for movie night — waiting on Justin, Krish" },
          ],
        }}
      />
    ),
  };
};

/* "GroupCart will use Capital One's Nessie API sandbox to collect all the funds securely first
   then pay the store after everyone confirms, ensuring nobody fronts the bill. Payments are made
   by strict pattern matching, so the AI never hallucinates amounts." */
const money = (): Placed => {
  const from = T(SAID.nessie - 0.25);
  const total = MONEY_OUT - from;
  return {
    id: "money",
    from,
    total,
    node: (
      <Retime
        keys={withExit(
          keys(from, T, [
            [SAID.nessie - 0.25, 0],
            [SAID.nessie + 0.35, 18], // in: three nessie accounts, the pool, two stores
            [SAID.collect, 30],
            [SAID.payStore - 0.2, 134], // "collect all the funds securely first": the three shares go in
            [SAID.payStore + 0.3, 160],
            [SAID.fronts, 200], // "then pay the store after everyone confirms": the pool pays out
            [SAID.pattern, 204],
            [SAID.pattern + 0.8, 226], // "strict pattern matching": the line about the fixed pattern
          ]),
          total,
          300,
        )}
      >
        <MoneyFlow />
      </Retime>
    ),
  };
};

/* "...and check out all in one place: your group chat." Fills the frame, and stays after the voice. */
const outro = (): Placed => {
  const from = OUTRO_IN;
  const total = OUTRO_OUT - from;
  return { id: "outro", from, total, node: <Outro /> };
};

export const endingShots = (): Placed[] => [stepThree(), money(), outro()];
