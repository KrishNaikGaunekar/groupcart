/* Tiny pixel animations, drawn here instead of shipped as GIFs.
   Usage: <canvas class="px" data-sprite="hop" data-scale="1"></canvas>
   Each sprite is a list of frames; a frame is rows of characters looked up in COLORS. */
(() => {
    "use strict";

    const COLORS = {
        K: "#2a2525", k: "rgba(42,37,37,.28)",
        Y: "#f7d840", y: "#d9a91f", O: "#f0a63a",
        S: "#cfd8db", s: "#8a979b", W: "#ffffff", w: "#eef3f1", L: "#a9b4b7",
        E: "#4a2f1b", B: "#4f7fc0", b: "#2f5185",
        R: "#e0607e", P: "#c9a9e6", p: "#8f6fc0",
        G: "#6fae7b", M: "#95bcaa", C: "#2f8cf5",
    };

    const blank = (w, h) => Array.from({ length: h }, () => Array(w).fill("."));
    const done = (grid) => grid.map((row) => row.join(""));
    const put = (grid, x, y, ch) => {
        if (grid[y] && x >= 0 && x < grid[0].length) grid[y][x] = ch;
    };
    const stamp = (grid, rows, x = 0, y = 0) => {
        rows.forEach((row, j) => [...row].forEach((ch, i) => ch !== "." && put(grid, x + i, y + j, ch)));
        return grid;
    };

    /* ---- the mini minion: 12 x 16, arms added per pose ---- */
    const MINI = [
        "....K..K....",
        "...KKKKKK...",
        "..KYYYYYYK..",
        ".KYYYYYYYYK.",
        ".KSSSSSSSSK.",
        ".KSWWSSWWSK.",
        ".KSWESSEWSK.",
        ".KSSSSSSSSK.",
        ".KYKYYYYKYK.",
        ".KYYKKKKYYK.",
        ".KBYYYYYYBK.",
        ".KBBBBBBBBK.",
        ".KBBBbbBBBK.",
        ".KBBBBBBBBK.",
        "..KBBKKBBK..",
        "..KKK..KKK..",
    ];
    const ARM = {
        down: [[0, 10, "y"], [0, 11, "y"], [0, 12, "K"]],
        up: [[0, 9, "y"], [0, 8, "y"], [0, 7, "K"]],
        out: [[0, 10, "y"], [-1, 10, "K"]],
        high: [[0, 9, "y"], [-1, 8, "y"], [-1, 7, "K"]],
    };

    function mini(grid, x, y, { left = "down", right = "down", blink = false, open = false } = {}) {
        stamp(grid, MINI, x, y);
        if (blink) {
            stamp(grid, ["YY..YY", "KK..KK"], x + 3, y + 5);
        }
        if (open) {
            stamp(grid, ["KKKK", "KRRK", ".KK."], x + 4, y + 8);
        }
        ARM[left].forEach(([ax, ay, ch]) => put(grid, x + ax, y + ay, ch));
        ARM[right].forEach(([ax, ay, ch]) => put(grid, x + 11 - ax, y + ay, ch));
        return grid;
    }

    const shadow = (grid, x0, x1) => {
        for (let x = x0; x <= x1; x++) put(grid, x, grid.length - 1, "k");
    };

    function hop() {
        const pose = [
            [0, "down", false], [0, "down", false], [-2, "out", false], [-4, "up", true],
            [-5, "up", true], [-4, "up", true], [-2, "out", false], [0, "down", false],
        ];
        return pose.map(([dy, arms, open]) => {
            const g = blank(14, 22);
            shadow(g, dy < -2 ? 4 : 3, dy < -2 ? 9 : 10);
            mini(g, 1, 5 + dy, { left: arms, right: arms, open });
            return done(g);
        });
    }

    function rope() {
        const W = 18, H = 23, x = 3;
        const over = (g) => {
            for (let i = 4; i <= 13; i++) put(g, i, 1, "R");
            [[3, 2], [14, 2], [2, 3], [15, 3]].forEach(([a, b]) => put(g, a, b, "R"));
            for (let j = 4; j <= 15; j++) { put(g, 1, j, "R"); put(g, 16, j, "R"); }
        };
        const under = (g) => {
            for (let j = 13; j <= 19; j++) { put(g, 1, j, "R"); put(g, 16, j, "R"); }
            [[2, 20], [15, 20], [3, 21], [14, 21]].forEach(([a, b]) => put(g, a, b, "R"));
            for (let i = 4; i <= 13; i++) put(g, i, 22, "R");
        };
        const sides = (g, y0, y1) => {
            for (let j = y0; j <= y1; j++) { put(g, 1, j, "R"); put(g, 16, j, "R"); }
        };
        const frame = (dy, draw) => {
            const g = blank(W, H);
            draw(g);
            mini(g, x, 6 + dy, { left: "out", right: "out", open: dy < -1 });
            return done(g);
        };
        return [
            frame(0, over),
            frame(-1, (g) => sides(g, 9, 16)),
            frame(-3, under),
            frame(-2, (g) => sides(g, 11, 14)),
        ];
    }

    function wiggle() {
        const pose = [[-1, "high", "down"], [0, "down", "down"], [1, "down", "high"], [0, "down", "down"]];
        return pose.map(([dx, left, right]) => {
            const g = blank(16, 17);
            shadow(g, 4, 11);
            mini(g, 2 + dx, 0, { left, right, open: dx !== 0 });
            return done(g);
        });
    }

    function wave() {
        const pose = [["down", "high", false], ["down", "up", false], ["down", "high", false], ["down", "up", false],
            ["down", "down", false], ["down", "down", true], ["down", "down", false], ["down", "down", false]];
        return pose.map(([left, right, blink]) => done(mini(blank(14, 16), 1, 0, { left, right, blink })));
    }

    /* ---- small objects ---- */
    const COIN = [
        ["..KKKKK..", ".KYYYYYK.", "KYYWYYYOK", "KYWYKYYOK", "KYYYKYYOK", "KYYYKYYOK", "KYYYYYYOK", ".KYOOOOK.", "..KKKKK.."],
        ["...KKK...", "..KYYYK..", ".KYWYYOK.", ".KYWKYOK.", ".KYYKYOK.", ".KYYKYOK.", ".KYYYYOK.", "..KYOOK..", "...KKK..."],
        ["....K....", "...KYK...", "...KYK...", "...KYK...", "...KYK...", "...KYK...", "...KYK...", "...KOK...", "....K...."],
        ["....K....", "....K....", "....O....", "....O....", "....O....", "....O....", "....O....", "....K....", "....K...."],
    ];
    const coin = () => [COIN[0], COIN[1], COIN[2], COIN[3], COIN[2], COIN[1]];

    const HEART = [
        [".KK...KK.", "KRRK.KRRK", "KRWRKRRRK", "KRRRRRRRK", ".KRRRRRK.", "..KRRRK..", "...KRK...", "....K...."],
        [".........", "..KK.KK..", ".KRRKRRK.", ".KRWRRRK.", "..KRRRK..", "...KRK...", "....K....", "........."],
    ];
    const heart = () => [HEART[0], HEART[0], HEART[1], HEART[0], HEART[1], HEART[1]];

    // a four-point star that opens and closes
    function sparkle() {
        return [0, 1, 2, 3, 4, 3, 2, 1].map((n) => {
            const g = blank(11, 11);
            for (let i = -n; i <= n; i++) {
                const ch = Math.abs(i) === n && n > 1 ? "p" : "K";
                put(g, 5 + i, 5, ch);
                put(g, 5, 5 + i, ch);
            }
            if (n >= 2) [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => put(g, 5 + a, 5 + b, "P"));
            if (n >= 4) [[-2, -2], [2, -2], [-2, 2], [2, 2]].forEach(([a, b]) => put(g, 5 + a, 5 + b, "p"));
            if (n) put(g, 5, 5, "W");
            return done(g);
        });
    }

    function receipt() {
        return [2, 4, 6, 8, 10, 10, 10].map((len) => {
            const g = blank(11, 15);
            stamp(g, ["KKKKKKKKKKK", "KsssssssssK", "KKKKKKKKKKK"], 0, 0);
            for (let j = 0; j < len; j++) {
                stamp(g, [j % 2 ? "KWLLLWLWK" : "KWWWWWWWK"], 1, 3 + j);
            }
            stamp(g, ["KWKWKWKWK", ".K.K.K.K."], 1, 3 + len);
            return done(g);
        });
    }

    const BANANA = ["........K.", ".......KK.", "......KYK.", ".K...KYYK.", "KYK.KYYYK.", "KYYKYYYK..", "KYYYYYYK..", ".KOYYYK...", "..KKKK...."];
    const banana = () => [0, -1, -2, -1].map((dy) => {
        const g = blank(10, 12);
        shadow(g, dy < -1 ? 3 : 2, dy < -1 ? 6 : 7);
        return done(stamp(g, BANANA, 0, 2 + dy));
    });

    function phone() {
        const bubbles = [[2, 3, "LLL"], [4, 5, "CCC"], [2, 7, "LLLL"], [5, 9, "CC"]];
        return [0, 1, 2, 3, 4, 4].map((n, i) => {
            const g = blank(11, 13);
            const dx = i === 1 || i === 3 ? (i === 1 ? 0 : 2) : 1;
            stamp(g, ["KKKKKKKKK", "KwwwKwwwK", ...Array(9).fill("KwwwwwwwK"), "KwwKKKwwK", "KKKKKKKKK"].slice(0, 13), dx, 0);
            bubbles.slice(0, n).forEach(([bx, by, row]) => stamp(g, [row], dx + bx, by));
            return done(g);
        });
    }

    function cart() {
        const body = [
            "KK...........", "..K..Y...P...", "..K.KYK.PpP..", "..KKKKKKKKKKK", "..KMMMMMMMMK.",
            "...KMKMKMKMK.", "...KMMMMMMK..", "...KKKKKKKK..", "....K....K...",
        ];
        const wheel = [["KKK", "KwK", "KKK"], ["KKK", "KKK", "KKK"]];
        return [0, 1, 0, 1].map((w, i) => {
            const g = blank(13, 13);
            stamp(g, body, 0, i === 2 ? 0 : 1);
            stamp(g, wheel[w], 3, 10);
            stamp(g, wheel[w], 8, 10);
            return done(g);
        });
    }

    function disc() {
        const frames = [];
        for (let f = 0; f < 6; f++) {
            const g = blank(11, 11);
            for (let y = 0; y < 11; y++) {
                for (let x = 0; x < 11; x++) {
                    const dx = x - 5, dy = y - 5, r = Math.hypot(dx, dy);
                    if (r > 5.4) continue;
                    const turn = ((Math.atan2(dy, dx) / (Math.PI * 2) + 1 + f / 6) % 1);
                    let ch = turn < 0.14 ? "W" : turn > 0.5 && turn < 0.64 ? "P" : turn > 0.3 && turn < 0.38 ? "M" : "S";
                    if (r > 4.5) ch = "K";
                    if (r < 1.6) ch = r < 0.8 ? "." : "K";
                    put(g, x, y, ch);
                }
            }
            frames.push(done(g));
        }
        return frames;
    }

    const LILAC = [
        "....P....", "...PpP...", "..PpPpP..", "..pPWPp..", ".PpPpPpP.", ".pPpPpPp.", "..PpPpP..", "...pPp...",
        "....G....", "...GG....", "..GGG.G..", "....GGG..", "....G....", "....G....",
    ];
    // the head of the sprig leans one pixel each way; the stem stays put
    const lilac = () => [0, 1, 0, -1].map((dx) => {
        const g = blank(11, 14);
        stamp(g, LILAC.slice(0, 4), 1 + dx, 0);
        stamp(g, LILAC.slice(4, 8), 1, 4);
        stamp(g, LILAC.slice(8), 1, 8);
        return done(g);
    });

    function dots() {
        return [0, 1, 2, 3].map((active) => {
            const g = blank(13, 9);
            stamp(g, [".KKKKKKKKKKK.", "KwwwwwwwwwwwK", "KwwwwwwwwwwwK", "KwwwwwwwwwwwK", "KwwwwwwwwwwwK", "KwwwwwwwwwwwK", ".KKKKKKKKKKK.", ".KK..........", ".K..........."]);
            [3, 6, 9].forEach((x, i) => put(g, x, i === active ? 2 : 3, i === active ? "K" : "L"));
            return done(g);
        });
    }

    const CHEVRONS = ["K...K..", ".K...K.", "..K...K", "...K...K", "..K...K", ".K...K.", "K...K.."];
    const arrows = () => [0, 1, 2, 1].map((dx) => done(stamp(blank(10, 7), CHEVRONS, dx, 0)));

    function lock() {
        const body = ["KKKKKKKKK", "KOOOOOOOK", "KOOOKOOOK", "KOOOKOOOK", "KOOOOOOOK", "KKKKKKKKK"];
        const shackle = ["..KKKKK..", ".KK...KK.", ".K.....K.", ".K.....K."];
        return [0, 1, 2, 3, 4, 5, 6, 7].map((f) => {
            const g = blank(9, 11);
            stamp(g, shackle, 0, f === 6 ? 0 : 1);
            stamp(g, body, 0, 5);
            if (f < 5) { put(g, 1 + f, 6 + Math.min(f, 3), "W"); put(g, 2 + f, 6, "W"); }
            return done(g);
        });
    }

    function card() {
        const base = ["KKKKKKKKKKKKK", "KMMMMMMMMMMMK", "KKKKKKKKKKKKK", "KMMMMMMMMMMMK", "KMOOMMMMMMMMK", "KMOOMMMMMMMMK", "KMMMMMMMMMMMK", "KMMMMMMMMMMMK", "KKKKKKKKKKKKK"];
        return [0, 1, 2, 3, 4, 4, 4, 4].map((hidden) => {
            const g = stamp(blank(13, 9), base);
            [2, 4, 6, 8].forEach((x, i) => put(g, x, 7, i < hidden ? "K" : "W"));
            put(g, 10, 7, "W");
            return done(g);
        });
    }

    const SPRITES = {
        hop: { fps: 9, frames: hop() },
        rope: { fps: 7, frames: rope() },
        wiggle: { fps: 5, frames: wiggle() },
        wave: { fps: 4, frames: wave() },
        coin: { fps: 8, frames: coin() },
        heart: { fps: 5, frames: heart() },
        sparkle: { fps: 7, frames: sparkle() },
        receipt: { fps: 3, frames: receipt() },
        banana: { fps: 7, frames: banana() },
        phone: { fps: 3, frames: phone() },
        cart: { fps: 6, frames: cart() },
        disc: { fps: 8, frames: disc() },
        lilac: { fps: 3, frames: lilac() },
        dots: { fps: 4, frames: dots() },
        arrows: { fps: 5, frames: arrows() },
        lock: { fps: 5, frames: lock() },
        card: { fps: 3, frames: card() },
    };

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const live = [];

    function draw(ctx, rows) {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        rows.forEach((row, y) => {
            for (let x = 0; x < row.length; x++) {
                const colour = COLORS[row[x]];
                if (!colour) continue;
                ctx.fillStyle = colour;
                ctx.fillRect(x, y, 1, 1);
            }
        });
    }

    function mount(canvas) {
        const sprite = SPRITES[canvas.dataset.sprite];
        if (!sprite || canvas.dataset.mounted) return;
        canvas.dataset.mounted = "1";
        const rows = sprite.frames[0];
        const scale = Number(canvas.dataset.scale) || 1;
        canvas.width = rows[0].length;
        canvas.height = rows.length;
        canvas.style.width = `${canvas.width * scale}px`;
        canvas.style.height = `${canvas.height * scale}px`;
        canvas.setAttribute("aria-hidden", "true");
        const ctx = canvas.getContext("2d");
        draw(ctx, rows);
        // a random phase so a row of the same sprite does not move in lockstep
        if (!still) live.push({ ctx, sprite, offset: Math.floor(Math.random() * sprite.frames.length), last: -1 });
    }

    function tick(now) {
        if (!document.hidden) {
            for (const item of live) {
                const index = (Math.floor((now / 1000) * item.sprite.fps) + item.offset) % item.sprite.frames.length;
                if (index === item.last) continue;
                item.last = index;
                draw(item.ctx, item.sprite.frames[index]);
            }
        }
        requestAnimationFrame(tick);
    }

    function scan(root = document) {
        root.querySelectorAll("canvas.px[data-sprite]").forEach(mount);
    }

    window.GCSprites = { scan, names: Object.keys(SPRITES), sprites: SPRITES, colors: COLORS };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => scan());
    else scan();
    if (!still) requestAnimationFrame(tick);
})();
