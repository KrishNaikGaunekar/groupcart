/* The two banners on the home page, drawn on canvases instead of shipped as images.
   <canvas class="banner" data-banner="streak" width="720" height="116"></canvas> */
(() => {
    "use strict";

    // a small seeded generator, so a banner looks the same on every load
    const seeded = (seed) => () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
    };
    const TITLE = '"virale", "basiic", "Courier New", monospace';

    function spaced(ctx, text, x, y, gap) {
        // right-aligned text with letter spacing, for canvases without ctx.letterSpacing
        let cursor = x;
        for (let i = text.length - 1; i >= 0; i--) {
            const width = ctx.measureText(text[i]).width;
            cursor -= width;
            ctx.fillText(text[i], cursor, y);
            cursor -= gap;
        }
        return cursor;
    }

    function streak(ctx, w, h) {
        const rnd = seeded(71);
        const base = ctx.createLinearGradient(0, 0, 0, h);
        base.addColorStop(0, "#fbfefb");
        base.addColorStop(1, "#d3e8d6");
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, w, h);

        // horizontal streaks, densest through the middle, like a long exposure
        const palette = ["#2f7d4f", "#2f7d4f", "#5fae6e", "#9fd3a2", "#c9a9e6", "#8f6fc0", "#ffffff", "#1d4a3a", "#e9f6d0"];
        for (let i = 0; i < 70; i++) {
            const y = h * (0.5 + (rnd() - 0.5) * (0.4 + rnd() * 0.75)), tall = 1 + rnd() * rnd() * 22;
            const cx = rnd() * w * 0.85, long = w * (0.3 + rnd() * 0.8);
            const band = ctx.createLinearGradient(cx - long / 2, 0, cx + long / 2, 0);
            const colour = palette[Math.floor(rnd() * palette.length)];
            band.addColorStop(0, "rgba(255,255,255,0)");
            band.addColorStop(0.45, colour);
            band.addColorStop(1, "rgba(255,255,255,0)");
            ctx.globalAlpha = 0.3 + rnd() * 0.6;
            ctx.fillStyle = band;
            ctx.fillRect(cx - long / 2, y - tall / 2, long, tall);
        }
        // one dark core, like something passing at speed
        ctx.globalAlpha = 0.9;
        const core = ctx.createLinearGradient(w * 0.05, 0, w * 0.66, 0);
        core.addColorStop(0, "rgba(16,44,38,0)");
        core.addColorStop(0.28, "#102c26");
        core.addColorStop(1, "rgba(16,44,38,0)");
        ctx.fillStyle = core;
        ctx.fillRect(w * 0.05, h * 0.5, w * 0.61, h * 0.17);
        ctx.fillRect(w * 0.2, h * 0.3, w * 0.5, h * 0.035);
        ctx.globalAlpha = 1;

        // the yellow blur at the left is the minion, going too fast to see
        const blur = ctx.createRadialGradient(w * 0.075, h * 0.5, 2, w * 0.075, h * 0.5, h * 0.58);
        blur.addColorStop(0, "rgba(247,216,64,1)");
        blur.addColorStop(0.55, "rgba(247,216,64,.6)");
        blur.addColorStop(1, "rgba(247,216,64,0)");
        ctx.fillStyle = blur;
        ctx.fillRect(0, 0, w * 0.32, h);
        const pants = ctx.createLinearGradient(w * 0.02, 0, w * 0.2, 0);
        pants.addColorStop(0, "rgba(79,127,192,0)");
        pants.addColorStop(0.4, "rgba(79,127,192,.9)");
        pants.addColorStop(1, "rgba(79,127,192,0)");
        ctx.fillStyle = pants;
        ctx.fillRect(w * 0.02, h * 0.62, w * 0.18, h * 0.2);

        // a pale strip under the lettering keeps it readable over the streaks
        const strip = ctx.createLinearGradient(w * 0.22, 0, w, 0);
        strip.addColorStop(0, "rgba(246,252,246,0)");
        strip.addColorStop(0.25, "rgba(246,252,246,.86)");
        ctx.fillStyle = strip;
        ctx.fillRect(w * 0.22, h * 0.64, w * 0.78, h * 0.3);
        ctx.textBaseline = "alphabetic";
        ctx.font = `${h * 0.25}px ${TITLE}`;
        ctx.fillStyle = "#102c26";
        spaced(ctx, "split the bill by text", w - h * 0.2, h * 0.87, h * 0.02);
        ctx.font = `${h * 0.16}px ${TITLE}`;
        ctx.fillStyle = "#3d5a50";
        spaced(ctx, "groupcart", w - h * 0.2, h * 0.24, h * 0.02);
    }

    function lens(ctx, w, h) {
        const rnd = seeded(404);
        ctx.fillStyle = "#f6f7ee";
        ctx.fillRect(0, 0, w, h);

        // soft washes of colour behind everything
        for (const [x, y, r, colour] of [[w * 0.42, h * 0.2, h * 0.9, "rgba(111,174,123,.45)"], [w * 0.28, h * 0.9, h * 0.6, "rgba(201,169,230,.5)"], [w * 0.62, h * 0.75, h * 0.5, "rgba(149,188,170,.35)"]]) {
            const wash = ctx.createRadialGradient(x, y, 0, x, y, r);
            wash.addColorStop(0, colour);
            wash.addColorStop(1, "rgba(255,255,255,0)");
            ctx.fillStyle = wash;
            ctx.fillRect(0, 0, w, h);
        }

        // the lens
        const cx = h * 1.05, cy = h * 0.5, R = h * 0.44;
        const glass = ctx.createRadialGradient(cx - R * 0.2, cy - R * 0.25, 1, cx, cy, R);
        glass.addColorStop(0, "#b9e6b0");
        glass.addColorStop(0.45, "#3f7a55");
        glass.addColorStop(1, "#123026");
        ctx.fillStyle = glass;
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(20,40,35,.8)";
        for (const [r, width] of [[R * 1.12, 2], [R * 1.3, 1], [R * 0.62, 1.5], [R * 0.3, 1]]) {
            ctx.lineWidth = width;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.strokeStyle = "rgba(240,255,240,.8)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - R * 0.5, cy);
        ctx.lineTo(cx + R * 0.5, cy);
        ctx.moveTo(cx, cy - R * 0.2);
        ctx.lineTo(cx, cy + R * 0.2);
        ctx.stroke();

        // long arcs and hairlines
        ctx.strokeStyle = "rgba(20,40,35,.75)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx + h * 0.2, cy + h * 2.1, h * 2.2, Math.PI * 1.22, Math.PI * 1.62);
        ctx.stroke();
        ctx.lineWidth = 1;
        for (const y of [0.2, 0.26, 0.82]) {
            ctx.beginPath();
            ctx.moveTo(0, h * y);
            ctx.lineTo(w * (0.3 + rnd() * 0.3), h * y);
            ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(w * 0.12, 0); ctx.lineTo(w * 0.12, h);
        ctx.moveTo(w * 0.135, 0); ctx.lineTo(w * 0.135, h);
        ctx.stroke();

        // title, slanted, with two scan gaps cut through it
        ctx.save();
        ctx.transform(1, 0, -0.22, 1, 0, 0);
        ctx.fillStyle = "#2a2f33";
        ctx.font = `${h * 0.34}px ${TITLE}`;
        ctx.textBaseline = "alphabetic";
        spaced(ctx, "hacknc 2026", w - h * 0.05, h * 0.52, h * 0.02);
        ctx.restore();
        ctx.fillStyle = "#f6f7ee";
        ctx.fillRect(w * 0.5, h * 0.33, w * 0.5, 2);
        ctx.fillRect(w * 0.5, h * 0.42, w * 0.5, 1.5);

        ctx.fillStyle = "#3d5a50";
        ctx.font = `${h * 0.105}px ${TITLE}`;
        spaced(ctx, "photon   gemini   nessie", w - h * 0.18, h * 0.67, h * 0.02);

        // two rows of squares that fill in toward the right
        const size = h * 0.07, gap = size * 0.55;
        for (let row = 0; row < 2; row++) {
            const count = 17 - row * 5;
            for (let i = 0; i < count; i++) {
                const t = i / (count - 1);
                ctx.fillStyle = `rgba(${Math.round(190 - 110 * t)},${Math.round(205 - 60 * t)},${Math.round(175 - 80 * t)},1)`;
                ctx.fillRect(w - h * 0.1 - (count - i) * (size + gap), h * (0.76 + row * 0.11), size, size);
            }
        }
    }

    const DRAW = { streak, lens };

    function paint() {
        document.querySelectorAll("canvas.banner[data-banner]").forEach((canvas) => {
            const draw = DRAW[canvas.dataset.banner];
            if (!draw) return;
            const ctx = canvas.getContext("2d");
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalAlpha = 1;
            draw(ctx, canvas.width, canvas.height);
        });
    }

    function start() {
        paint();
        // again once the title font has arrived, so the lettering is not the fallback
        document.fonts?.load('20px "virale"').then(paint).catch(() => {});
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
})();
