/* The page doll: the pixel minion from minion-sprite.js, moved part by part.

   The sprite data is one grid of pixels per part (body, arms, legs, mouth,
   pupils). Each part is painted once to its own small canvas; every frame the
   parts are put back together at the sprite's own resolution, the limbs turned
   on their joints, and the browser scales the result up with hard edges. So it
   stays pixel art however it moves.

       const doll = GCMinion.mount(canvas, { onPoke() {} });
       doll.talk(true); doll.wave(1500); doll.jump();

   It bobs, waves, blinks, watches the pointer, walks while the page scrolls,
   talks while the speech bubble types, dozes off when left alone, and does a
   different trick each time it is poked. */
(() => {
    "use strict";

    const STAGE = { w: 136, h: 142, ox: 18, oy: 20 };   // the canvas, and where the sprite sits on it: room to jump and fling an arm
    const STEP = Math.PI / 30;                          // limbs turn in 6 degree steps, like drawn frames
    const BEAT = 12;                                    // and move this many times a second
    const TRICKS = ["jump", "spin", "dance", "dizzy"];
    const LENGTH = { jump: 800, spin: 900, dance: 2200, dizzy: 1700 };
    const BANANA = ["........K.", ".......KK.", "......KYK.", ".K...KYYK.", "KYK.KYYYK.", "KYYKYYYK..", "KYYYYYYK..", ".KOYYYK...", "..KKKK...."];
    const BANANA_COLOURS = { K: "#2a2525", Y: "#f7d840", O: "#f0a63a" };

    const lerp = (a, b, t) => a + (b - a) * t;
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const snap = (v, step) => Math.round(v / step) * step;
    // the same for a scale, which has to come back to exactly 1 or the sprite is resampled at rest
    const snapScale = (v, step) => (Math.abs(v - 1) < step / 2 ? 1 : snap(v, step));

    function paint(rows, colourOf) {
        const canvas = document.createElement("canvas");
        canvas.width = rows[0].length;
        canvas.height = rows.length;
        const ctx = canvas.getContext("2d");
        rows.forEach((row, y) => {
            for (let x = 0; x < row.length; x++) {
                const colour = colourOf(row[x]);
                if (!colour) continue;
                ctx.fillStyle = colour;
                ctx.fillRect(x, y, 1, 1);
            }
        });
        return canvas;
    }

    function mount(canvas, options = {}) {
        const sprite = window.GCMinionSprite;
        if (!sprite) return { talk() {}, wave() {}, jump() {}, poke() {} };
        const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const colourOf = (ch) => sprite.palette[sprite.chars.indexOf(ch)];
        const FEET = { x: sprite.width / 2, y: sprite.height };

        const parts = {};
        for (const [name, part] of Object.entries(sprite.layers)) {
            parts[name] = { ...part, canvas: paint(part.rows, colourOf), w: part.rows[0].length, h: part.rows.length };
        }
        const eyes = {};
        for (const [side, eye] of Object.entries(sprite.eyes)) {
            const pupil = parts[`pupil${side}`];
            const pixels = [];
            pupil.rows.forEach((row, y) => [...row].forEach((ch, x) => ch !== "." && pixels.push([pupil.x + x, pupil.y + y, colourOf(ch)])));
            const lens = [];
            eye.lens.rows.forEach((row, y) => [...row].forEach((ch, x) => ch === "#" && lens.push([eye.lens.x + x, eye.lens.y + y])));
            eyes[side] = {
                centre: eye.centre, rest: eye.pupil, pixels, lens,
                inLens: new Set(lens.map(([x, y]) => `${x},${y}`)),
                top: eye.lens.y, rows: eye.lens.rows.length,
                at: [...eye.pupil],                      // where the pupil's middle is now
            };
        }
        const banana = paint(BANANA, (ch) => BANANA_COLOURS[ch]);

        canvas.width = STAGE.w;
        canvas.height = STAGE.h;
        const ctx = canvas.getContext("2d");
        const face = document.createElement("canvas");   // body, eyes and mouth, put together before any turning
        face.width = sprite.width;
        face.height = sprite.height;
        const fctx = face.getContext("2d");

        const s = {
            pointer: null, pointerAt: -1e9, awakeAt: performance.now(), glance: [0, 0], nextGlance: 0,
            talking: false, waveUntil: 0, nextWave: 7000, nextBlink: 1500, blinkAt: -1e9,
            trick: null, tricks: 0, walk: 0, walkPhase: 0, strollUntil: 0, nextStroll: 11000,
            scrollY: window.scrollY, particles: [], last: 0, drawn: "", visible: true, asleep: false,
        };

        /* ---- what every part should be doing at this moment ---- */
        function pose(now) {
            const t = now / 1000, beat = Math.floor(t * BEAT) / BEAT;
            const p = { lift: 0, dx: 0, lean: 0, sx: 1, sy: 1, flip: 1, armL: 0, armR: 0, legL: 0, legR: 0, mouth: 1, lid: 0, squint: 0, roll: null };

            // idling: a one pixel bob and a little sway in the arms
            p.lift = Math.sin(beat * 2.6) > 0.25 ? 1 : 0;
            p.armR = Math.sin(beat * 2.6) * 0.07;
            p.armL = now < s.waveUntil ? Math.sin(beat * 11) * 0.36 - 0.06 : Math.sin(beat * 2.6 + 1) * 0.06;

            // walking on the spot: when the page scrolls, and now and then for no reason
            if (s.walk > 0.03) {
                const stride = Math.sin(s.walkPhase), k = Math.min(1, s.walk);
                p.legL += stride * 0.32 * k;
                p.legR -= stride * 0.32 * k;
                p.armR += stride * 0.28 * k;
                p.lift += Math.abs(Math.cos(s.walkPhase)) * 2 * k;
            }

            if (s.talking) p.mouth = [1, 0.5, 0.9, 0.3, 0.7, 0.4, 1.1, 0.6][Math.floor(t * 11) % 8];

            // asleep: it has not seen the pointer for a while
            if (s.asleep) {
                p.lid = 0.62;
                p.lift = Math.sin(beat * 1.2) > 0 ? 1 : 0;
                p.armL = 0.25;
                p.mouth = 0.45;
            }
            const blink = (now - s.blinkAt) / 150;
            if (blink >= 0 && blink < 1) p.lid = Math.max(p.lid, blink < 0.33 || blink > 0.66 ? 0.5 : 1);

            if (s.trick) {
                const u = (now - s.trick.at) / LENGTH[s.trick.name];
                if (u >= 1) s.trick = null;
                else trick[s.trick.name](p, u);
            }

            // everything lands on whole pixels and whole steps
            for (const limb of ["armL", "armR", "legL", "legR"]) p[limb] = snap(p[limb], STEP);
            p.lift = Math.round(p.lift);
            p.dx = Math.round(p.dx);
            p.lean = snap(p.lean, STEP / 3);
            p.sx = snapScale(p.sx, 0.02);
            p.sy = snapScale(p.sy, 0.02);
            p.flip = Math.abs(p.flip) < 0.12 ? Math.sign(p.flip || 1) * 0.12 : snapScale(p.flip, 0.1);
            return p;
        }

        const trick = {
            jump(p, u) {
                if (u < 0.18) {                                   // crouch
                    const a = u / 0.18;
                    p.sy = 1 - 0.12 * a; p.sx = 1 + 0.1 * a;
                } else if (u < 0.8) {                             // in the air
                    const a = (u - 0.18) / 0.62;
                    p.lift = Math.sin(a * Math.PI) * 12;
                    p.sy = 1.06; p.sx = 0.96;
                    p.armL = -0.5; p.armR = -0.95; p.legL = 0.36; p.legR = -0.36;
                    p.squint = 0.3; p.mouth = 1.25;
                } else {                                          // land
                    const a = Math.sin(((u - 0.8) / 0.2) * Math.PI);
                    p.sy = 1 - 0.1 * a; p.sx = 1 + 0.08 * a;
                }
            },
            spin(p, u) {                                          // flat, like a card turning twice
                p.flip = Math.cos(u * Math.PI * 4);
                p.lift = Math.sin(u * Math.PI) * 5;
                p.armL = -0.3; p.armR = -0.6; p.mouth = 1.2;
            },
            dance(p, u) {
                const sway = Math.sin(u * Math.PI * 10);
                p.dx = sway * 2;
                p.lean = sway * 0.1;
                p.lift = Math.abs(sway) * 3;
                p.armL = -0.2 + Math.sin(u * Math.PI * 20) * 0.42;
                p.armR = -0.7 + Math.cos(u * Math.PI * 20) * 0.36;
                p.legL = sway * 0.3; p.legR = -sway * 0.3;
                p.squint = 0.25; p.mouth = 1.2;
            },
            dizzy(p, u) {                                         // the eyes go round, then it shakes it off
                p.roll = u < 0.8 ? u * Math.PI * 8 : null;
                p.lean = Math.sin(u * Math.PI * 6) * 0.08 * (1 - u);
                p.mouth = 0.5;
                p.armL = 0.18;
                if (u > 0.8) p.lid = u < 0.9 ? 1 : 0;
            },
        };

        /* ---- eyes: each pupil heads for the pointer on its own, so up close it goes cross-eyed ---- */
        function look(p, dt, now) {
            if (now > s.nextGlance) {
                s.glance = Math.random() < 0.5 ? [0, 0] : [(Math.random() - 0.5) * 7, (Math.random() - 0.5) * 4];
                s.nextGlance = now + 1200 + Math.random() * 2600;
            }
            const watching = s.pointer && now - s.pointerAt < 5000;
            const ease = still ? 1 : 1 - Math.pow(0.0004, dt);
            for (const eye of Object.values(eyes)) {
                let tx, ty;
                if (p.roll !== null) {
                    tx = eye.centre[0] + Math.cos(p.roll) * 3.6;
                    ty = eye.centre[1] + Math.sin(p.roll) * 3.2;
                } else if (watching) {
                    const vx = s.pointer[0] - eye.centre[0], vy = s.pointer[1] - eye.centre[1];
                    const far = Math.hypot(vx, vy) || 1, reach = Math.min(1, far / 20);
                    tx = eye.centre[0] + (vx / far) * 4.3 * reach;
                    ty = eye.centre[1] + (vy / far) * 3.7 * reach;
                } else {
                    tx = eye.rest[0] + s.glance[0];
                    ty = eye.rest[1] + s.glance[1];
                }
                eye.at[0] = p.roll !== null ? tx : lerp(eye.at[0], tx, ease);
                eye.at[1] = p.roll !== null ? ty : lerp(eye.at[1], ty, ease);
            }
        }

        function drawFace(p) {
            fctx.clearRect(0, 0, face.width, face.height);
            fctx.drawImage(parts.body.canvas, parts.body.x, parts.body.y);
            for (const eye of Object.values(eyes)) {
                const dx = Math.round(eye.at[0] - eye.rest[0]), dy = Math.round(eye.at[1] - eye.rest[1]);
                for (const [x, y, colour] of eye.pixels) {
                    if (!eye.inLens.has(`${x + dx},${y + dy}`)) continue;      // the pupil cannot leave the lens
                    fctx.fillStyle = colour;
                    fctx.fillRect(x + dx, y + dy, 1, 1);
                }
                const upper = Math.round(eye.rows * p.lid), lower = Math.round(eye.rows * p.squint);
                if (!upper && !lower) continue;
                for (const [x, y] of eye.lens) {
                    const row = y - eye.top;
                    if (row < upper) fctx.fillStyle = row === upper - 1 ? "#5a3a12" : sprite.skin;
                    else if (row >= eye.rows - lower) fctx.fillStyle = row === eye.rows - lower ? "#5a3a12" : sprite.skin;
                    else continue;
                    fctx.fillRect(x, y, 1, 1);
                }
            }
            const mouth = parts.mouth;
            fctx.drawImage(mouth.canvas, 0, 0, mouth.w, mouth.h, mouth.x, mouth.y, mouth.w, Math.max(2, Math.round(mouth.h * p.mouth)));
        }

        function render(p) {
            const key = JSON.stringify([p, Object.values(eyes).map((e) => [Math.round(e.at[0]), Math.round(e.at[1])]),
                s.particles.map((b) => [Math.round(b.x), Math.round(b.y), b.life > 0.25 || Math.floor(b.life * 40) % 2])]);
            if (key === s.drawn) return;                         // nothing moved a whole pixel
            s.drawn = key;
            drawFace(p);

            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, STAGE.w, STAGE.h);
            ctx.imageSmoothingEnabled = false;

            // a shadow on the floor that shrinks as it leaves the ground
            const ground = STAGE.oy + sprite.height, shrink = 1 - p.lift / 34;
            ctx.fillStyle = "rgba(30, 50, 50, 0.2)";
            [[0.78, 1], [1, 2], [0.78, 3]].forEach(([wide, row]) => {
                const half = Math.round(27 * wide * shrink);
                ctx.fillRect(STAGE.ox + FEET.x - 2 + p.dx - half, ground + row - 1, half * 2, 1);
            });

            // the whole figure hangs off the point between its feet
            ctx.translate(STAGE.ox + FEET.x + p.dx, STAGE.oy + FEET.y - p.lift);
            ctx.rotate(p.lean);
            ctx.scale(p.sx * p.flip, p.sy);
            ctx.translate(-FEET.x, -FEET.y);
            for (const name of sprite.order) {
                if (name === "body") {
                    ctx.drawImage(face, 0, 0);
                    continue;
                }
                const part = parts[name];
                ctx.save();
                ctx.translate(part.pivot[0], part.pivot[1]);
                ctx.rotate(p[name]);
                ctx.drawImage(part.canvas, part.x - part.pivot[0], part.y - part.pivot[1]);
                ctx.restore();
            }

            ctx.setTransform(1, 0, 0, 1, 0, 0);
            for (const b of s.particles) {
                if (b.life < 0.25 && Math.floor(b.life * 40) % 2) continue;     // flicker out
                ctx.drawImage(banana, Math.round(b.x), Math.round(b.y));
            }
        }

        function frame(now) {
            const dt = clamp((now - s.last) / 1000, 0, 0.05);
            s.last = now;
            if (s.visible && !document.hidden) {
                if (now > s.nextBlink) {
                    s.blinkAt = now;
                    s.nextBlink = now + 1800 + Math.random() * 3600;
                }
                if (now > s.nextWave) {
                    s.waveUntil = now + 1500;
                    s.nextWave = now + 8000 + Math.random() * 7000;
                }
                s.asleep = now - s.awakeAt > 30000 && !s.talking && !s.trick;
                if (now > s.nextStroll) {
                    if (!s.asleep) s.strollUntil = now + 1700;
                    s.nextStroll = now + 12000 + Math.random() * 9000;
                }
                if (now < s.strollUntil) {
                    s.walk = 1;
                    s.walkPhase += dt * 9;
                } else {
                    s.walk *= Math.pow(0.02, dt);                // scrolling tops this up; it fades when the page stops
                }
                for (const b of s.particles) {
                    b.vy += 300 * dt;
                    b.x += b.vx * dt;
                    b.y += b.vy * dt;
                    b.life -= dt;
                }
                s.particles = s.particles.filter((b) => b.life > 0);
                const p = pose(now);
                look(p, dt, now);
                render(p);
            }
            s.raf = requestAnimationFrame(frame);
        }

        /* Where the pointer is, in the sprite's own pixels. */
        function onPointer(event) {
            const box = canvas.getBoundingClientRect();
            if (!box.width) return;
            s.pointer = [((event.clientX - box.left) / box.width) * STAGE.w - STAGE.ox,
                ((event.clientY - box.top) / box.height) * STAGE.h - STAGE.oy];
            const now = performance.now();
            if (s.asleep) s.blinkAt = now;                       // waking up starts with a blink
            s.pointerAt = s.awakeAt = now;
            if (still) drawStill();
        }

        function onScroll() {
            const moved = Math.abs(window.scrollY - s.scrollY);
            s.scrollY = window.scrollY;
            s.walk = 1;
            s.walkPhase += moved * 0.07;
            s.awakeAt = performance.now();
        }

        function drawStill() {
            const p = pose(0);
            p.lift = 0;
            look(p, 1, performance.now());
            render(p);
        }

        const api = {
            talk(on) {
                s.talking = !!on;
                s.awakeAt = performance.now();
            },
            wave(ms = 1500) {
                s.waveUntil = performance.now() + ms;
            },
            /* One named trick, or the next in the list. */
            poke(name) {
                const now = performance.now();
                if (still || (s.trick && now - s.trick.at < LENGTH[s.trick.name])) return;
                s.trick = { name: name || TRICKS[s.tricks++ % TRICKS.length], at: now };
                s.awakeAt = now;
                if (s.trick.name === "dizzy") return;
                for (let i = 0; i < 4; i++) {
                    s.particles.push({
                        x: STAGE.ox + 20 + Math.random() * 60, y: STAGE.oy + 30 + Math.random() * 20,
                        vx: (Math.random() - 0.5) * 110, vy: -120 - Math.random() * 60, life: 0.9 + Math.random() * 0.3,
                    });
                }
            },
            jump() {
                api.poke("jump");
            },
            destroy() {
                cancelAnimationFrame(s.raf);
                window.removeEventListener("pointermove", onPointer);
                window.removeEventListener("scroll", onScroll);
            },
        };

        canvas.setAttribute("role", "img");
        if (!canvas.hasAttribute("aria-label")) {
            canvas.setAttribute("aria-label", "The GroupCart mascot: a small yellow pixel-art minion in blue overalls, waving");
        }
        canvas.addEventListener("click", () => {
            api.poke();
            options.onPoke?.();
        });
        canvas.addEventListener("pointerenter", () => api.wave(1300));
        window.addEventListener("pointermove", onPointer, { passive: true });
        window.addEventListener("scroll", onScroll, { passive: true });
        if ("IntersectionObserver" in window) {
            new IntersectionObserver(([entry]) => { s.visible = entry.isIntersecting; }).observe(canvas);
        }

        drawStill();                 // one frame straight away, so it is there even in a background tab
        if (!still) {
            api.wave(2200);
            s.raf = requestAnimationFrame(frame);
        }
        return api;
    }

    window.GCMinion = { mount };
})();
