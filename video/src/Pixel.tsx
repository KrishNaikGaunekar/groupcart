import React from "react";
import { useCurrentFrame } from "remotion";
import data from "./sprites.json";

type Sprite = { fps: number; frames: string[][] };
const SPRITES = data.sprites as Record<string, Sprite>;
const COLORS = data.colors as Record<string, string>;

/** One of the website's tiny pixel animations (site/js/sprites.js), drawn at a whole-number scale. */
export const Pixel: React.FC<{ name: string; scale?: number; offset?: number; style?: React.CSSProperties }> = ({ name, scale = 3, offset = 0, style }) => {
  const frame = useCurrentFrame();
  const sprite = SPRITES[name];
  const rows = sprite.frames[Math.floor(((frame + offset) / 30) * sprite.fps) % sprite.frames.length];
  const width = rows[0].length;
  return (
    <svg width={width * scale} height={rows.length * scale} viewBox={`0 0 ${width} ${rows.length}`} shapeRendering="crispEdges" style={{ flex: "none", ...style }}>
      {rows.flatMap((row, y) => [...row].map((ch, x) => (COLORS[ch] ? <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} fill={COLORS[ch]} /> : null)))}
    </svg>
  );
};
