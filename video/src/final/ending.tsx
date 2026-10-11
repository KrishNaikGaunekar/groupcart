import { MoneyFlow } from "../clips/panels";
import { Outro } from "../clips/pages";
import { groupcart } from "../clips/phones";
import { added, youOwe } from "../clips/story";
import { at } from "./cut";
import { FadeIn, PhoneShot, Retime } from "./parts";
import { Placed, keys, withExit } from "./steps";

/* The last recording: step three, where the money goes, and the sign-off.
   Times are seconds into it; what is being said then is quoted beside each. */

const T = (seconds: number) => at("pay", seconds);

/** The frame the split panel from the recording before is gone by. */
export const SPLIT_OUT = T(1.35);
/** The frame the last overlay is gone by: the speaker comes back to the middle around it and says
 *  "With GroupCart, you can handle all the shopping, calculating who owes what," to camera. */
export const MONEY_OUT = T(18.1);
/** The sign-off takes over on "and checking out all in one place," and stays after the voice
 *  stops at 25.13. */
export const OUTRO_IN = T(22.35);
export const OUTRO_OUT = T(28.4);

/* "Finally, just react with a thumbs up to confirm the payment."   1.1 - 3.8 */
const stepThree = (): Placed => {
  const from = T(0.95);
  const total = T(4.6) - from;
  const f = (seconds: number) => T(seconds) - from;
  return {
    id: "step three",
    from,
    total,
    node: (
      <PhoneShot
        total={total}
        says={[{ text: "step 3. thumbs up again to pay.", from: 0, jumps: [f(2.7) + 2] }]}
        chat={{
          name: "GroupCart",
          avatar: groupcart,
          tapbacks: [{ target: "owe", picker: 22, at: f(2.7) }], // held on "just react with a", lands on "thumbs up"
          rows: [
            { id: "k", from: "them", at: -60, text: added("Krish", 35.45, 3) },
            { id: "owe", from: "them", at: -30, text: youOwe("William", 9.63) },
            { id: "p1", from: "them", typing: 14, at: f(3.3), text: "💸 William paid $9.63 for movie night — waiting on Justin, Krish" }, // "to confirm the payment."
          ],
        }}
      />
    ),
  };
};

/* "GroupCart will use Capital One's Nessie API Sandbox to collect all the funds securely, then
   pay the store after everyone confirms, ensuring nobody fronts the bill. Payments are made by
   strict pattern matching so the AI never hallucinates prices."   4.41 - 17.24 */
const money = (): Placed => {
  const from = T(4.3);
  const total = MONEY_OUT - from;
  return {
    id: "money",
    from,
    total,
    node: (
      <Retime
        keys={withExit(
          keys(from, T, [
            [4.3, 0],
            [4.9, 18], // in
            [5.3, 29], // "Capital One's Nessie API Sandbox": three nessie accounts, the pool, two stores
            [6.2, 30],
            [8.6, 130], // "to collect all the funds securely,": the three shares go in, one by one
            [8.65, 132],
            [9.45, 156], // all in
            [9.55, 162],
            [10.9, 202], // "then pay the store after everyone confirms,": the pool pays both stores
            [13.4, 205], // "ensuring nobody fronts the bill." is the panel's own title
            [13.9, 220], // "Payments are made by strict pattern matching": the line about the fixed pattern
            [17.3, 226], // "so the AI never hallucinates prices."
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

/* "and checking out all in one place, your group chat."   22.5 - 25.13
   Fills the frame, fading in, and stays up after the voice. */
const outro = (): Placed => {
  const from = OUTRO_IN;
  const total = OUTRO_OUT - from;
  return {
    id: "outro",
    from,
    total,
    node: (
      <FadeIn>
        <Outro />
      </FadeIn>
    ),
  };
};

export const endingShots = (): Placed[] => [stepThree(), money(), outro()];
