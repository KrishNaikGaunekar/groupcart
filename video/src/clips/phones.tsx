import React from "react";
import { Chat } from "../Chat";
import { LogoAvatar } from "../Logo";
import { Headline, PHONE, Split, Stage, StepDisc, Sub } from "../Stage";
import { ASK, OFFERS, added, youOwe } from "./story";

const groupcart = <LogoAvatar size={PHONE.width * 0.105} />;

/** 01. The problem: chasing friends for money in the group chat. */
export const Hook: React.FC = () => (
  <Stage>
    <Split
      left={
        <>
          <Headline at={6} size={112}>
            You paid.
            <br />
            Now everyone
            <br />
            owes you $7.
          </Headline>
          <Sub at={176}>And you get to be the one who asks.</Sub>
        </>
      }
      right={
        <Chat
          {...PHONE}
          name="movie night 🍿"
          group
          rows={[
            { kind: "note", id: "n0", at: -100, text: "Today 9:12 PM" },
            { id: "a", from: "me", at: 16, text: "ok snacks are bought, it came to $28.11" },
            { id: "b", from: "me", at: 46, text: "so everyone owes me about $7" },
            { id: "c", from: "them", sender: "Sam", tint: "#FF9F0A", typing: 26, at: 98, text: "wait, i only had the gummy worms" },
            { id: "d", from: "them", sender: "Priya", tint: "#AF52DE", typing: 22, at: 146, text: "can you send me a request? i'll do it later" },
            { kind: "note", id: "n1", at: 188, text: "Thursday 4:02 PM" },
            { id: "e", from: "me", at: 204, text: "hey, still waiting on the $7 😅" },
            { id: "f", from: "me", at: 250, text: "guys?", delivered: true },
          ]}
        />
      }
    />
  </Stage>
);

/** 03. Step 1: text GroupCart what you want. */
export const StepOne: React.FC = () => (
  <Stage>
    <Split
      left={
        <>
          <StepDisc n={1} at={4} />
          <Headline at={10} size={112}>
            Text what
            <br />
            you want.
          </Headline>
          <Sub at={130}>It comes back with real products, prices and stores.</Sub>
        </>
      }
      right={
        <Chat
          {...PHONE}
          name="GroupCart"
          avatar={groupcart}
          composes={[{ text: ASK, start: 22, send: 86 }]}
          rows={[
            { kind: "note", id: "n0", at: -100, text: "iMessage · Today 9:41 PM" },
            { id: "ask", from: "me", at: 86, text: ASK, delivered: true },
            { id: "o1", from: "them", typing: 30, at: 130, text: OFFERS.popcorn, offer: true },
            { id: "o2", from: "them", at: 148, text: OFFERS.cola, offer: true },
            { id: "o3", from: "them", at: 166, text: OFFERS.gummy, offer: true },
            { id: "hint", from: "them", typing: 14, at: 204, text: "three under $15 👆 like the ones you want and i'll add them" },
          ]}
        />
      }
    />
  </Stage>
);

/** 05. Step 2: a thumbs up adds it to the cart. */
export const StepTwo: React.FC = () => (
  <Stage>
    <Split
      left={
        <>
          <StepDisc n={2} at={4} />
          <Headline at={10} size={112}>
            👍 the one
            <br />
            you want.
          </Headline>
          <Sub at={104}>That's the whole add-to-cart.</Sub>
        </>
      }
      right={
        <Chat
          {...PHONE}
          name="GroupCart"
          avatar={groupcart}
          tapbacks={[{ target: "o1", picker: 36, at: 70 }]}
          rows={[
            { id: "ask", from: "me", at: -90, text: ASK },
            { id: "o1", from: "them", at: -80, text: OFFERS.popcorn, offer: true },
            { id: "o2", from: "them", at: -70, text: OFFERS.cola, offer: true },
            { id: "o3", from: "them", at: -60, text: OFFERS.gummy, offer: true },
            { id: "w", from: "them", typing: 16, at: 104, text: added("William", 22.47, 2) },
            { id: "k", from: "them", typing: 16, at: 172, text: added("Krish", 35.45, 3) },
          ]}
        />
      }
    />
  </Stage>
);

/** 07. Step 3: a thumbs up on your own "you owe" pays it. */
export const StepThree: React.FC = () => (
  <Stage>
    <Split
      left={
        <>
          <StepDisc n={3} at={4} />
          <Headline at={10} size={112}>
            👍 again
            <br />
            to pay.
          </Headline>
          <Sub at={126}>When the last person is in, the order goes out.</Sub>
        </>
      }
      right={
        <Chat
          {...PHONE}
          name="GroupCart"
          avatar={groupcart}
          tapbacks={[{ target: "owe", picker: 34, at: 92 }]}
          rows={[
            { id: "k", from: "them", at: -60, text: added("Krish", 35.45, 3) },
            { id: "owe", from: "them", typing: 18, at: 22, text: youOwe("William", 9.63) },
            { id: "p1", from: "them", typing: 14, at: 124, text: "💸 William paid $9.63 for movie night — waiting on Justin, Krish" },
            { id: "p2", from: "them", typing: 14, at: 172, text: "💸 Justin paid $14.47 for movie night — waiting on Krish" },
            { id: "p3", from: "them", typing: 14, at: 220, text: "💸 Krish paid $13.92 for movie night\neveryone's in 🎉 order placed:\nwalmart: affil.walmart.com/cart\namazon: amazon.com/gp/aws/cart" },
          ]}
        />
      }
    />
  </Stage>
);
