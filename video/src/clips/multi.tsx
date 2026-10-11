import React from "react";
import { useCurrentFrame } from "remotion";
import { Chat, Row } from "../Chat";
import { Logo, LogoAvatar } from "../Logo";
import { Headline, Rise, Stage, Sub } from "../Stage";
import { C, H, IN_OUT, MONO, POP, SF, W, during, lerp, prog } from "../theme";
import { ASK, GROUP, OFFERS } from "./story";

const Tag: React.FC<{ x: number; y: number; at: number; children: React.ReactNode; tint?: string }> = ({ x, y, at, children, tint = C.ink }) => (
  <Rise at={at} by={10} style={{ position: "absolute", left: x - 200, top: y - 22, width: 400, display: "flex", justifyContent: "center" }}>
    <div style={{ background: tint, color: "#fff", fontSize: 26, fontWeight: 600, borderRadius: 22, padding: "7px 20px", letterSpacing: -0.3, boxShadow: `0 0 0 6px ${C.paper}` }}>{children}</div>
  </Rise>
);

/** A dot that runs through a list of points, one leg after another. */
const Route: React.FC<{ points: [number, number][]; start: number; frames: number; color?: string }> = ({ points, start, frames, color = C.orange }) => {
  const frame = useCurrentFrame();
  if (frame < start || frame > start + frames) return null;
  const lengths = points.slice(1).map((pt, i) => Math.hypot(pt[0] - points[i][0], pt[1] - points[i][1]));
  let travelled = prog(frame, start, frames, IN_OUT) * lengths.reduce((a, b) => a + b, 0);
  let leg = 0;
  while (leg < lengths.length - 1 && travelled > lengths[leg]) travelled -= lengths[leg++];
  const t = lengths[leg] ? travelled / lengths[leg] : 0;
  const x = lerp(points[leg][0], points[leg + 1][0], t);
  const y = lerp(points[leg][1], points[leg + 1][1], t);
  return <div style={{ position: "absolute", left: x - 12, top: y - 12, width: 24, height: 24, borderRadius: "50%", background: color, boxShadow: `0 0 0 8px ${color}33, 0 0 24px ${color}` }} />;
};

/* ------------------------------------------------- 09 groups without a group chat */

const SEATS = [
  { name: "William", x: 400, tint: "#0A7CFF" },
  { name: "Justin", x: 960, tint: "#34C759" },
  { name: "Krish", x: 1520, tint: "#AF52DE" },
];
const HUB_Y = 204;
const PHONE_TOP = 334;
const SMALL = { width: 366, height: 728 };
const RELAY_1 = 72; // William's request leaves his phone
const RELAY_2 = 228; // Krish's thumbs up leaves his

export const GroupsRelay: React.FC = () => {
  const frame = useCurrentFrame();
  const offer: Row = { id: "offer", from: "them", typing: 22, at: 158, text: OFFERS.cola, offer: true };
  const done: Row = { id: "done", from: "them", at: RELAY_2 + 46, text: `added for Krish to ${GROUP} ✓ cart is $35.45 (3 items)` };
  const heard: Row = { id: "heard", from: "them", at: RELAY_1 + 44, text: `William → ${GROUP}: find snacks under $15` };
  const threads: Row[][] = [
    [{ id: "ask", from: "me", at: 70, text: ASK }, offer, done],
    [heard, offer, done],
    [heard, offer, done],
  ];
  const up = (x: number): [number, number][] => [[x, PHONE_TOP], [x, HUB_Y]];
  const fan = (from: number, to: number): [number, number][] => [[from, HUB_Y], [to, HUB_Y], [to, PHONE_TOP]];
  const hot = Math.max(during(frame, RELAY_1 + 8, RELAY_1 + 34, 6), during(frame, RELAY_2 + 8, RELAY_2 + 34, 6));
  return (
    <Stage>
      <div style={{ position: "absolute", left: 110, right: 110, top: 34, display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <Headline at={2} size={76} style={{ whiteSpace: "nowrap" }}>
          No group chat needed
        </Headline>
        <Sub at={14} size={36} style={{ whiteSpace: "nowrap" }}>
          Everyone texts GroupCart one-to-one. It relays.
        </Sub>
      </div>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        {SEATS.map((seat, i) => (
          <line key={seat.name} x1={seat.x} y1={HUB_Y} x2={seat.x} y2={PHONE_TOP + 6} stroke="rgba(22,24,29,0.22)" strokeWidth={5} strokeLinecap="round" strokeDasharray={140} strokeDashoffset={140 * (1 - prog(frame, 20 + i * 6, 14))} />
        ))}
      </svg>
      {/* the hub: where the group and its one cart actually live */}
      <div style={{ position: "absolute", left: 300, top: HUB_Y - 48, width: 1320, height: 96, borderRadius: 48, background: "#fff", boxShadow: `0 16px 40px rgba(22,24,29,0.10), 0 0 0 ${3 + hot * 4}px ${hot > 0 ? `rgba(242,92,31,${hot})` : "rgba(22,24,29,0.06)"}`, display: "flex", alignItems: "center", justifyContent: "center", gap: 22, scale: prog(frame, 8, 16, POP), fontSize: 36, fontWeight: 600, letterSpacing: -0.6 }}>
        <Logo size={62} />
        <span style={{ fontWeight: 700 }}>GroupCart</span>
        <span style={{ color: C.inkSoft }}>holds the group</span>
        <span style={{ background: C.orangeSoft, color: C.orange, borderRadius: 18, padding: "5px 18px", fontWeight: 700 }}>“{GROUP}”</span>
        <span style={{ color: C.inkSoft }}>and its one shared cart</span>
      </div>
      {SEATS.map((seat, i) => (
        <React.Fragment key={seat.name}>
          <Rise at={6 + i * 6} by={50} style={{ position: "absolute", left: seat.x - SMALL.width / 2, top: PHONE_TOP }}>
            <Chat
              {...SMALL}
              name="GroupCart"
              avatar={<LogoAvatar size={SMALL.width * 0.105} />}
              fontScale={1.2}
              rows={threads[i]}
              composes={i === 0 ? [{ text: ASK, start: 26, send: 70 }] : []}
              tapbacks={i === 2 ? [{ target: "offer", picker: 26, at: RELAY_2 - 2 }] : []}
            />
          </Rise>
          <Tag x={seat.x} y={(HUB_Y + 48 + PHONE_TOP) / 2 + 2} at={22 + i * 6} tint={seat.tint}>
            {seat.name}
          </Tag>
        </React.Fragment>
      ))}
      {/* William's request goes up to the hub and out to the other two */}
      <Route points={up(SEATS[0].x)} start={RELAY_1} frames={12} />
      <Route points={fan(SEATS[0].x, SEATS[1].x)} start={RELAY_1 + 12} frames={28} />
      <Route points={fan(SEATS[0].x, SEATS[2].x)} start={RELAY_1 + 12} frames={28} />
      {/* Krish's thumbs up does the same in the other direction */}
      <Route points={up(SEATS[2].x)} start={RELAY_2} frames={12} />
      <Route points={fan(SEATS[2].x, SEATS[1].x)} start={RELAY_2 + 12} frames={28} />
      <Route points={fan(SEATS[2].x, SEATS[0].x)} start={RELAY_2 + 12} frames={28} />
    </Stage>
  );
};

/* --------------------------------------------------------------- 10 android */

const PH = { width: 396, height: 752 };
const LEFT = 372;
const RIGHT = 1548;
const TOP = 300;

export const AndroidToo: React.FC = () => {
  const frame = useCurrentFrame();
  const chip: React.CSSProperties = { position: "absolute", left: 590, width: 740, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, whiteSpace: "nowrap" };
  const label: React.CSSProperties = { fontSize: 27, fontWeight: 600, color: C.inkSoft };
  const merged = prog(frame, 178, 18);
  const hot = during(frame, 196, 224, 7);
  return (
    <Stage>
      <div style={{ position: "absolute", left: 130, top: 64, right: 130, display: "flex", flexDirection: "column", gap: 12 }}>
        <Headline at={2} size={84}>
          Android works too
        </Headline>
        <Sub at={14} size={38}>
          An Android 👍 arrives as plain text. GroupCart reads both the same way.
        </Sub>
      </div>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <path d={`M${LEFT + 214} 470 L648 470`} fill="none" stroke={C.blue} strokeWidth={5} strokeLinecap="round" strokeDasharray={90} strokeDashoffset={90 * (1 - prog(frame, 64, 12))} />
        <path d={`M${RIGHT - 214} 640 L1272 640`} fill="none" stroke={C.gBlue} strokeWidth={5} strokeLinecap="round" strokeDasharray={90} strokeDashoffset={90 * (1 - prog(frame, 128, 12))} />
        <path d="M960 506 L960 562 M960 716 L960 784" fill="none" stroke="rgba(22,24,29,0.24)" strokeWidth={5} strokeLinecap="round" strokeDasharray="2 14" opacity={merged} />
      </svg>
      <Rise at={4} by={50} style={{ position: "absolute", left: LEFT - PH.width / 2, top: TOP }}>
        <Chat
          {...PH}
          name="GroupCart"
          avatar={<LogoAvatar size={PH.width * 0.105} />}
          fontScale={1.12}
          tapbacks={[{ target: "o", picker: 28, at: 60 }]}
          rows={[
            { id: "o", from: "them", at: -40, text: OFFERS.popcorn, offer: true },
            { id: "ok", from: "them", typing: 14, at: 228, text: `added for William to ${GROUP} ✓ cart is $22.47 (2 items)` },
          ]}
        />
      </Rise>
      <Rise at={10} by={50} style={{ position: "absolute", left: RIGHT - PH.width / 2, top: TOP }}>
        <Chat
          {...PH}
          os="android"
          name="GroupCart"
          avatar={<LogoAvatar size={PH.width * 0.095} />}
          fontScale={1.12}
          tapbacks={[{ target: "o", at: 122 }]}
          rows={[
            { id: "o", from: "them", at: -40, text: OFFERS.cola, offer: true },
            { id: "ok", from: "them", typing: 14, at: 240, text: `added for Krish to ${GROUP} ✓ cart is $35.45 (3 items)` },
          ]}
        />
      </Rise>
      <Tag x={LEFT} y={TOP - 4} at={16} tint={C.blue}>
        William · iPhone
      </Tag>
      <Tag x={RIGHT} y={TOP - 4} at={22} tint={C.gBlue}>
        Krish · Android
      </Tag>
      {/* what reaches GroupCart from each phone */}
      <Rise at={74} by={14} style={{ ...chip, top: 398 }}>
        <div style={label}>iMessage sends a reaction</div>
        <div style={{ fontFamily: MONO, fontSize: 28, background: C.ink, color: "#F2F0EA", borderRadius: 16, padding: "14px 22px" }}>reaction 👍 on message 8F2A</div>
      </Rise>
      <Rise at={138} by={14} style={{ ...chip, top: 566 }}>
        <div style={label}>Android sends a text message</div>
        <div style={{ fontFamily: SF, fontSize: 30, background: C.gSurface, color: C.gText, borderRadius: 24, padding: "14px 24px", whiteSpace: "nowrap" }}>Liked “Walmart · $12.98 · 4.5★ Cola…”</div>
      </Rise>
      <Rise at={190} by={14} style={{ ...chip, top: 792 }}>
        <div style={{ background: "#fff", borderRadius: 30, padding: "22px 34px", display: "flex", alignItems: "center", gap: 18, fontSize: 38, fontWeight: 700, letterSpacing: -0.8, boxShadow: `0 16px 40px rgba(22,24,29,0.10), 0 0 0 ${3 + hot * 4}px ${hot > 0 ? `rgba(242,92,31,${hot})` : "rgba(22,24,29,0.06)"}`, scale: 1 + 0.04 * hot }}>
          <Logo size={54} />
          same match
          <span style={{ color: C.orange }}>→ added to cart ✓</span>
        </div>
      </Rise>
      <Rise at={258} by={12} style={{ ...chip, top: 930, whiteSpace: "normal" }}>
        <div style={{ ...label, textAlign: "center", width: 600 }}>SMS has no typing bubble, so GroupCart skips it and still replies.</div>
      </Rise>
    </Stage>
  );
};
