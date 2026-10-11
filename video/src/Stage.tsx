import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, POP, SF_DISPLAY, lerp, prog } from "./theme";

/** The paper background every clip sits on, with two soft glows that drift slowly. */
export const Stage: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 90) * 30;
  return (
    <AbsoluteFill style={{ background: C.paper, fontFamily: SF_DISPLAY, color: C.ink, overflow: "hidden" }}>
      <div style={{ position: "absolute", width: 900, height: 900, left: -260 + drift, top: -380, borderRadius: "50%", background: "radial-gradient(circle, rgba(242,92,31,0.20), rgba(242,92,31,0) 68%)" }} />
      <div style={{ position: "absolute", width: 1100, height: 1100, right: -420 - drift, bottom: -560, borderRadius: "50%", background: "radial-gradient(circle, rgba(22,24,29,0.09), rgba(22,24,29,0) 66%)" }} />
      {children}
    </AbsoluteFill>
  );
};

/** Words that rise into place one line at a time. */
export const Rise: React.FC<{ at: number; children: React.ReactNode; style?: React.CSSProperties; by?: number }> = ({ at, children, style, by = 28 }) => {
  const frame = useCurrentFrame();
  const p = prog(frame, at, 18);
  return <div style={{ opacity: p, translate: `0px ${lerp(by, 0, p)}px`, ...style }}>{children}</div>;
};

export const Headline: React.FC<{ at?: number; children: React.ReactNode; size?: number; style?: React.CSSProperties }> = ({ at = 0, children, size = 96, style }) => (
  <Rise at={at} style={{ fontSize: size, fontWeight: 700, letterSpacing: -0.035 * size, lineHeight: 1.04, ...style }}>
    {children}
  </Rise>
);

export const Sub: React.FC<{ at?: number; children: React.ReactNode; size?: number; style?: React.CSSProperties }> = ({ at = 0, children, size = 44, style }) => (
  <Rise at={at} style={{ fontSize: size, fontWeight: 500, letterSpacing: -0.02 * size, lineHeight: 1.22, color: C.inkSoft, ...style }}>
    {children}
  </Rise>
);

/** The orange numbered disc for "step 1 / 2 / 3". */
export const StepDisc: React.FC<{ n: number; at?: number; size?: number }> = ({ n, at = 0, size = 132 }) => {
  const frame = useCurrentFrame();
  const p = prog(frame, at, 16, POP);
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: C.orange, color: "#fff", fontSize: size * 0.56, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", scale: p, opacity: Math.min(1, p * 2), boxShadow: "0 18px 40px rgba(242,92,31,0.35)" }}>
      {n}
    </div>
  );
};

/** Caption on the left, phone on the right: the layout of every single-phone clip. */
export const Split: React.FC<{ left: React.ReactNode; right: React.ReactNode }> = ({ left, right }) => (
  <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", padding: "0 140px 0 150px", gap: 90 }}>
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 34, alignItems: "flex-start" }}>{left}</div>
    <div style={{ flex: "none" }}>{right}</div>
  </AbsoluteFill>
);

export const PHONE = { width: 520, height: 1020 };
