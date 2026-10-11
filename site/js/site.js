/* Shared behaviour for every page: toggles, sounds, clock, tooltips, copy
   buttons, the calendar, and the minion's speech bubble. No dependencies. */
(() => {
    "use strict";

    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
    const store = {
        get(key) { try { return localStorage.getItem(key); } catch { return null; } },
        set(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode */ } },
    };
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* ---------- sounds: synthesised, so there are no audio files ---------- */
    const sfx = (() => {
        let ctx = null, unlocked = false;
        let muted = store.get("gc-muted") === "1";
        const unlock = () => { unlocked = true; };
        window.addEventListener("pointerdown", unlock, { once: true, capture: true });
        window.addEventListener("keydown", unlock, { once: true, capture: true });

        function tone(freq, ms, { type = "sine", gain = 0.035, to = freq, delay = 0 } = {}) {
            if (muted || !unlocked) return;
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            ctx ??= new AC();
            if (ctx.state === "suspended") ctx.resume();
            const at = ctx.currentTime + delay / 1000, end = at + ms / 1000;
            const osc = ctx.createOscillator(), amp = ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, at);
            if (to !== freq) osc.frequency.exponentialRampToValueAtTime(to, end);
            amp.gain.setValueAtTime(0.0001, at);
            amp.gain.exponentialRampToValueAtTime(gain, at + 0.008);
            amp.gain.exponentialRampToValueAtTime(0.0001, end);
            osc.connect(amp).connect(ctx.destination);
            osc.start(at);
            osc.stop(end + 0.02);
        }

        return {
            get muted() { return muted; },
            setMuted(value) { muted = value; store.set("gc-muted", value ? "1" : "0"); },
            hover: () => tone(1250, 35, { gain: 0.012 }),
            click: () => { tone(620, 55, { type: "triangle", to: 880 }); },
            pop: () => tone(300, 90, { type: "triangle", to: 720, gain: 0.04 }),
            send: () => tone(520, 110, { to: 1040, gain: 0.03 }),
            receive: () => { tone(880, 70, { gain: 0.028 }); tone(660, 90, { gain: 0.028, delay: 75 }); },
            coin: () => { tone(988, 70, { type: "square", gain: 0.02 }); tone(1319, 220, { type: "square", gain: 0.02, delay: 70 }); },
            // the minion's voice: quick blips at wandering pitches
            babble: () => tone(360 + Math.random() * 380, 55, { type: "triangle", to: 300 + Math.random() * 500, gain: 0.03 }),
            boing: () => tone(180, 260, { type: "sine", to: 620, gain: 0.05 }),
        };
    })();

    let lastHover = null;
    document.addEventListener("pointerover", (event) => {
        const el = event.target.closest?.("a, button, summary");
        if (el && el !== lastHover) sfx.hover();
        lastHover = el;
    });
    document.addEventListener("click", (event) => {
        if (event.target.closest?.("a, button, summary")) sfx.click();
    });

    /* ---------- toggles ---------- */
    const ICONS = {
        // 14 x 14 pixel icons
        moon: "M6 1h4v1H8v1H7v2H6v4h1v2h1v1h2v1H6v-1H4v-1H3V9H2V5h1V3h1V2h2z",
        tv: "M4 0h1v1h1v1h2V1h1V0h1v1H9v1h4v10H1V2h4V1H4zM2 3v8h8V3zm9 1v1h1V4zm0 2v1h1V6z",
        glass: "M1 1h12v12H1zm1 1v10h5V2z",
        sound: "M6 2h2v10H6v-1H5v-1H4V9H1V5h3V4h1V3h1zm4 2h1v1h1v4h-1v1h-1V9h1V5h-1z",
        mute: "M6 2h2v10H6v-1H5v-1H4V9H1V5h3V4h1V3h1zm3 3h1v1h1V5h1v1h-1v1h1v1h-1v1h1v1h-1V9h-1v1H9V9h1V8H9V7h1V6H9z",
    };
    const icon = (name) => `<svg viewBox="0 0 14 14" aria-hidden="true"><path fill-rule="evenodd" d="${ICONS[name]}"/></svg>`;

    function buildToggles() {
        const bar = document.createElement("div");
        bar.className = "toggles";
        bar.setAttribute("role", "group");
        bar.setAttribute("aria-label", "display settings");
        const body = document.body;
        const add = (name, tip, pressed, onToggle) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "togglebutton";
            button.dataset.tip = tip;
            button.setAttribute("aria-label", tip);
            button.setAttribute("aria-pressed", String(pressed()));
            button.innerHTML = icon(typeof name === "function" ? name() : name);
            button.addEventListener("click", () => {
                onToggle();
                button.setAttribute("aria-pressed", String(pressed()));
                if (typeof name === "function") button.innerHTML = icon(name());
                document.dispatchEvent(new CustomEvent("gc:theme"));
            });
            bar.append(button);
        };
        add("moon", "dark mode", () => body.classList.contains("dark"), () => {
            store.set("gc-theme", body.classList.toggle("dark") ? "dark" : "light");
        });
        add("tv", "scanlines", () => !body.classList.contains("crt-off"), () => {
            store.set("gc-crt", body.classList.toggle("crt-off") ? "off" : "on");
        });
        add("glass", "full opacity", () => body.classList.contains("solid"), () => {
            store.set("gc-solid", body.classList.toggle("solid") ? "on" : "off");
        });
        add(() => (sfx.muted ? "mute" : "sound"), "sound", () => !sfx.muted, () => sfx.setMuted(!sfx.muted));
        body.append(bar);
    }

    /* ---------- seven-segment digits ---------- */
    const hseg = (y) => `2,${y} 3.3,${y - 1.3} 8.7,${y - 1.3} 10,${y} 8.7,${y + 1.3} 3.3,${y + 1.3}`;
    const vseg = (x, y0, y1) => `${x},${y0 + 1} ${x + 1.3},${y0 + 2.3} ${x + 1.3},${y1 - 2.3} ${x},${y1 - 1} ${x - 1.3},${y1 - 2.3} ${x - 1.3},${y0 + 2.3}`;
    const SEGMENTS = { a: hseg(1.4), g: hseg(10), d: hseg(18.6), f: vseg(1.4, 1.4, 10), b: vseg(10.6, 1.4, 10), e: vseg(1.4, 10, 18.6), c: vseg(10.6, 10, 18.6) };
    const LIT = { 0: "abcdef", 1: "bc", 2: "abged", 3: "abgcd", 4: "fgbc", 5: "afgcd", 6: "afgedc", 7: "abc", 8: "abcdefg", 9: "abfgcd", "-": "g", " ": "" };

    function segment(char) {
        if (char === ":" || char === ".") {
            const dots = char === ":" ? '<circle cx="2" cy="6" r="1.2" class="on"/><circle cx="2" cy="14" r="1.2" class="on"/>' : '<circle cx="2" cy="18.5" r="1.2" class="on"/>';
            return `<svg class="seg" viewBox="0 0 4 20">${dots}</svg>`;
        }
        const lit = LIT[char] ?? "";
        const polys = Object.entries(SEGMENTS).map(([name, points]) =>
            `<polygon data-s="${name}" points="${points}"${lit.includes(name) ? ' class="on"' : ""}/>`).join("");
        return `<svg class="seg" viewBox="0 0 12 20" style="transform:skewX(-5deg)">${polys}</svg>`;
    }

    function setDigits(el, text) {
        if (el.dataset.shown?.length !== text.length) {
            el.innerHTML = [...text].map(segment).join("");
        } else {
            [...text].forEach((char, i) => {
                if (char === el.dataset.shown[i] || char === ":") return;
                const lit = LIT[char] ?? "";
                $$("polygon", el.children[i]).forEach((p) => p.classList.toggle("on", lit.includes(p.dataset.s)));
            });
        }
        el.dataset.shown = text;
    }

    function startClock() {
        const el = $(".clock");
        if (!el) return;
        const two = (n) => String(n).padStart(2, "0");
        const tick = () => {
            const now = new Date();
            setDigits(el, `${two(now.getHours())}:${two(now.getMinutes())}:${two(now.getSeconds())}`);
            el.setAttribute("aria-label", `the time is ${two(now.getHours())}:${two(now.getMinutes())}`);
        };
        el.setAttribute("role", "img");
        tick();
        setInterval(tick, 1000);
    }

    /* ---------- calendar and countdown ---------- */
    function buildCalendar(el) {
        const year = Number(el.dataset.year), month = Number(el.dataset.month);
        const hack = (el.dataset.hack || "").split(",").map(Number);
        const first = new Date(year, month - 1, 1), days = new Date(year, month, 0).getDate();
        const today = new Date();
        const isThisMonth = today.getFullYear() === year && today.getMonth() === month - 1;
        const name = first.toLocaleString("en", { month: "long" }).toLowerCase();
        let cells = ["Su", "M", "Tu", "W", "Th", "F", "Sa"].map((d) => `<span class="dow">${d}</span>`).join("");
        cells += '<span class="blank">&nbsp;</span>'.repeat(first.getDay());
        for (let d = 1; d <= days; d++) {
            const cls = [hack.includes(d) && "hack", isThisMonth && today.getDate() === d && "today"].filter(Boolean).join(" ");
            const title = hack.includes(d) ? ` title="${el.dataset.hackLabel || "hackathon"}"` : "";
            cells += `<span${cls ? ` class="${cls}"` : ""}${title}>${d}</span>`;
        }
        const tail = (7 - ((first.getDay() + days) % 7)) % 7;
        cells += '<span class="blank">&nbsp;</span>'.repeat(tail);
        el.innerHTML = `<p class="month">${name} ${year}</p><div class="grid">${cells}</div>`;
    }

    function startCountdown(el) {
        const deadline = new Date(el.dataset.deadline).getTime();
        const two = (n) => String(n).padStart(2, "0");
        const tick = () => {
            const left = deadline - Date.now();
            if (left <= 0) {
                el.textContent = el.dataset.after || "time's up.";
                return;
            }
            const h = Math.floor(left / 3.6e6), m = Math.floor(left / 6e4) % 60, s = Math.floor(left / 1000) % 60;
            el.textContent = `${el.dataset.label || "due in"} ${h}h ${two(m)}m ${two(s)}s`;
            setTimeout(tick, 1000);
        };
        tick();
    }

    /* ---------- tooltips that follow the pointer ---------- */
    function startTooltips() {
        const tip = document.createElement("div");
        tip.className = "tip";
        tip.setAttribute("role", "tooltip");
        document.body.append(tip);
        let current = null;
        const place = (event) => {
            const x = Math.min(event.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
            const below = event.clientY + 20 + tip.offsetHeight < window.innerHeight;
            tip.style.left = `${Math.max(4, x)}px`;
            tip.style.top = `${below ? event.clientY + 20 : event.clientY - tip.offsetHeight - 10}px`;
        };
        document.addEventListener("pointerover", (event) => {
            const el = event.target.closest?.("[title], [data-tip]");
            if (el === current) return;
            current = el;
            if (!el) {
                tip.classList.remove("show");
                return;
            }
            if (el.hasAttribute("title")) {
                // take over from the browser's own tooltip
                el.dataset.tip = el.getAttribute("title");
                if (!el.getAttribute("aria-label") && !el.textContent.trim()) el.setAttribute("aria-label", el.dataset.tip);
                el.removeAttribute("title");
            }
            tip.textContent = el.dataset.tip;
            place(event);
            tip.classList.add("show");
        });
        document.addEventListener("pointermove", (event) => current && place(event), { passive: true });
        document.addEventListener("pointerdown", () => tip.classList.remove("show"));
    }

    /* ---------- copy buttons ---------- */
    function startCopy() {
        document.addEventListener("click", async (event) => {
            const button = event.target.closest?.("[data-copy]");
            if (!button) return;
            const text = button.dataset.copy || button.parentElement.querySelector("pre")?.textContent || "";
            try {
                await navigator.clipboard.writeText(text.trim());
                button.textContent = "copied";
                sfx.coin();
            } catch {
                button.textContent = "select it";
            }
            setTimeout(() => { button.textContent = "copy"; }, 1300);
        });
    }

    /* ---------- the page doll ---------- */
    const PLACES = [
        ["flow.html", "How does a split work?"],
        ["vault.html", "Is my card safe?"],
        ["stack.html", "What's under the hood?"],
        ["faq.html", "I have questions."],
        ["credits.html", "Who made this?"],
    ];
    const POKES = ["Bello!", "Hey! That tickles!", "Ba-na-na!", "No math! Only vibes!", "Split it! Split it!", "Again! Again!"];

    function startDoll() {
        const doll = $("#pagedoll"), speech = $("#speech"), canvas = $("#minion");
        if (!doll || !speech || !canvas || !window.GCMinion) return;
        const here = location.pathname.split("/").pop() || "index.html";
        const script = {
            home: {
                say: doll.dataset.greeting || "Bello! Welcome to GroupCart! I split the bill so nobody has to do math. How can I help?",
                choices: [["Take me somewhere!", "places"], ["I wanna talk!", "yap1"]],
            },
            places: {
                say: "Okay okay! Where to?",
                links: [...(here === "index.html" ? [] : [["index.html", "Take me home."]]), ...PLACES.filter(([href]) => href !== here)],
                choices: [["Nevermind.", "home"]],
            },
            yap1: {
                say: "You send me one photo of the receipt. I read every line, the tax and the tip. Then the other agents ask their own humans what they had. I never text your friends myself!",
                choices: [["Hehe, what else?", "yap2"]],
            },
            yap2: {
                say: "I am not allowed to do arithmetic. True story. The tools split everything in whole cents so it always adds up. I just deliver the news.",
                choices: [["Hehe, what else?", "yap3"]],
            },
            yap3: {
                say: "Ba-na-na! Ba-na-na! Ba-na-na! ...sorry. John and Susan both claimed the edamame and it split itself. Ba-na-na! Ba-na-na!",
                choices: [["oh.", "home"]],
            },
        };

        let timer = 0;
        const minion = window.GCMinion.mount(canvas, {
            onPoke() {
                sfx.boing();
                show({ say: POKES[Math.floor(Math.random() * POKES.length)], choices: [["Hehe.", "home"]] });
            },
        });

        function type(target, text) {
            clearTimeout(timer);
            if (still) {
                target.textContent = text;
                return;
            }
            let i = 0;
            target.textContent = "";
            minion.talk(true);
            const step = () => {
                target.textContent += text.charAt(i);
                if (i % 3 === 0 && text.charAt(i).trim()) sfx.babble();
                i += 1;
                if (i < text.length) timer = setTimeout(step, 22);
                else minion.talk(false);
            };
            step();
        }

        function show(node) {
            speech.textContent = "";
            const said = document.createElement("span");
            said.setAttribute("aria-live", "polite");
            speech.append(said);
            const choices = document.createElement("div");
            choices.className = "choices";
            for (const [href, label] of node.links || []) {
                const a = document.createElement("a");
                a.href = href;
                a.textContent = label;
                choices.append(a);
            }
            for (const [label, next] of node.choices || []) {
                const button = document.createElement("button");
                button.type = "button";
                button.textContent = label;
                button.addEventListener("click", () => show(script[next]));
                choices.append(button);
            }
            speech.append(choices);
            type(said, node.say);
        }

        show(script.home);
        window.GC.minion = minion;

        // high-fives: a local count, and a jump
        const five = $("[data-highfive]"), count = $("#fives");
        if (five && count) {
            let n = Number(store.get("gc-fives")) || 0;
            count.textContent = n;
            five.addEventListener("click", () => {
                n += 1;
                store.set("gc-fives", String(n));
                count.textContent = n;
                minion.jump();
                sfx.boing();
            });
        }
    }

    window.GC = { sfx, setDigits, still };

    function init() {
        buildToggles();
        startClock();
        $$(".digits[data-digits]").forEach((el) => {
            setDigits(el, el.dataset.digits);
            el.setAttribute("role", "img");
            el.setAttribute("aria-label", el.dataset.digits.trim());
        });
        $$(".calendar[data-month]").forEach(buildCalendar);
        $$(".countdown[data-deadline]").forEach(startCountdown);
        startTooltips();
        startCopy();
        startDoll();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();
