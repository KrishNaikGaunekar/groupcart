import React from "react";
import { Img, staticFile, useCurrentFrame } from "remotion";
import meta from "../public/minion/minion.json";

/* Justin's pixel minion, the website's mascot, moved part by part the way site/js/minion.js
   moves it: a one-pixel bob, a wave, blinks, a talking mouth and a jump. Here every move is a
   function of the frame, so it renders the same every time. The parts are the PNGs that
   scripts/minion_sprite.py --layers writes. */

type Layer = { x: number; y: number; w: number; h: number; pivot?: number[] };
const LAYERS = meta.layers as Record<string, Layer>;
const STEP = Math.PI / 30; // limbs turn in 6 degree steps, like drawn frames
const snap = (v: number) => Math.round(v / STEP) * STEP;
const within = (frame: number, spans: [number, number][] = []) => spans.some(([a, b]) => frame >= a && frame < b);

export const MINION = { width: 136, height: 142 }; // the sprite with room around it to jump and wave

/** The frame the minion idles on (its bob, blinks and talking mouth), when that should not be the
 *  clip's own frame: a clip that is slowed, held or sped up to fit speech keeps a minion that
 *  moves at normal speed. Without a provider it is the current frame. */
export const IdleClock = React.createContext<number | null>(null);

export const Minion: React.FC<{
  scale?: number;
  wave?: [number, number][]; // frame ranges it waves in
  talk?: [number, number][]; // frame ranges its mouth moves in
  jumps?: number[]; // frames it jumps on
  look?: [number, number]; // where the pupils sit, in sprite pixels from rest
  style?: React.CSSProperties;
}> = ({ scale = 2, wave, talk, jumps = [], look = [0, 0], style }) => {
  const frame = useCurrentFrame();
  const idle = React.useContext(IdleClock) ?? frame;
  const beat = Math.floor((idle / 30) * 12) / 12;
  let lift = Math.sin(beat * 2.6) > 0.25 ? 1 : 0;
  let armL = within(frame, wave) ? Math.sin(beat * 11) * 0.36 - 0.06 : Math.sin(beat * 2.6 + 1) * 0.06;
  let armR = Math.sin(beat * 2.6) * 0.07;
  let legL = 0, legR = 0, sx = 1, sy = 1, mouth = 1;
  if (within(frame, talk)) mouth = [1, 0.5, 0.9, 0.3, 0.7, 0.4, 1.1, 0.6][Math.floor((idle / 30) * 11) % 8];
  for (const start of jumps) {
    const u = (frame - start) / 24;
    if (u < 0 || u >= 1) continue;
    if (u < 0.18) {
      sy = 1 - 0.12 * (u / 0.18);
      sx = 1 + 0.1 * (u / 0.18);
    } else if (u < 0.8) {
      lift = Math.round(Math.sin(((u - 0.18) / 0.62) * Math.PI) * 12);
      sy = 1.06; sx = 0.96; armL = -0.5; armR = -0.95; legL = 0.36; legR = -0.36; mouth = 1.25;
    } else {
      const a = Math.sin(((u - 0.8) / 0.2) * Math.PI);
      sy = 1 - 0.1 * a;
      sx = 1 + 0.08 * a;
    }
  }
  const blink = (Math.floor(idle) + 61) % 97 < 3;
  const turn: Record<string, number> = { armL: snap(armL), armR: snap(armR), legL: snap(legL), legR: snap(legR) };

  const part = (name: string, extra: React.CSSProperties = {}) => {
    const layer = LAYERS[name];
    const pivot = layer.pivot ? `${layer.pivot[0] - layer.x}px ${layer.pivot[1] - layer.y}px` : "0 0";
    return <Img key={name} src={staticFile(`minion/${name}.png`)} style={{ position: "absolute", left: layer.x, top: layer.y, width: layer.w, height: layer.h, imageRendering: "pixelated", transformOrigin: pivot, rotate: `${turn[name] ?? 0}rad`, ...extra }} />;
  };

  return (
    <div style={{ width: MINION.width * scale, height: MINION.height * scale, position: "relative", flex: "none", ...style }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: MINION.width, height: MINION.height, scale: String(scale), transformOrigin: "0 0" }}>
        <div style={{ position: "absolute", left: 18 + 50 - 27 * (1 - lift / 34), top: 20 + 113, width: 54 * (1 - lift / 34), height: 3, background: "rgba(30,50,50,0.24)" }} />
        <div style={{ position: "absolute", left: 18, top: 20 - lift, width: 100, height: 113, transformOrigin: "50px 113px", scale: `${sx} ${sy}` }}>
          {part("legL")}
          {part("legR")}
          {part("body")}
          {part("mouth", { transformOrigin: "0 0", scale: `1 ${Math.max(0.2, mouth)}` })}
          {blink ? [part("lidL"), part("lidR")] : [part("pupilL", { translate: `${look[0]}px ${look[1]}px` }), part("pupilR", { translate: `${look[0]}px ${look[1]}px` })]}
          {part("armR")}
          {part("armL")}
        </div>
      </div>
    </div>
  );
};
