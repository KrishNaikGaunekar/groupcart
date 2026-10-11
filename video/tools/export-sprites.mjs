// Copies the website's pixel sprites (site/js/sprites.js) into src/sprites.json, so the video draws the same ones.
//   node tools/export-sprites.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
globalThis.window = { matchMedia: () => ({ matches: true }) };
globalThis.document = { readyState: "complete", querySelectorAll: () => [], addEventListener() {} };
globalThis.requestAnimationFrame = () => {};
new Function(readFileSync(root + "site/js/sprites.js", "utf8"))();
const { sprites, colors } = globalThis.window.GCSprites;
writeFileSync(root + "video/src/sprites.json", JSON.stringify({ colors, sprites }) + "\n");
console.log("wrote src/sprites.json:", Object.keys(sprites).join(", "));
