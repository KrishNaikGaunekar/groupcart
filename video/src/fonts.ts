import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// The website's two typefaces (site/assets/fonts; licences in site/assets/CREDITS.md).
loadFont({ family: "basiic", url: staticFile("fonts/basiic.ttf") });
loadFont({ family: "virale", url: staticFile("fonts/virale/virale.ttf") });
