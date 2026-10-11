import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Logo } from "../Logo";
import { Headline, Rise, Stage, Sub } from "../Stage";
import { C, H, IN_OUT, MONO, POP, SF, W, during, lerp, prog } from "../theme";
import { PEOPLE, SUBTOTAL, TAX, TOTAL, TO_STORES, usd, youOwe } from "./story";

/* Diagrams are drawn in frame coordinates (1920 x 1080): the nodes sit on a grid
   and the lines and dots that move between them need to know where they are. */

const Card: React.FC<{ x: number; y: number; w: number; h: number; at: number; hot?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ x, y, w, h, at, hot = 0, children, style }) => {
  const frame = useCurrentFrame();
  const p = prog(frame, at, 16, POP);
  return (
    <div
      style={{
        position: "absolute",
        left: x - w / 2,
        top: y - h / 2,
        width: w,
        height: h,
        borderRadius: 34,
        background: "#fff",
        boxShadow: `0 18px 44px rgba(22,24,29,0.10), 0 0 0 ${3 + hot * 4}px ${hot > 0 ? `rgba(242,92,31,${hot})` : "rgba(22,24,29,0.06)"}`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        opacity: Math.min(1, p * 1.6),
        scale: lerp(0.86, 1, p) * (1 + 0.035 * hot),
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** A line that draws itself from its start to its end. */
const Wire: React.FC<{ d: string; length: number; p: number; color?: string; width?: number; dashed?: boolean }> = ({ d, length, p, color = "rgba(22,24,29,0.22)", width = 5, dashed }) =>
  dashed ? (
    <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeDasharray="2 16" opacity={p} />
  ) : (
    <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={length} strokeDashoffset={length * (1 - p)} />
  );

/** A dot that runs from one point to another once. */
const Runner: React.FC<{ from: [number, number]; to: [number, number]; start: number; frames?: number; color?: string; size?: number }> = ({ from, to, start, frames = 24, color = C.orange, size = 26 }) => {
  const frame = useCurrentFrame();
  if (frame < start || frame > start + frames) return null;
  const p = prog(frame, start, frames, IN_OUT);
  return (
    <div style={{ position: "absolute", left: lerp(from[0], to[0], p) - size / 2, top: lerp(from[1], to[1], p) - size / 2, width: size, height: size, borderRadius: "50%", background: color, boxShadow: `0 0 0 ${size * 0.35}px ${color}33, 0 0 ${size}px ${color}` }} />
  );
};

const Svg: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
    {children}
  </svg>
);

const Title: React.FC<{ children: React.ReactNode; sub?: React.ReactNode; subAt?: number }> = ({ children, sub, subAt = 14 }) => (
  <div style={{ position: "absolute", left: 130, top: 78, right: 130, display: "flex", flexDirection: "column", gap: 14 }}>
    <Headline at={2} size={84}>
      {children}
    </Headline>
    {sub ? (
      <Sub at={subAt} size={40}>
        {sub}
      </Sub>
    ) : null}
  </div>
);

const Typed: React.FC<{ text: string; start: number; frames: number }> = ({ text, start, frames }) => {
  const frame = useCurrentFrame();
  return <>{text.slice(0, Math.round(prog(frame, start, frames, (t) => t) * text.length))}</>;
};

/* ------------------------------------------------------------ 02 title */

export const TitleCard: React.FC = () => {
  const frame = useCurrentFrame();
  const logo = prog(frame, 4, 20, POP);
  const dots = [0, 1, 2].map((i) => 0.35 + 0.65 * Math.max(0, Math.sin((frame / 30) * Math.PI * 2 * 1.1 - i * 0.9))) as [number, number, number];
  return (
    <Stage>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 44 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
          <div style={{ scale: logo, rotate: `${lerp(-14, 0, logo)}deg` }}>
            <Logo size={230} dots={frame < 70 ? dots : [1, 1, 1]} />
          </div>
          <Rise at={16} style={{ fontSize: 190, fontWeight: 700, letterSpacing: -8 }}>
            GroupCart
          </Rise>
        </div>
        <div style={{ display: "flex", gap: 46, fontSize: 84, fontWeight: 700, letterSpacing: -3 }}>
          {["Search.", "Split.", "Collect."].map((word, i) => (
            <Rise key={word} at={44 + i * 16} style={{ color: i === 2 ? C.orange : C.ink }}>
              {word}
            </Rise>
          ))}
        </div>
        <Rise at={100} style={{ display: "flex", alignItems: "center", gap: 22, fontSize: 48, fontWeight: 500, color: C.inkSoft }}>
          in
          {[1, 2, 3].map((n) => (
            <div key={n} style={{ width: 76, height: 76, borderRadius: "50%", background: C.orange, color: "#fff", fontWeight: 700, fontSize: 44, display: "flex", alignItems: "center", justifyContent: "center", scale: prog(frame, 104 + n * 7, 14, POP) }}>
              {n}
            </div>
          ))}
          steps, all by text
        </Rise>
      </AbsoluteFill>
    </Stage>
  );
};

/* --------------------------------------------------------- 04 pipeline */

const NODES = [
  { x: 300, title: "Your text", sub: "iMessage or SMS" },
  { x: 740, title: "Photon Spectrum", sub: "carries the message" },
  { x: 1180, title: "Gemini", sub: "chooses a tool to call" },
  { x: 1620, title: "SerpAPI", sub: "searches the stores" },
];
const NODE_Y = 440;
const HOPS = [44, 92, 176]; // the frame each hop to the next node starts
const CALL = 'search_products({ query: "snacks", max_price: 15 })';

export const Pipeline: React.FC = () => {
  const frame = useCurrentFrame();
  const back = prog(frame, 214, 30, IN_OUT);
  const slide = prog(frame, 246, 46, IN_OUT);
  return (
    <Stage>
      <Title>What happens to your text</Title>
      <Svg>
        {NODES.slice(0, 3).map((node, i) => (
          <Wire key={i} d={`M${node.x + 198} ${NODE_Y} L${NODES[i + 1].x - 198} ${NODE_Y}`} length={50} p={prog(frame, 14 + i * 8, 14)} />
        ))}
        <Wire d={`M1730 ${NODE_Y + 104} L1730 846 L300 846 L300 ${NODE_Y + 224}`} length={2200} p={back} color={C.orange} width={5} />
        {back >= 1 ? <path d={`M286 ${NODE_Y + 244} L300 ${NODE_Y + 220} L314 ${NODE_Y + 244}`} fill="none" stroke={C.orange} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" /> : null}
      </Svg>
      {NODES.map((node, i) => {
        const arrive = i === 0 ? 30 : HOPS[i - 1] + 24;
        return (
          <Card key={node.title} x={node.x} y={NODE_Y} w={384} h={196} at={6 + i * 8} hot={during(frame, arrive, arrive + 26, 7)}>
            <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1.6, whiteSpace: "nowrap" }}>{node.title}</div>
            <div style={{ fontSize: 29, fontWeight: 500, color: C.inkSoft, whiteSpace: "nowrap" }}>{node.sub}</div>
          </Card>
        );
      })}
      {HOPS.map((start, i) => (
        <Runner key={i} from={[NODES[i].x + 192, NODE_Y]} to={[NODES[i + 1].x - 192, NODE_Y]} start={start} size={22} />
      ))}
      {/* what you sent */}
      <Rise at={26} style={{ position: "absolute", left: 300 - 190, top: NODE_Y + 128, width: 380, display: "flex", justifyContent: "center" }}>
        <div style={{ background: C.blue, color: "#fff", fontFamily: SF, fontSize: 30, borderRadius: 26, padding: "12px 22px", letterSpacing: -0.4 }}>find snacks under $15</div>
      </Rise>
      {/* the tool call the model writes */}
      <Rise at={122} style={{ position: "absolute", left: 1180 - 470, top: NODE_Y + 128, width: 940, display: "flex", justifyContent: "center" }}>
        <div style={{ background: C.ink, color: "#F2F0EA", fontFamily: MONO, fontSize: 29, borderRadius: 18, padding: "16px 24px", whiteSpace: "pre" }}>
          <Typed text={CALL} start={126} frames={40} />
          <span style={{ opacity: frame < 170 && Math.floor(frame / 8) % 2 ? 1 : 0 }}>▍</span>
        </div>
      </Rise>
      {/* what comes back */}
      {frame >= 240 ? (
        <div style={{ position: "absolute", top: 846 - 37, left: lerp(1150, 430, slide), display: "flex", gap: 10, opacity: prog(frame, 240, 8) }}>
          {["Walmart · $8.98", "Walmart · $12.98", "Amazon · $13.49"].map((label) => (
            <div key={label} style={{ background: C.bubbleGray, fontFamily: SF, fontWeight: 600, fontSize: 32, borderRadius: 26, padding: "14px 24px", whiteSpace: "nowrap", boxShadow: "0 0 0 6px #F2F0EA" }}>
              {label}
            </div>
          ))}
        </div>
      ) : null}
      <Rise at={290} style={{ position: "absolute", right: 130, top: 906, fontSize: 40, fontWeight: 600, color: C.inkSoft }}>
        Three options, back in your texts.
      </Rise>
    </Stage>
  );
};

/* ------------------------------------------------------------ 06 split */

export const SplitCard: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <Stage>
      <Title sub="Your items, plus your share of the tax.">Everyone gets their own number</Title>
      {/* the cart */}
      <Card x={520} y={648} w={760} h={500} at={10} style={{ alignItems: "stretch", justifyContent: "center", padding: "0 46px", gap: 0 }}>
        <div style={{ fontSize: 34, fontWeight: 600, color: C.inkSoft, marginBottom: 14 }}>movie night · cart</div>
        {PEOPLE.map((person, i) => (
          <Rise key={person.name} at={24 + i * 14} by={16} style={{ display: "flex", alignItems: "center", gap: 20, padding: "17px 0", borderBottom: "2px solid #EFEDE6" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: person.tint, color: "#fff", fontSize: 26, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{person.name[0]}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 34, fontWeight: 600, letterSpacing: -0.8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{person.item}</div>
              <div style={{ fontSize: 26, color: C.inkSoft }}>
                {person.store} · added by {person.name}
              </div>
            </div>
            <div style={{ fontSize: 38, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{usd(person.price)}</div>
          </Rise>
        ))}
        <Rise at={74} by={12} style={{ display: "flex", justifyContent: "space-between", fontSize: 30, color: C.inkSoft, paddingTop: 22 }}>
          <span>subtotal {usd(SUBTOTAL)} · tax {usd(TAX)}</span>
          <span style={{ color: C.ink, fontWeight: 700, fontSize: 40 }}>{usd(TOTAL)}</span>
        </Rise>
      </Card>
      {/* what each person is sent */}
      <Svg>
        {PEOPLE.map((person, i) => (
          <Wire key={person.name} d={`M900 ${556 + i * 96} C1000 ${556 + i * 96} 960 ${452 + i * 196} 1060 ${452 + i * 196}`} length={260} p={prog(frame, 104 + i * 24, 18)} color={person.tint} width={5} />
        ))}
      </Svg>
      {PEOPLE.map((person, i) => {
        const at = 116 + i * 24;
        const shown = lerp(person.price, person.owes, prog(frame, at + 4, 22));
        return (
          <Rise key={person.name} at={at} by={20} style={{ position: "absolute", left: 1070, top: 452 + i * 196 - 78, width: 720 }}>
            <div style={{ background: C.bubbleGray, color: "#000", fontFamily: SF, fontSize: 34, lineHeight: 1.28, letterSpacing: -0.5, borderRadius: 34, padding: "20px 30px" }}>
              {youOwe(person.name, shown).split(" — ")[0]}
              <span style={{ color: C.inkSoft }}> — 👍 this to pay from your Capital One account</span>
            </div>
          </Rise>
        );
      })}
    </Stage>
  );
};

/* ------------------------------------------------------- 08 money flow */

const PAYS = [36, 86, 136]; // the frame each person's share leaves their account
const POOL: [number, number] = [960, 580];
const ACCOUNT_Y = [410, 580, 750];
const STORE_Y = [485, 675];

export const MoneyFlow: React.FC = () => {
  const frame = useCurrentFrame();
  const inPool = PEOPLE.reduce((sum, person, i) => sum + person.owes * prog(frame, PAYS[i] + 22, 14), 0);
  const paidIn = PAYS.filter((start) => frame >= start + 24).length;
  const full = prog(frame, PAYS[2] + 28, 14, POP);
  const out = prog(frame, 196, 26, IN_OUT);
  const R = 150;
  const ring = 2 * Math.PI * R;
  return (
    <Stage>
      <Title sub="Collected first. The store is paid only when everyone is in.">Nobody fronts the bill</Title>
      <Svg>
        {ACCOUNT_Y.map((y, i) => (
          <Wire key={i} d={`M590 ${y} C720 ${y} 690 ${POOL[1]} ${POOL[0] - R - 14} ${POOL[1]}`} length={360} p={prog(frame, 16 + i * 6, 16)} />
        ))}
        {STORE_Y.map((y, i) => (
          <Wire key={i} d={`M${POOL[0] + R + 14} ${POOL[1]} C1280 ${POOL[1]} 1260 ${y} 1410 ${y}`} length={420} p={prog(frame, 28 + i * 6, 16)} color={out > 0 ? C.orange : undefined} dashed={out <= 0} />
        ))}
        <circle cx={POOL[0]} cy={POOL[1]} r={R} fill="#fff" stroke="rgba(22,24,29,0.08)" strokeWidth={22} />
        <circle cx={POOL[0]} cy={POOL[1]} r={R} fill="none" stroke={C.orange} strokeWidth={22} strokeLinecap="round" strokeDasharray={ring} strokeDashoffset={ring * (1 - inPool / TOTAL)} transform={`rotate(-90 ${POOL[0]} ${POOL[1]})`} />
      </Svg>
      <div style={{ position: "absolute", left: POOL[0] - R, top: POOL[1] - R, width: R * 2, height: R * 2, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", scale: 1 + 0.06 * during(frame, PAYS[2] + 26, PAYS[2] + 44, 8) }}>
        <div style={{ fontSize: 26, fontWeight: 600, color: C.inkSoft }}>group pool</div>
        <div style={{ fontSize: 62, fontWeight: 700, letterSpacing: -2, fontVariantNumeric: "tabular-nums" }}>{usd(inPool * (1 - out))}</div>
        <div style={{ fontSize: 28, fontWeight: 600, color: full > 0 ? C.orange : C.inkSoft }}>{out >= 1 ? "paid out" : full > 0 ? "everyone's in 🎉" : `${paidIn} of 3 in`}</div>
      </div>
      {PEOPLE.map((person, i) => {
        const paid = frame >= PAYS[i] + 24;
        return (
          <React.Fragment key={person.name}>
            <Card x={356} y={ACCOUNT_Y[i]} w={468} h={136} at={8 + i * 6} hot={during(frame, PAYS[i] - 4, PAYS[i] + 16, 6)} style={{ flexDirection: "row", justifyContent: "flex-start", padding: "0 26px", gap: 18 }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: person.tint, color: "#fff", fontSize: 32, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{person.name[0]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: -1 }}>{person.name}</div>
                <div style={{ fontSize: 25, color: C.inkSoft, whiteSpace: "nowrap" }}>Capital One · Nessie</div>
              </div>
              <div style={{ fontSize: 30, fontWeight: 700, color: paid ? C.orange : C.inkSoft, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{paid ? `−${usd(person.owes)}` : "👍"}</div>
            </Card>
            <Runner from={[590, ACCOUNT_Y[i]]} to={[POOL[0] - R, POOL[1]]} start={PAYS[i]} />
          </React.Fragment>
        );
      })}
      {TO_STORES.map((store, i) => (
        <React.Fragment key={store.store}>
          <Card x={1590} y={STORE_Y[i]} w={360} h={150} at={20 + i * 6} hot={during(frame, 218, 244, 7)}>
            <div style={{ fontSize: 42, fontWeight: 700, letterSpacing: -1.2, opacity: lerp(0.35, 1, out) }}>{store.store}</div>
            <div style={{ fontSize: 30, fontWeight: 600, color: out >= 1 ? C.orange : C.inkSoft, fontVariantNumeric: "tabular-nums", opacity: lerp(0.5, 1, out) }}>{out >= 1 ? `paid ${usd(store.amount)} ✓` : "waiting for everyone"}</div>
          </Card>
          <Runner from={[POOL[0] + R, POOL[1]]} to={[1410, STORE_Y[i]]} start={196} frames={26} />
        </React.Fragment>
      ))}
      <Rise at={252} style={{ position: "absolute", left: 130, right: 130, bottom: 34, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, fontSize: 34, fontWeight: 600, color: C.inkSoft, whiteSpace: "nowrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontFamily: MONO, fontSize: 28, background: C.ink, color: "#F2F0EA", borderRadius: 14, padding: "8px 16px" }}>"pay"</span>
          is matched by a fixed pattern, and the amount comes from the split.
        </div>
        <div style={{ color: C.ink, fontWeight: 700, fontSize: 38 }}>The model never types a number.</div>
      </Rise>
    </Stage>
  );
};

/* ---------------------------------------------------------- 11 outro */

export const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const logo = prog(frame, 4, 20, POP);
  return (
    <Stage>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
          <div style={{ scale: logo }}>
            <Logo size={190} />
          </div>
          <Rise at={12} style={{ fontSize: 160, fontWeight: 700, letterSpacing: -7 }}>
            GroupCart
          </Rise>
        </div>
        <Headline at={34} size={76} style={{ textAlign: "center" }}>
          Shop, split and check out,
          <br />
          all in <span style={{ color: C.orange }}>your group chat.</span>
        </Headline>
        <Sub at={74} size={38} style={{ textAlign: "center" }}>
          groupcart-beta.vercel.app
          <br />
          <span style={{ fontSize: 30 }}>Photon Spectrum · Gemini · Capital One Nessie · HackNC 2026</span>
        </Sub>
      </AbsoluteFill>
    </Stage>
  );
};
