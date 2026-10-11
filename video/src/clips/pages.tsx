import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Minion } from "../Minion";
import { Pixel } from "../Pixel";
import { Badge, Box, Masthead, SitePage, Speech } from "../Site";
import { POP, S, VIRALE, lerp, prog } from "../theme";

/* The two clips that fill the frame: the intro and the sign-off. They are the website, as video:
   its background, its masthead, its boxes, and the minion talking in its speech bubble. */

const Rise: React.FC<{ at: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ at, children, style }) => {
  const frame = useCurrentFrame();
  const p = prog(frame, at, 16);
  return <div style={{ opacity: p, translate: `0px ${lerp(30, 0, p)}px`, ...style }}>{children}</div>;
};

const STEPS = [
  { sprite: "phone", text: "text what you want." },
  { sprite: "heart", text: "thumbs up the one you want." },
  { sprite: "coin", text: "thumbs up again to pay." },
];
const HELLO = "bello! this is groupcart. search, split and collect, all by text.";

/** 02. The intro: the one clip with nobody on camera. */
export const TITLE = 190;
export const TitleCard: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <SitePage>
      <AbsoluteFill style={{ alignItems: "center", padding: "84px 0 0" }}>
        <Masthead at={4} />
        <div style={{ display: "flex", gap: 70, marginTop: 84, alignItems: "flex-start" }}>
          <div style={{ width: 560 }}>
            <Speech text={HELLO} at={28} width={500} style={{ marginLeft: 60, fontSize: 30, lineHeight: "36px" }} />
            <Minion scale={3.4} wave={[[14, 80]]} talk={[[28, 28 + HELLO.length * 0.75]]} jumps={[150]} look={[3, -1]} style={{ marginTop: -10, opacity: prog(frame, 8, 10) }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 22, paddingTop: 20 }}>
            {STEPS.map((step, i) => (
              <Rise key={step.text} at={84 + i * 20}>
                <Box title={`step ${i + 1}`} sprite={step.sprite} width={610} style={{ boxShadow: "0 14px 34px rgba(16,36,40,0.22)" }}>
                  {step.text}
                </Box>
              </Rise>
            ))}
          </div>
        </div>
        <div style={{ position: "absolute", left: 340, right: 340, bottom: 44, border: `4px solid ${S.ink}`, padding: "6px 0 6px 8px", textAlign: "center", fontFamily: VIRALE, fontSize: 22, letterSpacing: 8, opacity: prog(frame, 60, 14), scale: `1 ${prog(frame, 60, 14, POP)}` }}>split the bill by text</div>
      </AbsoluteFill>
    </SitePage>
  );
};

/** 11. The sign-off. */
export const OUTRO = 160;
export const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const SAY = "shop, split and check out, all in your group chat.";
  return (
    <SitePage image="bg-hall-light.jpg">
      <AbsoluteFill style={{ alignItems: "center", padding: "70px 0 0" }}>
        <Masthead at={4} />
        <div style={{ display: "flex", alignItems: "flex-end", gap: 30, marginTop: 70 }}>
          <Minion scale={3} wave={[[10, 70]]} talk={[[24, 24 + SAY.length * 0.75]]} jumps={[96, 128]} look={[3, -1]} style={{ opacity: prog(frame, 8, 10) }} />
          <Speech text={SAY} at={24} width={640} style={{ fontSize: 34, lineHeight: "40px", marginBottom: 190 }} />
        </div>
        <Rise at={70} style={{ display: "flex", gap: 14, marginTop: 6 }}>
          <Badge top="photon" bottom="imessage agent" width={230} />
          <Badge top="gemini" bottom="the model" tone="lilac" width={230} />
          <Badge top="nessie" bottom="capital one" tone="ink" width={230} />
          <Badge top="hacknc" bottom="2026" tone="gold" width={230} />
        </Rise>
        <Rise at={88} style={{ marginTop: 26, display: "flex", alignItems: "center", gap: 18, fontFamily: VIRALE, fontSize: 30, letterSpacing: 5, color: S.ink }}>
          <Pixel name="hop" scale={2} />
          groupcart-beta.vercel.app
          <Pixel name="hop" scale={2} offset={11} />
        </Rise>
        <div style={{ position: "absolute", left: 340, right: 340, bottom: 44, border: `4px solid ${S.ink}`, padding: "6px 0 6px 8px", textAlign: "center", fontFamily: VIRALE, fontSize: 22, letterSpacing: 8, opacity: prog(frame, 100, 14), scale: `1 ${prog(frame, 100, 14, POP)}` }}>established 2026.10.10</div>
      </AbsoluteFill>
    </SitePage>
  );
};
