import React from "react";
import { AbsoluteFill } from "remotion";
import { Chat, ChatProps } from "../Chat";
import { LogoAvatar } from "../Logo";
import { Minion } from "../Minion";
import { Overlay, Speech } from "../Site";
import { ASK, OFFERS, added, youOwe } from "./story";

/* The phone clips. Each is an overlay for the right-hand side of the frame: the phone comes up
   from the bottom, the minion says which step this is, and both leave at the end. The phone is
   an accurate iPhone; only the minion and its bubble wear the website's look. */

const PHONE = { width: 500, height: 990 };
const groupcart = <LogoAvatar size={PHONE.width * 0.105} />;

const PhoneClip: React.FC<{ total: number; say?: string; jumps?: number[]; chat: Omit<ChatProps, "width" | "height"> }> = ({ total, say, jumps = [], chat }) => (
  <AbsoluteFill>
    {say ? (
      <Overlay total={total} delay={6} from="right" style={{ left: 986, top: 300, width: 330 }}>
        <Speech text={say} at={16} width={316} style={{ marginLeft: 14 }} />
        <Minion scale={1.75} wave={[[10, 64]]} talk={[[16, 16 + say.length * 0.75]]} jumps={jumps} look={[3, -1]} style={{ marginTop: -6 }} />
      </Overlay>
    ) : null}
    <Overlay total={total} style={{ left: 1330, top: 45 }}>
      <Chat {...PHONE} {...chat} />
    </Overlay>
  </AbsoluteFill>
);

/** 01. The problem: chasing friends for money in the group chat. */
export const HOOK = 300;
export const Hook: React.FC = () => (
  <PhoneClip
    total={HOOK}
    chat={{
      name: "movie night 🍿",
      group: true,
      rows: [
        { kind: "note", id: "n0", at: -100, text: "Today 9:12 PM" },
        { id: "a", from: "me", at: 22, text: "ok snacks are bought, it came to $28.11" },
        { id: "b", from: "me", at: 50, text: "so everyone owes me about $7" },
        { id: "c", from: "them", sender: "Sam", tint: "#FF9F0A", typing: 26, at: 100, text: "wait, i only had the gummy worms" },
        { id: "d", from: "them", sender: "Priya", tint: "#AF52DE", typing: 22, at: 146, text: "can you send me a request? i'll do it later" },
        { kind: "note", id: "n1", at: 186, text: "Thursday 4:02 PM" },
        { id: "e", from: "me", at: 202, text: "hey, still waiting on the $7 😅" },
        { id: "f", from: "me", at: 244, text: "guys?", delivered: true },
      ],
    }}
  />
);

/** 03. Step 1: text GroupCart what you want. */
export const STEP_ONE = 270;
export const StepOne: React.FC = () => (
  <PhoneClip
    total={STEP_ONE}
    say="step 1. text what you want."
    chat={{
      name: "GroupCart",
      avatar: groupcart,
      composes: [{ text: ASK, start: 26, send: 88 }],
      rows: [
        { kind: "note", id: "n0", at: -100, text: "iMessage · Today 9:41 PM" },
        { id: "ask", from: "me", at: 88, text: ASK, delivered: true },
        { id: "o1", from: "them", typing: 28, at: 130, text: OFFERS.popcorn, offer: true },
        { id: "o2", from: "them", at: 148, text: OFFERS.cola, offer: true },
        { id: "o3", from: "them", at: 166, text: OFFERS.gummy, offer: true },
        { id: "hint", from: "them", typing: 14, at: 204, text: "three under $15 👆 like the ones you want and i'll add them" },
      ],
    }}
  />
);

/** 05. Step 2: a thumbs up adds it to the cart. */
export const STEP_TWO = 240;
export const StepTwo: React.FC = () => (
  <PhoneClip
    total={STEP_TWO}
    say="step 2. thumbs up the one you want."
    jumps={[74]}
    chat={{
      name: "GroupCart",
      avatar: groupcart,
      tapbacks: [{ target: "o1", picker: 34, at: 72 }],
      rows: [
        { id: "ask", from: "me", at: -90, text: ASK },
        { id: "o1", from: "them", at: -80, text: OFFERS.popcorn, offer: true },
        { id: "o2", from: "them", at: -70, text: OFFERS.cola, offer: true },
        { id: "o3", from: "them", at: -60, text: OFFERS.gummy, offer: true },
        { id: "w", from: "them", typing: 16, at: 106, text: added("William", 22.47, 2) },
        { id: "k", from: "them", typing: 16, at: 168, text: added("Krish", 35.45, 3) },
      ],
    }}
  />
);

/** 07. Step 3: a thumbs up on your own "you owe" pays it. */
export const STEP_THREE = 285;
export const StepThree: React.FC = () => (
  <PhoneClip
    total={STEP_THREE}
    say="step 3. thumbs up again to pay."
    jumps={[96, 226]}
    chat={{
      name: "GroupCart",
      avatar: groupcart,
      tapbacks: [{ target: "owe", picker: 34, at: 94 }],
      rows: [
        { id: "k", from: "them", at: -60, text: added("Krish", 35.45, 3) },
        { id: "owe", from: "them", typing: 18, at: 30, text: youOwe("William", 9.63) },
        { id: "p1", from: "them", typing: 14, at: 126, text: "💸 William paid $9.63 for movie night — waiting on Justin, Krish" },
        { id: "p2", from: "them", typing: 14, at: 172, text: "💸 Justin paid $14.47 for movie night — waiting on Krish" },
        { id: "p3", from: "them", typing: 14, at: 220, text: "💸 Krish paid $13.92 for movie night\neveryone's in 🎉 order placed:\nwalmart: affil.walmart.com/cart\namazon: amazon.com/gp/aws/cart" },
      ],
    }}
  />
);
