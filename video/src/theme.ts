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
