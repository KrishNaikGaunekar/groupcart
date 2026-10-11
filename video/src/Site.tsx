import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";
import { Pixel } from "./Pixel";
import { BODY, C, EASE, IN_OUT, S, SF, VIRALE, lerp, prog } from "./theme";

/* The pieces of the website (site/style.css) that the overlays are built from: the glass box with
   its title bar, the minion's speech bubble, the badges. Sizes are the site's, doubled.

   Overlays have no background: they are rendered with transparency and sit on top of footage.
   Glass cannot blur what is behind it there, so it is more opaque here than on the site. */

const SCANLINES = "repeating-linear-gradient(rgba(18,16,16,0) 0 2px, rgba(0,0,0,0.055) 2px 4px)";

/** Brings its children in at the start of a clip and takes them out at the end. */
export const Overlay: React.FC<{ total: number; delay?: number; from?: "bottom" | "right" | "left"; children: React.ReactNode; style?: React.CSSProperties }> = ({ total, delay = 0, from = "bottom", children, style }) => {
  const frame = useCurrentFrame();
  const enter = prog(frame, delay, 18, EASE);
  const leave = prog(frame, total - 14, 12, IN_OUT);
  const shift = lerp(from === "bottom" ? 90 : 70, 0, enter) + 50 * leave;
  return <div style={{ position: "absolute", opacity: enter * (1 - leave), translate: from === "bottom" ? `0px ${shift}px` : `${from === "right" ? shift : -shift}px 0px`, ...style }}>{children}</div>;
};

/** `.box` with its `h2` bar and the ruled `.inner`. */
export const Box: React.FC<{ title: string; sprite?: string; width: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ title, sprite, width, children, style }) => (
  <div style={{ width, position: "relative", padding: 20, borderRadius: 12, background: S.glass, boxShadow: "0 24px 60px rgba(16,36,40,0.38), 0 0 0 2px rgba(255,255,255,0.55) inset", overflow: "hidden", ...style }}>
    <div style={{ display: "flex", alignItems: "center", gap: 16, minHeight: 52, padding: "8px 12px 10px", background: S.mintGlass, border: `2px solid ${S.line}`, borderRadius: "12px 12px 0 0", fontFamily: VIRALE, fontSize: 28, lineHeight: "30px", letterSpacing: 4, color: S.ink, textTransform: "lowercase", whiteSpace: "nowrap" }}>
      {title}
      {sprite ? <Pixel name={sprite} scale={2} style={{ margin: "-10px 0" }} /> : null}
    </div>
    <div style={{ position: "relative", borderLeft: `2px solid ${S.line}`, padding: "14px 6px 14px 16px", marginBottom: 10, ...BODY }}>
      {children}
      <div style={{ position: "absolute", left: -6, bottom: -12, width: 10, height: 10, border: `2px solid ${S.line}`, borderRadius: "50%" }} />
    </div>
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: `${SCANLINES}, linear-gradient(rgba(255,255,255,0.34), rgba(255,255,255,0) 38%)` }} />
  </div>
);

/** The minion's speech bubble: square at the corner nearest the minion, text typed out. */
export const Speech: React.FC<{ text: string; at: number; width: number; style?: React.CSSProperties }> = ({ text, at, width, style }) => {
  const frame = useCurrentFrame();
  const shown = text.slice(0, Math.max(0, Math.floor((frame - at) / 0.75)));
  const p = prog(frame, at - 8, 12);
  return (
    <div style={{ width, padding: "24px 28px 26px", borderRadius: "56px 56px 56px 0", background: S.bubble, boxShadow: "0 18px 44px rgba(16,36,40,0.30)", ...BODY, fontSize: 26, lineHeight: "31px", scale: `1 ${p}`, transformOrigin: "0 100%", opacity: p, position: "relative", overflow: "hidden", ...style }}>
      <span style={{ visibility: "hidden" }}>{text}</span>
      <span style={{ position: "absolute", left: 28, top: 24, right: 28 }}>{shown}</span>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: SCANLINES }} />
    </div>
  );
};

/** An 88x31-style badge, as in the site's "tracks" box. */
export const Badge: React.FC<{ top: string; bottom: string; tone?: "mint" | "lilac" | "ink" | "gold"; width?: number }> = ({ top, bottom, tone = "mint", width = 176 }) => {
  const fill = { mint: "linear-gradient(180deg, #f4fbf8, #b9d6cb)", lilac: "linear-gradient(180deg, #f3ecfb, #b8a3d4)", ink: "linear-gradient(180deg, #47707a, #1f3d44)", gold: "linear-gradient(180deg, #fff4b8, #efc93a)" }[tone];
  return (
    <div style={{ width, height: 62, border: `2px solid ${S.line}`, borderRadius: 4, background: fill, color: tone === "ink" ? S.paper : S.ink, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textTransform: "lowercase", whiteSpace: "nowrap", flex: "none" }}>
      <div style={{ fontFamily: VIRALE, fontSize: 22, lineHeight: "24px" }}>{top}</div>
      <div style={{ fontFamily: BODY.fontFamily, fontSize: 18, lineHeight: "20px" }}>{bottom}</div>
    </div>
  );
};

/** A message bubble on its own, for diagrams. These stay true to the phone, not to the site. */
export const Bubble: React.FC<{ children: React.ReactNode; tone?: "blue" | "gray" | "android"; size?: number; reaction?: number; style?: React.CSSProperties }> = ({ children, tone = "gray", size = 23, reaction = 0, style }) => (
  <div style={{ position: "relative", display: "inline-block", maxWidth: "100%", background: tone === "blue" ? C.blue : tone === "android" ? C.gSurface : C.bubbleGray, color: tone === "blue" ? "#fff" : "#000", fontFamily: SF, fontSize: size, lineHeight: 1.28, letterSpacing: -0.2, borderRadius: size * 0.95, padding: `${size * 0.38}px ${size * 0.7}px ${size * 0.42}px`, ...style }}>
    {children}
    {reaction > 0 ? (
      tone === "android" ? (
        <div style={{ position: "absolute", right: 10, bottom: -14, height: 28, padding: "0 8px", borderRadius: 14, background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.3)", fontSize: 15, display: "flex", alignItems: "center", scale: String(reaction) }}>👍</div>
      ) : (
        <div style={{ position: "absolute", right: -16, top: -18, width: 38, height: 34, borderRadius: 17, background: C.blue, boxShadow: "0 0 0 2px #fff", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", scale: String(reaction) }}>👍</div>
      )
    ) : null}
  </div>
);

/** A full frame in the site's look, for the two clips that are not overlays. */
export const SitePage: React.FC<{ children: React.ReactNode; image?: string }> = ({ children, image = "bg-glass-light.jpg" }) => (
  <AbsoluteFill style={{ background: "#c5cdc7", ...BODY }}>
    <Img src={staticFile(image)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
    {children}
    <AbsoluteFill style={{ pointerEvents: "none", background: "linear-gradient(rgba(18,16,16,0) 50%, rgba(0,0,0,0.16) 50%) 0 0 / 100% 4px" }} />
  </AbsoluteFill>
);

/** Stand-in for the footage, used only by the preview reel so the overlays can be judged over something. */
export const Footage: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ background: "linear-gradient(135deg, #3b4a52, #1d262b 70%)" }}>
    <div style={{ position: "absolute", left: 90, bottom: 70, fontFamily: SF, fontSize: 30, color: "rgba(255,255,255,0.4)" }}>your footage goes here</div>
    {children}
  </AbsoluteFill>
);

/** The site's masthead: the name in a ruled box. */
export const Masthead: React.FC<{ at?: number; width?: number }> = ({ at = 0, width = 1240 }) => {
  const frame = useCurrentFrame();
  const p = prog(frame, at, 16);
  return (
    <div style={{ width, border: `4px solid ${S.ink}`, textAlign: "center", fontFamily: VIRALE, fontSize: 96, lineHeight: "104px", letterSpacing: 20, padding: "14px 0 20px 20px", color: S.ink, scale: `1 ${p}`, opacity: p }}>groupcart</div>
  );
};
