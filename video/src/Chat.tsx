import React from "react";
import { useCurrentFrame } from "remotion";
import { C, POP, ROBOTO, SF, during, lerp, prog } from "./theme";

/* A phone showing a text conversation that plays out over time.

   Everything is driven by the frame: a row is given the frame it appears on,
   and grows into place so the rows above slide up, the way Messages does it.
   Nothing is measured; the list is a bottom-anchored column and each row
   animates its own height through `grid-template-rows`. */

export type Row =
  | {
      kind?: "msg";
      id: string;
      from: "me" | "them";
      at: number; // the frame the bubble appears on
      text: string;
      typing?: number; // frames of "..." shown before an incoming bubble
      sender?: string; // group threads: whose bubble this is
      tint?: string; // group threads: that person's colour
      delivered?: boolean;
      offer?: boolean; // three lines: retailer and price, title, link
    }
  | { kind: "note"; id: string; at: number; text: string };

export type Tapback = {
  target: string; // row id
  at: number; // the frame the reaction lands
  emoji?: string;
  by?: "me" | "them";
  picker?: number; // frames the reaction picker is open before it lands
};

export type Compose = { text: string; start: number; send: number };

export type ChatProps = {
  width: number;
  height: number;
  os?: "ios" | "android";
  service?: "imessage" | "sms";
  name: string;
  avatar?: React.ReactNode;
  group?: boolean;
  rows: Row[];
  tapbacks?: Tapback[];
  composes?: Compose[];
  fontScale?: number;
};

const PICKER = ["❤️", "👍", "👎", "😂", "‼️", "❓"];

export const Chat: React.FC<ChatProps> = (props) => {
  const frame = useCurrentFrame();
  const { width, height, os = "ios", service = "imessage", rows, tapbacks = [], composes = [], fontScale = 1 } = props;
  const u = width / 393; // one iPhone point
  const ios = os === "ios";
  const mine = ios ? (service === "sms" ? C.green : C.blue) : C.gBlue;
  const theirs = ios ? C.bubbleGray : C.gSurface;
  const font = ios ? SF : ROBOTO;

  const shown = rows.filter((r) => frame >= r.at - (r.kind !== "note" && r.typing ? r.typing : 0));
  const visible = rows.filter((r) => frame >= r.at);
  const compose = composes.find((c) => frame >= c.start && frame < c.send);
  const typed = compose ? compose.text.slice(0, Math.floor(((frame - compose.start) / Math.max(1, compose.send - 10 - compose.start)) * compose.text.length)) : "";
  const justSent = composes.some((c) => frame >= c.send && frame < c.send + 6);
  const dim = Math.max(0, ...tapbacks.filter((t) => t.picker).map((t) => during(frame, t.at - t.picker!, t.at + 5, 6)));
  const lastMine = [...visible].reverse().find((r) => r.kind !== "note" && r.from === "me");

  const list = shown.map((row, index) => {
    if (row.kind === "note") {
      const p = prog(frame, row.at, 9);
      return (
        <Grow key={row.id} p={p}>
          <div style={{ textAlign: "center", color: C.textGray, fontSize: 11.5 * u * fontScale, fontWeight: 500, padding: `${10 * u}px 0 ${4 * u}px`, opacity: p }}>{row.text}</div>
        </Grow>
      );
    }
    const me = row.from === "me";
    const before = shown[index - 1];
    const after = visible[visible.indexOf(row) + 1];
    const sameAsBefore = before && before.kind !== "note" && before.from === row.from && before.sender === row.sender;
    const sameAsAfter = after && after.kind !== "note" && after.from === row.from && after.sender === row.sender;
    const reaction = tapbacks.find((t) => t.target === row.id);
    const landed = reaction ? prog(frame, reaction.at, 9, POP) : 0;
    const pickerOpen = reaction?.picker ? during(frame, reaction.at - reaction.picker, reaction.at + 7, 6) : 0;
    const typingP = row.typing ? Math.min(prog(frame, row.at - row.typing, 7), 1 - prog(frame, row.at, 5)) : 0;
    const p = prog(frame, row.at, 9);
    const arrive = prog(frame, row.at, 11, POP);
    const size = 17 * u * fontScale;
    const indent = props.group && !me ? 34 * u : 0;
    const color = me ? "#fff" : ios ? "#000" : C.gText;
    const lines = row.text.split("\n");

    return (
      <React.Fragment key={row.id}>
        {row.typing && typingP > 0 ? (
          <Grow p={typingP}>
            <div style={{ paddingTop: 8 * u, paddingLeft: indent, display: "flex" }}>
              <div style={{ background: theirs, borderRadius: 19 * u, padding: `${12 * u}px ${14 * u}px`, display: "flex", gap: 5 * u, opacity: typingP }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{ width: 9 * u, height: 9 * u, borderRadius: "50%", background: "#8E8E93", opacity: 0.35 + 0.65 * Math.max(0, Math.sin((frame / 30) * Math.PI * 2 * 1.1 - i * 0.9)) }} />
                ))}
              </div>
            </div>
          </Grow>
        ) : null}
        {frame >= row.at ? (
          <Grow p={p} front={pickerOpen > 0 || landed > 0}>
            {props.group && !me && row.sender && !sameAsBefore ? (
              <div style={{ fontSize: 11.5 * u * fontScale, color: C.textGray, padding: `${9 * u}px 0 ${1 * u}px ${indent + 13 * u}px` }}>{row.sender}</div>
            ) : null}
            <div style={{ paddingTop: (sameAsBefore ? 2.5 : 9) * u + (ios ? landed * 15 * u : 0), paddingBottom: ios ? 0 : landed * 13 * u, display: "flex", justifyContent: me ? "flex-end" : "flex-start", alignItems: "flex-end", gap: 6 * u }}>
              {props.group && !me ? (
                <div style={{ width: 28 * u, height: 28 * u, flex: "none", borderRadius: "50%", background: row.tint ?? "#A2A2A7", color: "#fff", fontSize: 13 * u, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", visibility: sameAsAfter ? "hidden" : "visible" }}>
                  {(row.sender ?? "?")[0]}
                </div>
              ) : null}
              <div style={{ position: "relative", maxWidth: "77%", opacity: prog(frame, row.at, 5), scale: lerp(0.82, 1, arrive) * (1 + 0.045 * pickerOpen), transformOrigin: me ? "100% 100%" : "0% 100%" }}>
                {ios && !sameAsAfter ? <Tail color={me ? mine : theirs} right={me} u={u} /> : null}
                <div
                  style={{
                    position: "relative",
                    background: me ? mine : theirs,
                    color,
                    borderRadius: ios ? 19 * u : `${20 * u}px ${20 * u}px ${(me ? 6 : 20) * u}px ${(me ? 20 : 6) * u}px`,
                    padding: `${7.5 * u}px ${13 * u}px ${8.5 * u}px`,
                    fontSize: size,
                    lineHeight: 1.29,
                    letterSpacing: -0.2 * u,
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                  }}
                >
                  {row.offer
                    ? lines.map((line, i) => (
                        <div key={i} style={i === 0 ? { fontWeight: 600 } : i === lines.length - 1 ? { color: me ? "#fff" : mine, textDecoration: "underline", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } : undefined}>
                          {line}
                        </div>
                      ))
                    : row.text}
                </div>
                {reaction && landed > 0 ? <Badge ios={ios} emoji={reaction.emoji ?? "👍"} mine={(reaction.by ?? "me") === "me"} onRight={!me} u={u} p={landed} /> : null}
                {pickerOpen > 0 ? (
                  <div
                    style={{
                      position: "absolute",
                      bottom: `calc(100% + ${10 * u}px)`,
                      [me ? "right" : "left"]: 0,
                      display: "flex",
                      gap: 4 * u,
                      padding: `${6 * u}px ${9 * u}px`,
                      background: "#fff",
                      borderRadius: 26 * u,
                      boxShadow: `0 ${6 * u}px ${24 * u}px rgba(0,0,0,0.18)`,
                      opacity: pickerOpen,
                      scale: lerp(0.6, 1, prog(frame, reaction!.at - reaction!.picker!, 9, POP)),
                      transformOrigin: me ? "100% 100%" : "0% 100%",
                    }}
                  >
                    {PICKER.map((emoji) => {
                      const chosen = emoji === (reaction!.emoji ?? "👍") ? prog(frame, reaction!.at - 9, 8, POP) : 0;
                      return (
                        <div key={emoji} style={{ width: 36 * u, height: 36 * u, borderRadius: "50%", background: chosen > 0 ? `rgba(10,124,255,${0.95 * chosen})` : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 21 * u, scale: 1 + 0.22 * chosen }}>
                          {emoji}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>
            {me && row.delivered && row === lastMine ? (
              <div style={{ textAlign: "right", fontSize: 11 * u * fontScale, color: C.textGray, fontWeight: 500, padding: `${3 * u}px ${4 * u}px 0 0`, opacity: prog(frame, row.at + 12, 8) }}>Delivered</div>
            ) : null}
          </Grow>
        ) : null}
      </React.Fragment>
    );
  });

  const thread = (
    <div style={{ flex: 1, minHeight: 0, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, padding: `0 ${(ios ? 14 : 12) * u}px ${8 * u}px`, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        {dim > 0 ? <div style={{ position: "absolute", inset: 0, zIndex: 4, background: `rgba(255,255,255,${0.62 * dim})`, backdropFilter: `blur(${5 * dim * u}px)` }} /> : null}
        {list}
      </div>
    </div>
  );

  return ios ? (
    <IPhone u={u} width={width} height={height} name={props.name} avatar={props.avatar} group={props.group}>
      {thread}
      <IosInput u={u} text={typed} placeholder={service === "sms" ? "Text Message • SMS" : "iMessage"} color={mine} pressed={justSent} font={font} />
    </IPhone>
  ) : (
    <Android u={u} width={width} height={height} name={props.name} avatar={props.avatar}>
      {thread}
      <AndroidInput u={u} text={typed} />
    </Android>
  );
};

/** A row that grows from nothing to its natural height, keeping its content pinned to the bottom. */
const Grow: React.FC<{ p: number; front?: boolean; children: React.ReactNode }> = ({ p, front, children }) => (
  <div style={{ display: "grid", gridTemplateRows: `${p}fr`, flex: "none", position: "relative", zIndex: front ? 5 : 1 }}>
    <div style={{ minHeight: 0, overflow: p < 1 ? "hidden" : "visible", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>{children}</div>
  </div>
);

const Tail: React.FC<{ color: string; right: boolean; u: number }> = ({ color, right, u }) => (
  <svg width={16 * u} height={20 * u} viewBox="0 0 16 20" style={{ position: "absolute", bottom: 0, [right ? "right" : "left"]: -5.5 * u, scale: right ? "1 1" : "-1 1" }}>
    <path d="M4 0 L4 14 C4 17 9 20 16 20 C12.5 18 10.5 13 10.5 7 L10.5 0 Z" fill={color} />
  </svg>
);

const Badge: React.FC<{ ios: boolean; emoji: string; mine: boolean; onRight: boolean; u: number; p: number }> = ({ ios, emoji, mine, onRight, u, p }) =>
  ios ? (
    <div style={{ position: "absolute", top: -17 * u, [onRight ? "right" : "left"]: -15 * u, scale: p, transformOrigin: onRight ? "0% 100%" : "100% 100%", zIndex: 2 }}>
      <div style={{ position: "relative", width: 36 * u, height: 32 * u, borderRadius: 16 * u, background: mine ? C.blue : C.bubbleGray, boxShadow: "0 0 0 2px #fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 * u }}>
        {emoji}
        <div style={{ position: "absolute", bottom: -2 * u, [onRight ? "left" : "right"]: 1 * u, width: 9 * u, height: 9 * u, borderRadius: "50%", background: mine ? C.blue : C.bubbleGray, boxShadow: "0 0 0 1.5px #fff", zIndex: -1 }} />
        <div style={{ position: "absolute", bottom: -7 * u, [onRight ? "left" : "right"]: -4 * u, width: 4.5 * u, height: 4.5 * u, borderRadius: "50%", background: mine ? C.blue : C.bubbleGray, boxShadow: "0 0 0 1.5px #fff" }} />
      </div>
    </div>
  ) : (
    <div style={{ position: "absolute", bottom: -13 * u, right: 10 * u, scale: p, height: 26 * u, padding: `0 ${7 * u}px`, borderRadius: 13 * u, background: "#fff", boxShadow: `0 ${1 * u}px ${4 * u}px rgba(0,0,0,0.28)`, display: "flex", alignItems: "center", fontSize: 14 * u, zIndex: 2 }}>{emoji}</div>
  );

/* ------------------------------------------------------------------ iPhone */

const IPhone: React.FC<{ u: number; width: number; height: number; name: string; avatar?: React.ReactNode; group?: boolean; children: React.ReactNode }> = ({ u, width, height, name, avatar, group, children }) => (
  <div style={{ width, height, borderRadius: 58 * u, background: "#0B0B0D", padding: 9 * u, boxShadow: `0 ${30 * u}px ${70 * u}px rgba(22,24,29,0.28), 0 0 0 ${1.5 * u}px #2A2A2E inset`, flex: "none" }}>
    <div style={{ width: "100%", height: "100%", borderRadius: 49 * u, background: "#fff", overflow: "hidden", display: "flex", flexDirection: "column", position: "relative", fontFamily: SF }}>
      <div style={{ position: "absolute", top: 11 * u, left: "50%", translate: "-50% 0", width: 112 * u, height: 32 * u, borderRadius: 16 * u, background: "#000", zIndex: 10 }} />
      {/* status bar */}
      <div style={{ height: 52 * u, flex: "none", display: "flex", alignItems: "center", justifyContent: "space-between", padding: `${10 * u}px ${30 * u}px 0 ${36 * u}px`, background: "#F9F9F9" }}>
        <div style={{ fontSize: 16 * u, fontWeight: 600, letterSpacing: -0.3 * u }}>9:41</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 * u }}>
          <svg width={18 * u} height={12 * u} viewBox="0 0 18 12">
            {[0, 1, 2, 3].map((i) => (
              <rect key={i} x={i * 5} y={9 - i * 3} width={3.2} height={3 + i * 3} rx={0.9} fill="#000" />
            ))}
          </svg>
          <svg width={16 * u} height={12 * u} viewBox="0 0 16 12">
            <path d="M8 2.2c2.6 0 5 1 6.8 2.7l1-1.1C13.700 1.800 11 .6 8 .6S2.300 1.800.2 3.800l1 1.100C3 3.200 5.400 2.200 8 2.200Z" fill="#000" />
            <path d="M8 5.800c1.600 0 3.100.6 4.300 1.700l1-1.100C11.900 5 10 4.200 8 4.200S4.100 5 2.700 6.400l1 1.100C4.900 6.400 6.400 5.800 8 5.800Z" fill="#000" />
            <path d="M8 9.200c.8 0 1.500.3 2 .8L8 12 6 10c.5-.5 1.200-.8 2-.8Z" fill="#000" />
          </svg>
          <div style={{ width: 25 * u, height: 12 * u, borderRadius: 3.6 * u, border: `${1 * u}px solid rgba(0,0,0,0.4)`, padding: 1.2 * u, position: "relative" }}>
            <div style={{ width: "86%", height: "100%", borderRadius: 2 * u, background: "#000" }} />
            <div style={{ position: "absolute", right: -3 * u, top: 3.5 * u, width: 1.6 * u, height: 4 * u, borderRadius: 1 * u, background: "rgba(0,0,0,0.4)" }} />
          </div>
        </div>
      </div>
      {/* conversation header */}
      <div style={{ flex: "none", height: 74 * u, background: "#F9F9F9", borderBottom: `${0.6 * u}px solid ${C.hairline}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: `${6 * u}px ${14 * u}px 0` }}>
        <svg width={13 * u} height={22 * u} viewBox="0 0 13 22" style={{ marginTop: 12 * u }}>
          <path d="M11 2 L2.500 11 L11 20" fill="none" stroke={C.blue} strokeWidth={2.800} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 * u }}>
          {avatar ?? (
            <div style={{ display: "flex" }}>
              {(group ? ["#F25C1F", "#8E8E93", "#34C759"] : ["#8E8E93"]).map((tint, i) => (
                <div key={i} style={{ width: 40 * u, height: 40 * u, marginLeft: i ? -16 * u : 0, borderRadius: "50%", background: tint, border: `${2 * u}px solid #F9F9F9`, color: "#fff", fontSize: 17 * u, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {group ? "" : name[0]}
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 11.5 * u, color: "#000", display: "flex", alignItems: "center", gap: 2 * u }}>
            {name}
            <span style={{ color: C.textGray, fontSize: 10 * u }}>›</span>
          </div>
        </div>
        <svg width={26 * u} height={18 * u} viewBox="0 0 26 18" style={{ marginTop: 14 * u }}>
          <rect x={1.300} y={1.300} width={16} height={15.400} rx={4.200} fill="none" stroke={C.blue} strokeWidth={2.200} />
          <path d="M18.500 7 L24.700 3.300 V14.700 L18.500 11 Z" fill="none" stroke={C.blue} strokeWidth={2.200} strokeLinejoin="round" />
        </svg>
      </div>
      {children}
      <div style={{ flex: "none", height: 20 * u, display: "flex", justifyContent: "center" }}>
        <div style={{ width: 134 * u, height: 5 * u, borderRadius: 3 * u, background: "#000", marginTop: 7 * u }} />
      </div>
    </div>
  </div>
);

const IosInput: React.FC<{ u: number; text: string; placeholder: string; color: string; pressed: boolean; font: string }> = ({ u, text, placeholder, color, pressed }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ flex: "none", display: "flex", alignItems: "flex-end", gap: 9 * u, padding: `${6 * u}px ${12 * u}px ${6 * u}px` }}>
      <div style={{ width: 34 * u, height: 34 * u, flex: "none", borderRadius: "50%", background: "#E9E9EB", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 1 * u }}>
        <svg width={15 * u} height={15 * u} viewBox="0 0 15 15">
          <path d="M7.500 1.500 V13.500 M1.500 7.500 H13.500" stroke="#7C7C80" strokeWidth={2.200} strokeLinecap="round" />
        </svg>
      </div>
      <div style={{ flex: 1, minHeight: 36 * u, borderRadius: 18 * u, border: `${1 * u}px solid #C7C7CC`, display: "flex", alignItems: "flex-end", padding: `${5.5 * u}px ${5 * u}px ${5.5 * u}px ${13 * u}px`, gap: 6 * u }}>
        <div style={{ flex: 1, fontSize: 17 * u, lineHeight: 1.29, letterSpacing: -0.2 * u, color: text ? "#000" : "#B4B4B8", paddingBottom: 1 * u, overflowWrap: "anywhere" }}>
          {text || placeholder}
          {text ? <span style={{ display: "inline-block", width: 2 * u, height: 19 * u, background: C.blue, verticalAlign: "text-bottom", marginLeft: 1 * u, opacity: Math.floor(frame / 9) % 2 ? 0.15 : 1 }} /> : null}
        </div>
        {text || pressed ? (
          <div style={{ width: 27 * u, height: 27 * u, flex: "none", borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", scale: pressed ? 0.82 : 1 }}>
            <svg width={13 * u} height={15 * u} viewBox="0 0 13 15">
              <path d="M6.500 13.500 V2 M1.800 6.500 L6.500 1.800 L11.200 6.500" fill="none" stroke="#fff" strokeWidth={2.400} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        ) : (
          <svg width={16 * u} height={24 * u} viewBox="0 0 16 24" style={{ marginRight: 5 * u, marginBottom: 1 * u }}>
            <rect x={5} y={2} width={6} height={12} rx={3} fill="#8E8E93" />
            <path d="M2 11.500 a6 6 0 0 0 12 0 M8 17.500 V21.500" fill="none" stroke="#8E8E93" strokeWidth={1.800} strokeLinecap="round" />
          </svg>
        )}
      </div>
    </div>
  );
};

/* ----------------------------------------------------------------- Android */

const Android: React.FC<{ u: number; width: number; height: number; name: string; avatar?: React.ReactNode; children: React.ReactNode }> = ({ u, width, height, name, avatar, children }) => (
  <div style={{ width, height, borderRadius: 44 * u, background: "#101114", padding: 7 * u, boxShadow: `0 ${30 * u}px ${70 * u}px rgba(22,24,29,0.28), 0 0 0 ${1.5 * u}px #2A2A2E inset`, flex: "none" }}>
    <div style={{ width: "100%", height: "100%", borderRadius: 38 * u, background: "#fff", overflow: "hidden", display: "flex", flexDirection: "column", position: "relative", fontFamily: ROBOTO }}>
      <div style={{ position: "absolute", top: 12 * u, left: "50%", translate: "-50% 0", width: 15 * u, height: 15 * u, borderRadius: "50%", background: "#000", zIndex: 10 }} />
      <div style={{ height: 40 * u, flex: "none", display: "flex", alignItems: "center", justifyContent: "space-between", padding: `${4 * u}px ${22 * u}px 0`, background: "#F8FAFD" }}>
        <div style={{ fontSize: 14 * u, fontWeight: 500 }}>9:41</div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 * u }}>
          <svg width={15 * u} height={12 * u} viewBox="0 0 15 12">
            <path d="M7.500 12 L0 3.200 a11 11 0 0 1 15 0 Z" fill="#1F1F1F" />
          </svg>
          <svg width={12 * u} height={12 * u} viewBox="0 0 12 12">
            <path d="M12 0 V12 H0 Z" fill="#1F1F1F" />
          </svg>
          <div style={{ width: 9 * u, height: 14 * u, borderRadius: 2 * u, background: "#1F1F1F" }} />
        </div>
      </div>
      <div style={{ flex: "none", height: 62 * u, background: "#F8FAFD", display: "flex", alignItems: "center", gap: 12 * u, padding: `0 ${14 * u}px` }}>
        <svg width={20 * u} height={18 * u} viewBox="0 0 20 18">
          <path d="M9 1.500 L1.800 9 L9 16.500 M2 9 H19" fill="none" stroke="#1F1F1F" strokeWidth={2.200} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {avatar ?? <div style={{ width: 36 * u, height: 36 * u, borderRadius: "50%", background: "#C2E7FF" }} />}
        <div style={{ flex: 1, fontSize: 19 * u, fontWeight: 500, color: C.gText }}>{name}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3.500 * u, paddingRight: 4 * u }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ width: 4 * u, height: 4 * u, borderRadius: "50%", background: "#1F1F1F" }} />
          ))}
        </div>
      </div>
      {children}
      <div style={{ flex: "none", height: 18 * u, display: "flex", justifyContent: "center" }}>
        <div style={{ width: 110 * u, height: 4 * u, borderRadius: 2 * u, background: "#1F1F1F", marginTop: 7 * u }} />
      </div>
    </div>
  </div>
);

const AndroidInput: React.FC<{ u: number; text: string }> = ({ u, text }) => (
  <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 8 * u, padding: `${6 * u}px ${10 * u}px` }}>
    <div style={{ flex: 1, height: 46 * u, borderRadius: 23 * u, background: C.gSurface, display: "flex", alignItems: "center", gap: 10 * u, padding: `0 ${14 * u}px`, fontSize: 16 * u, color: text ? C.gText : "#5F6368" }}>
      <div style={{ width: 20 * u, height: 20 * u, borderRadius: "50%", border: `${1.800 * u}px solid #5F6368`, flex: "none", position: "relative" }}>
        <div style={{ position: "absolute", left: 4.200 * u, top: 5.500 * u, width: 2.400 * u, height: 2.400 * u, borderRadius: "50%", background: "#5F6368" }} />
        <div style={{ position: "absolute", right: 4.200 * u, top: 5.500 * u, width: 2.400 * u, height: 2.400 * u, borderRadius: "50%", background: "#5F6368" }} />
      </div>
      {text || "Text message"}
    </div>
    <div style={{ width: 46 * u, height: 46 * u, borderRadius: "50%", background: C.gSurface, flex: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width={20 * u} height={18 * u} viewBox="0 0 20 18">
        <path d="M1 1 L19 9 L1 17 L1 11 L12 9 L1 7 Z" fill={C.gBlue} />
      </svg>
    </div>
  </div>
);
