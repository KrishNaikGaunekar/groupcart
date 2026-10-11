import type React from "react";
import { Easing, interpolate } from "remotion";

export const FPS = 30;
export const W = 1920;
export const H = 1080;

// The team's own palette (assets/logo-mark.svg) for everything around the phones.
export const C = {
  paper: "#F2F0EA",
  paperDeep: "#E7E3D8",
  ink: "#16181D",
  inkSoft: "#5E626E",
  orange: "#F25C1F",
  orangeSoft: "#FFE3D4",
  white: "#FFFFFF",
  // Messages colours
  blue: "#0A7CFF",
  green: "#34C759",
  bubbleGray: "#E9E9EB",
  textGray: "#8E8E93",
  hairline: "#D1D1D6",
  // Google Messages colours, for the Android phone
  gBlue: "#0B57D0",
  gSurface: "#E9EEF6",
  gText: "#1F1F1F",
};

export const SF = '-apple-system, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif';
export const SF_DISPLAY = '-apple-system, "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif';
export const ROBOTO = 'Roboto, "Google Sans", -apple-system, "Helvetica Neue", Arial, sans-serif';
export const MONO = '"SF Mono", ui-monospace, Menlo, Monaco, monospace';

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const EASE = Easing.bezier(0.16, 1, 0.3, 1); // quick out, long settle
export const POP = Easing.bezier(0.34, 1.56, 0.64, 1); // overshoots a little
export const IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);

/** 0 -> 1 between `start` and `start + duration`, clamped. */
export const prog = (frame: number, start: number, duration: number, easing: (t: number) => number = EASE) =>
  interpolate(frame, [start, start + duration], [0, 1], { ...CLAMP, easing });

/** 1 while `start <= frame < end`, with short eased ramps on both sides. */
export const during = (frame: number, start: number, end: number, ramp = 8) =>
  Math.min(prog(frame, start, ramp), 1 - prog(frame, end, ramp));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// The website's own look (site/style.css), for everything that is not an iPhone.
export const S = {
  ink: "#2a2525",
  line: "#575555",
  mint: "#95bcaa",
  mintGlass: "rgba(149,188,170,0.78)",
  glass: "rgba(221,237,240,0.92)",
  bubble: "rgba(207,234,239,0.95)",
  paper: "#f0f8ff",
  deep: "#2e535a",
  link: "#00786b",
  lilac: "#a48ec2",
  lilacSoft: "rgba(190,172,216,0.62)",
  yellow: "#f7d840",
};
export const BASIIC = '"basiic", "Courier New", monospace';
export const VIRALE = '"virale", "basiic", "Courier New", monospace';
/** Body text as the site sets it, at twice the size: 14px/16px with 2px tracking there. */
export const BODY: React.CSSProperties = { fontFamily: BASIIC, fontSize: 28, lineHeight: "32px", letterSpacing: 2, color: S.ink };
