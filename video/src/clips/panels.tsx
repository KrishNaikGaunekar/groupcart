import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Minion } from "../Minion";
import { Pixel } from "../Pixel";
import { Badge, Box, Bubble, Overlay } from "../Site";
import { BASIIC, IN_OUT, MONO, POP, S, SF, VIRALE, C, during, lerp, prog } from "../theme";
import { ASK, GROUP, PEOPLE, SUBTOTAL, TAX, TOTAL, TO_STORES, usd, youOwe } from "./story";

/* The diagrams, as panels for the right-hand side of the frame. Each is one of the website's
   glass boxes, with the minion standing on it, and comes in from the right over the footage. */

const PANEL = { left: 1186, width: 654 };
const INNER = PANEL.width - 40 - 2 - 22; // what is left inside the box's padding and rule

const Panel: React.FC<{ total: number; top: number; title: string; sprite: string; jumps?: number[]; wave?: [number, number][]; children: React.ReactNode }> = ({ total, top, title, sprite, jumps, wave = [[8, 56]], children }) => (
  <AbsoluteFill>
    <Overlay total={total} from="right" style={{ left: PANEL.left, top }}>
      <Minion scale={1.5} jumps={jumps} wave={wave} look={[-2, 2]} style={{ position: "absolute", left: PANEL.width - 214, top: -197 }} />
      <Box title={title} sprite={sprite} width={PANEL.width}>
        {children}
      </Box>
    </Overlay>
  </AbsoluteFill>
);

const Pop: React.FC<{ at: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ at, children, style }) => {
  const frame = useCurrentFrame();
  const p = prog(frame, at, 12, POP);
  return <div style={{ opacity: Math.min(1, p * 1.6), scale: String(lerp(0.88, 1, p)), ...style }}>{children}</div>;
};

/** A spinning coin that runs from one point to another once: what "moves" in every diagram. */
const Coin: React.FC<{ from: [number, number]; to: [number, number]; start: number; frames?: number }> = ({ from, to, start, frames = 16 }) => {
  const frame = useCurrentFrame();
  if (frame < start || frame > start + frames) return null;
  const p = prog(frame, start, frames, IN_OUT);
  return <Pixel name="coin" scale={2} style={{ position: "absolute", left: lerp(from[0], to[0], p) - 9, top: lerp(from[1], to[1], p) - 9, zIndex: 3 }} />;
};

const row: React.CSSProperties = { border: `2px solid ${S.line}`, borderRadius: 8, background: "rgba(240,248,255,0.62)" };
const lit = (hot: number): React.CSSProperties => (hot > 0 ? { background: `rgba(213,200,232,${0.62 + 0.3 * hot})`, boxShadow: `0 0 0 ${5 * hot}px ${S.lilacSoft}` } : {});
const small: React.CSSProperties = { fontSize: 22, lineHeight: "26px", color: S.line };
const name: React.CSSProperties = { fontFamily: VIRALE, fontSize: 26, lineHeight: "28px", letterSpacing: 3, whiteSpace: "nowrap" };

/* --------------------------------------------------------- 04 pipeline */

const STEPS = [
  { title: "your text", sub: "imessage or sms", sprite: "phone" },
  { title: "photon spectrum", sub: "carries the message", sprite: "arrows" },
  { title: "gemini", sub: "chooses a tool to call", sprite: "sparkle" },
  { title: "serpapi", sub: "searches the stores", sprite: "cart" },
];
const HOPS = [44, 78, 152]; // the frame the coin leaves each step for the next
const CALL = 'search_products({\n  query: "snacks", max_price: 15 })';

export const PIPELINE = 300;
export const Pipeline: React.FC = () => {
  const frame = useCurrentFrame();
  const typed = CALL.slice(0, Math.round(prog(frame, 100, 40, (t) => t) * CALL.length));
  return (
    <Panel total={PIPELINE} top={262} title="where your text goes" sprite="phone" jumps={[196]}>
      {STEPS.map((step, i) => {
        const arrive = i === 0 ? 22 : HOPS[i - 1] + 16;
        return (
          <React.Fragment key={step.title}>
            {i > 0 ? (
              <div style={{ height: 20, position: "relative" }}>
                <div style={{ position: "absolute", left: 37, top: 0, bottom: 0, borderLeft: `2px solid ${S.line}` }} />
                <Coin from={[38, -8]} to={[38, 28]} start={HOPS[i - 1]} />
              </div>
            ) : null}
            <Pop at={8 + i * 6} style={{ ...row, ...lit(during(frame, arrive, arrive + 22, 6)), padding: "10px 14px", display: "flex", gap: 16, alignItems: "flex-start" }}>
              <div style={{ width: 46, height: 54, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                <Pixel name={step.sprite} scale={2} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={name}>{step.title}</div>
                <div style={small}>{step.sub}</div>
                {step.title === "gemini" ? (
                  <div style={{ position: "relative", marginTop: 8, padding: "7px 10px", borderRadius: 8, background: S.mintGlass, fontFamily: MONO, fontSize: 18, lineHeight: "24px", letterSpacing: 0, whiteSpace: "pre", opacity: prog(frame, 96, 8) }}>
                    <span style={{ visibility: "hidden" }}>{CALL}</span>
                    <span style={{ position: "absolute", left: 10, top: 7 }}>{typed}</span>
                  </div>
                ) : null}
              </div>
            </Pop>
          </React.Fragment>
        );
      })}
      <div style={{ display: "flex", gap: 12, marginTop: 18 }}>
        {[
          ["walmart", "$8.98"],
          ["walmart", "$12.98"],
          ["amazon", "$13.49"],
        ].map(([store, price], i) => (
          <Pop key={i} at={180 + i * 9} style={{ flex: 1 }}>
            <Badge top={store} bottom={price} tone={i === 2 ? "lilac" : "mint"} width={(INNER - 24) / 3} />
          </Pop>
        ))}
      </div>
      <Pop at={214} style={{ marginTop: 12 }}>
        three options, back in your texts.
      </Pop>
    </Panel>
  );
};

/* ------------------------------------------------------------ 06 split */

const Tile: React.FC<{ tint: string; letter: string; size?: number }> = ({ tint, letter, size = 34 }) => (
  <div style={{ width: size, height: size, flex: "none", background: tint, border: `2px solid ${S.line}`, color: "#fff", fontFamily: VIRALE, fontSize: size * 0.58, lineHeight: `${size - 4}px`, textAlign: "center", textTransform: "lowercase" }}>{letter}</div>
);

export const SPLIT = 250;
export const SplitCard: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <Panel total={SPLIT} top={270} title="who owes what" sprite="coin" jumps={[150]}>
      {PEOPLE.map((person, i) => (
        <Pop key={person.name} at={10 + i * 9} style={{ display: "flex", alignItems: "center", gap: 14, padding: "5px 0", borderBottom: `2px dotted ${S.line}` }}>
          <Tile tint={person.tint} letter={person.name[0]} />
          <div style={{ flex: 1, fontSize: 24, whiteSpace: "nowrap", overflow: "hidden", textTransform: "lowercase" }}>{person.item}</div>
          <div style={{ fontSize: 26 }}>{usd(person.price)}</div>
        </Pop>
      ))}
      <Pop at={46} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 14px", ...small }}>
        <span>
          subtotal {usd(SUBTOTAL)} + tax {usd(TAX)}
        </span>
        <span style={{ color: S.ink, fontSize: 26 }}>{usd(TOTAL)}</span>
      </Pop>
      <Pop at={70} style={{ ...small, fontStyle: "italic", paddingBottom: 6 }}>
        each person is texted their own share.
      </Pop>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {PEOPLE.map((person, i) => {
          const at = 84 + i * 20;
          const shown = lerp(person.price, person.owes, prog(frame, at + 4, 20));
          return (
            <Pop key={person.name} at={at}>
              <Bubble size={21}>{youOwe(person.name, shown)}</Bubble>
            </Pop>
          );
        })}
      </div>
    </Panel>
  );
};

/* ------------------------------------------------------- 08 money flow */

const PAYS = [34, 74, 114]; // the frame each share leaves its account
const OUT = 164; // the frame the pool pays the stores
const ACC_Y = [41, 150, 259];
const STORE_Y = [95, 205];
const POOL: [number, number] = [300, 150];
const R = 60;

export const MONEY = 300;
export const MoneyFlow: React.FC = () => {
  const frame = useCurrentFrame();
  const inPool = PEOPLE.reduce((sum, person, i) => sum + person.owes * prog(frame, PAYS[i] + 14, 10), 0);
  const count = PAYS.filter((start) => frame >= start + 16).length;
  const paid = prog(frame, OUT + 16, 10);
  const ring = 2 * Math.PI * (R - 8);
  return (
    <Panel total={MONEY} top={300} title="nobody fronts the bill" sprite="card" jumps={[PAYS[2] + 18, OUT + 18]}>
      <div style={{ position: "relative", height: 300, width: INNER }}>
        <svg width={INNER} height={300} style={{ position: "absolute", inset: 0 }}>
          {ACC_Y.map((y) => (
            <path key={y} d={`M196 ${y} C222 ${y} 214 ${POOL[1]} ${POOL[0] - R - 6} ${POOL[1]}`} fill="none" stroke={S.line} strokeWidth={2} />
          ))}
          {STORE_Y.map((y) => (
            <path key={y} d={`M${POOL[0] + R + 6} ${POOL[1]} C386 ${POOL[1]} 378 ${y} 404 ${y}`} fill="none" stroke={S.line} strokeWidth={2} strokeDasharray={paid > 0 ? undefined : "4 6"} />
          ))}
          <circle cx={POOL[0]} cy={POOL[1]} r={R} fill="rgba(240,248,255,0.8)" stroke={S.line} strokeWidth={2} />
          <circle cx={POOL[0]} cy={POOL[1]} r={R - 8} fill="none" stroke="rgba(87,85,85,0.18)" strokeWidth={10} />
          <circle cx={POOL[0]} cy={POOL[1]} r={R - 8} fill="none" stroke={S.link} strokeWidth={10} strokeDasharray={ring} strokeDashoffset={ring * (1 - inPool / TOTAL)} transform={`rotate(-90 ${POOL[0]} ${POOL[1]})`} />
        </svg>
        <div style={{ position: "absolute", left: POOL[0] - R, top: POOL[1] - R, width: R * 2, height: R * 2, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: 22, lineHeight: "24px", letterSpacing: 0 }}>
          <div>{usd(inPool * (1 - paid))}</div>
          <div style={{ fontSize: 17, color: S.line }}>{paid >= 1 ? "paid out" : count === 3 ? "all in!" : `${count} of 3 in`}</div>
        </div>
        {PEOPLE.map((person, i) => {
          const done = frame >= PAYS[i] + 16;
          return (
            <React.Fragment key={person.name}>
              <Pop at={8 + i * 6} style={{ ...row, ...lit(during(frame, PAYS[i] - 4, PAYS[i] + 14, 5)), position: "absolute", left: 0, top: ACC_Y[i] - 34, width: 196, height: 68, display: "flex", alignItems: "center", gap: 10, padding: "0 10px" }}>
                <Tile tint={person.tint} letter={person.name[0]} />
                <div style={{ lineHeight: "24px" }}>
                  <div style={{ fontSize: 24, textTransform: "lowercase" }}>{person.name}</div>
                  <div style={{ fontSize: 19, color: done ? S.link : S.line, letterSpacing: 1 }}>{done ? `-${usd(person.owes)}` : "nessie"}</div>
                </div>
              </Pop>
              <Coin from={[196, ACC_Y[i]]} to={[POOL[0] - R, POOL[1]]} start={PAYS[i]} />
            </React.Fragment>
          );
        })}
        {TO_STORES.map((store, i) => (
          <React.Fragment key={store.store}>
            <Pop at={20 + i * 6} style={{ ...row, ...lit(during(frame, OUT + 14, OUT + 36, 6)), position: "absolute", left: 404, top: STORE_Y[i] - 36, width: INNER - 404, height: 72, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 12px" }}>
              <div style={{ ...name, fontSize: 24, opacity: lerp(0.45, 1, paid) }}>{store.store}</div>
              <div style={{ fontSize: 19, lineHeight: "22px", letterSpacing: 1, color: paid >= 1 ? S.link : S.line }}>{paid >= 1 ? `paid ${usd(store.amount)}` : "waiting"}</div>
            </Pop>
            <Coin from={[POOL[0] + R, POOL[1]]} to={[404, STORE_Y[i]]} start={OUT} />
          </React.Fragment>
        ))}
      </div>
      <Pop at={206} style={{ marginTop: 10, fontSize: 24, lineHeight: "30px" }}>
        <span style={{ fontFamily: MONO, fontSize: 19, letterSpacing: 0, background: S.mintGlass, borderRadius: 6, padding: "3px 8px", marginRight: 10 }}>"pay"</span>
        is matched by a fixed pattern. the model never types a number.
      </Pop>
    </Panel>
  );
};

/* ------------------------------------------- 09 groups without a group chat */

type Mini = { at: number; text: string; tone?: "blue" | "gray"; like?: number };

/** A few bubbles in a small window that scrolls like the real thread does. */
const MiniThread: React.FC<{ rows: Mini[]; height: number }> = ({ rows, height }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ flex: 1, minWidth: 0, height, overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "flex-end", background: "#fff", border: `2px solid ${S.line}`, borderRadius: 8, padding: "0 10px 8px" }}>
      {rows
        .filter((r) => frame >= r.at)
        .map((r, i) => {
          const p = prog(frame, r.at, 9);
          const landed = r.like !== undefined ? prog(frame, r.like, 9, POP) : 0;
          return (
            <div key={i} style={{ display: "grid", gridTemplateRows: `${p}fr`, flex: "none" }}>
              <div style={{ minHeight: 0, overflow: p < 1 ? "hidden" : "visible", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                <div style={{ paddingTop: 6 + landed * 14, display: "flex", justifyContent: r.tone === "blue" ? "flex-end" : "flex-start" }}>
                  <Bubble tone={r.tone} size={19} reaction={landed} style={{ maxWidth: "90%", opacity: prog(frame, r.at, 5), scale: String(lerp(0.85, 1, prog(frame, r.at, 10, POP))), transformOrigin: r.tone === "blue" ? "100% 100%" : "0% 100%" }}>
                    {r.text}
                  </Bubble>
                </div>
              </div>
            </div>
          );
        })}
    </div>
  );
};

const RELAY_1 = 36; // William's request leaves his thread
const RELAY_2 = 178; // Krish's thumbs up leaves his
const SEAT_H = 150;
const HUB_H = 74;
const seatY = (i: number) => HUB_H + 14 + i * (SEAT_H + 12) + SEAT_H / 2;

export const GROUPS = 330;
export const GroupsRelay: React.FC = () => {
  const frame = useCurrentFrame();
  const heard: Mini = { at: RELAY_1 + 30, text: `William → ${GROUP}: find snacks under $15` };
  const offer: Mini = { at: 112, text: "Walmart · $12.98 · 4.5★\nCola Mini Cans, 30 pk" };
  const done: Mini = { at: RELAY_2 + 32, text: `added for Krish to ${GROUP} ✓ cart is $35.45 (3 items)` };
  const threads: Mini[][] = [
    [{ at: 24, text: ASK, tone: "blue" }, offer, done],
    [heard, offer, done],
    [heard, { ...offer, like: RELAY_2 - 6 }, done],
  ];
  const hot = Math.max(during(frame, RELAY_1 + 10, RELAY_1 + 30, 5), during(frame, RELAY_2 + 12, RELAY_2 + 32, 5));
  const RAIL = 12;
  return (
    <Panel total={GROUPS} top={214} title="no group chat needed" sprite="wiggle" jumps={[RELAY_1 + 12, RELAY_2 + 14]}>
      <div style={{ position: "relative", width: INNER }}>
        <div style={{ position: "absolute", left: RAIL, top: HUB_H, height: seatY(2) - HUB_H, borderLeft: `2px solid ${S.line}` }} />
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ position: "absolute", left: RAIL, top: seatY(i), width: 22, borderTop: `2px solid ${S.line}` }} />
        ))}
        {/* up to the hub, then out to the other two */}
        <Coin from={[RAIL, seatY(0)]} to={[RAIL, HUB_H]} start={RELAY_1} frames={12} />
        <Coin from={[RAIL, HUB_H]} to={[RAIL, seatY(1)]} start={RELAY_1 + 12} frames={14} />
        <Coin from={[RAIL, HUB_H]} to={[RAIL, seatY(2)]} start={RELAY_1 + 12} frames={18} />
        <Coin from={[RAIL, seatY(2)]} to={[RAIL, HUB_H]} start={RELAY_2} frames={14} />
        <Coin from={[RAIL, HUB_H]} to={[RAIL, seatY(1)]} start={RELAY_2 + 14} frames={14} />
        <Coin from={[RAIL, HUB_H]} to={[RAIL, seatY(0)]} start={RELAY_2 + 14} frames={18} />
        <Pop at={6} style={{ ...row, ...lit(hot), height: HUB_H, display: "flex", alignItems: "center", gap: 14, padding: "0 14px" }}>
          <Pixel name="cart" scale={3} />
          <div>
            <div style={name}>groupcart</div>
            <div style={small}>holds the group and its one cart</div>
          </div>
        </Pop>
        {PEOPLE.map((person, i) => (
          <Pop key={person.name} at={12 + i * 6} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: i ? 12 : 14, paddingLeft: 34 }}>
            <div style={{ width: 96, flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, fontSize: 20, lineHeight: "22px", letterSpacing: 1, textTransform: "lowercase" }}>
              <Tile tint={person.tint} letter={person.name[0]} size={44} />
              {person.name}
            </div>
            <MiniThread rows={threads[i]} height={SEAT_H} />
          </Pop>
        ))}
      </div>
      <Pop at={RELAY_1 + 34} style={{ marginTop: 12, ...small }}>
        everyone texts groupcart one to one. it relays.
      </Pop>
    </Panel>
  );
};

/* --------------------------------------------------------------- 10 android */

export const ANDROID = 280;
export const AndroidToo: React.FC = () => {
  const frame = useCurrentFrame();
  const chip: React.CSSProperties = { display: "inline-block", borderRadius: 8, padding: "6px 10px", fontSize: 18, lineHeight: "24px", letterSpacing: 0, whiteSpace: "nowrap" };
  const arrow = (at: number) => <div style={{ ...small, opacity: prog(frame, at, 8), padding: "6px 0 2px 6px" }}>groupcart receives</div>;
  return (
    <Panel total={ANDROID} top={270} title="android works too" sprite="phone" jumps={[186]}>
      <Pop at={8} style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <Badge top="iphone" bottom="imessage" width={150} />
        <div style={{ flex: 1, paddingTop: 12 }}>
          <Bubble size={20} reaction={prog(frame, 40, 9, POP)}>
            Walmart · $8.98 · Butter Popcorn
          </Bubble>
        </div>
      </Pop>
      {arrow(54)}
      <Pop at={58}>
        <span style={{ ...chip, fontFamily: MONO, background: S.mintGlass }}>reaction 👍 on message 8F2A</span>
      </Pop>
      <div style={{ borderTop: `2px dotted ${S.line}`, margin: "14px 0" }} />
      <Pop at={84} style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <Badge top="android" bottom="sms or rcs" tone="lilac" width={150} />
        <div style={{ flex: 1, paddingTop: 4 }}>
          <Bubble size={20} tone="android" reaction={prog(frame, 112, 9, POP)} style={{ borderRadius: "20px 20px 20px 6px" }}>
            Walmart · $12.98 · Cola Mini Cans
          </Bubble>
        </div>
      </Pop>
      {arrow(128)}
      <Pop at={132}>
        <span style={{ ...chip, fontFamily: SF, fontSize: 20, background: C.gSurface, color: C.gText, borderRadius: 16, padding: "7px 14px" }}>Liked “Walmart · $12.98 · 4.5★ Cola…”</span>
      </Pop>
      <Pop at={176} style={{ ...row, ...lit(during(frame, 180, 206, 6)), marginTop: 18, padding: "10px 14px", display: "flex", alignItems: "center", gap: 14 }}>
        <Pixel name="cart" scale={3} />
        <div>
          <div style={name}>same match</div>
          <div style={small}>both are added to the cart.</div>
        </div>
      </Pop>
      <Pop at={214} style={{ marginTop: 12, ...small, fontFamily: BASIIC }}>
        sms has no typing bubble. it still replies.
      </Pop>
    </Panel>
  );
};
