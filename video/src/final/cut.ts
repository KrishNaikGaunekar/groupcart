import { FPS } from "../theme";

/* The cut: which stretch of which recording plays when. Everything else in src/final/ is placed
   by what is being said, so times are written as seconds into a recording ("steps", 21.3) and
   turned into frames of the finished video here.

   The recordings are public/footage/*.mp4, made by tools/prep-footage.sh. Word times came from
   whisper.cpp (large-v3-turbo with --dtw) and were checked against the pauses ffmpeg finds. */

export type Seg = {
  id: string;
  file: string;
  from: number; // seconds into the recording where this stretch starts
  to: number;
  // Framing. The speaker sits at a different distance and height in each recording, so each is
  // scaled until the head is the same size (about 400 px wide) and then placed by the face.
  face: [number, number]; // where the face is in the recording, in pixels
  scale: number;
  alone: [number, number]; // where the face goes while the speaker has the frame to themselves
  aside: [number, number]; // and while an overlay has the right-hand side
};

export const SEGS: Seg[] = [
  // "We have all been there ... And it only takes three simple steps."
  // Only a phone comes up here, with no minion beside it, so the speaker need not move as far.
  { id: "hook", file: "footage/IMG_5812.mp4", from: 0.75, to: 28.63, face: [864, 415], scale: 1, alone: [864, 415], aside: [640, 415] },
  // "First, you text GroupCart what items you want ... how much each person owes."
  { id: "steps", file: "footage/IMG_5813.mp4", from: 0.8, to: 30.97, face: [818, 352], scale: 1.06, alone: [900, 356], aside: [472, 356] },
  // "Finally, just react with a thumbs up ... your group chat."
  { id: "pay", file: "footage/IMG_5814.mp4", from: 0.7, to: 25.6, face: [944, 370], scale: 1.27, alone: [960, 370], aside: [472, 362] },
];

const length = (seg: Seg) => Math.round((seg.to - seg.from) * FPS);

/** The frame of the finished video each stretch starts on. */
export const STARTS: Record<string, number> = {};
let cursor = 0;
for (const seg of SEGS) {
  STARTS[seg.id] = cursor;
  cursor += length(seg);
}
export const FOOTAGE_FRAMES = cursor;

export const seg = (id: string) => {
  const found = SEGS.find((s) => s.id === id);
  if (!found) throw new Error(`no stretch called ${id}`);
  return found;
};
export const frames = (id: string) => length(seg(id));

/** Seconds into a recording -> frame of the finished video. Times past the end of a stretch run
 *  on into whatever follows it, which is what an overlay that outlasts the cut wants. */
export const at = (id: string, seconds: number) => STARTS[id] + Math.round((seconds - seg(id).from) * FPS);
