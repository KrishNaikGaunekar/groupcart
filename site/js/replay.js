/* The dinner, replayed: the split from scripts/demo_cli.sh as three screens
   (Bob's phone, the agents' room, John's phone), driven by the little player.
   Texts written by the tools are quoted as app/split/flow.py writes them, with
   the amounts splitter.py gives for this receipt. Lines marked `loose` are the
   agent's own wording, which changes run to run. */
(() => {
    "use strict";

    const ITEMS = "1. California Roll $8.50\n2. Dr Pepper $3.00\n3. Spicy Ramen $16.00\n4. Edamame $6.00\n5. Salmon Nigiri $14.00\n6. 2× Sapporo $14.00\n7. Chicken Katsu $15.00";

    const SCENES = [
        {
            view: "bob", title: "bob sends the receipt", stamp: "Bob ↔ Bob's agent · iMessage",
            msgs: [
                { from: "me", photo: true, text: "just had dinner with John, Susan and Charlie. i had the california roll and the dr pepper" },
                { from: "them", loose: true, text: "got it: sushi nikko, $97.05 with tax and tip. the split is open and the other agents are asking john, susan and charlie what they had." },
            ],
        },
        {
            view: "room", title: "the agents' room opens", stamp: "TAB-7K2Q · Sushi Nikko · $97.05 · collecting",
            msgs: [
                { from: "room", who: "Bob's agent", text: `🧾 Sushi Nikko — $97.05. Bob paid it, so everyone here owes Bob.\n${ITEMS}\ntax $5.55 · tip $15.00\nBob had: California Roll, Dr Pepper.\nAgents: ask your people what they had.  [receipt attached]` },
            ],
        },
        {
            view: "john", title: "john's agent asks john", stamp: "John ↔ John's agent · iMessage",
            msgs: [
                { from: "them", photo: true, text: `hey John! Bob covered Sushi Nikko ($97.05) and added you to the split.\nwhat did you have?\n${ITEMS}\ntext me back and i'll work out your share, tax and tip included.` },
                { from: "me", text: "i had the spicy ramen, one of the sapporos, and split the edamame with susan" },
                { from: "them", loose: true, text: "noted! your share comes once susan and charlie answer." },
            ],
        },
        {
            view: "room", title: "the answers come in", stamp: "TAB-7K2Q · Sushi Nikko · $97.05 · collecting",
            msgs: [
                { from: "room", who: "John's agent", text: "John had: Spicy Ramen, 1 of 2 Sapporo, Edamame." },
                { from: "room", who: "Susan's agent", text: "Susan had: Salmon Nigiri, Edamame." },
                { from: "room", who: "Charlie's agent", text: "Charlie had: Chicken Katsu, 1 of 2 Sapporo." },
                { from: "room", who: "Bob's agent", text: "Shares are in: Bob's own share is $14.59; John owes $32.99; Susan owes $21.56; Charlie owes $27.91." },
            ],
        },
        {
            view: "john", title: "john gets his number", stamp: "John ↔ John's agent · iMessage",
            msgs: [
                { from: "them", text: "Sushi Nikko: you owe Bob $32.99\n· Spicy Ramen $16.00\n· ½ Edamame $3.00\n· 1 of 2 Sapporo $7.00\ntax $1.89 · tip $5.10\nVenmo: https://venmo.com/bob-pays?txn=pay&amount=32.99&note=Sushi%20Nikko%20TAB-7K2Q\nor reply \"pay\" and i'll send it from your Capital One account." },
                { from: "me", text: "pay" },
                { from: "them", loose: true, text: "done. $32.99 went from your capital one account to bob." },
            ],
        },
        {
            view: "bob", title: "bob gets paid back", stamp: "Bob ↔ Bob's agent · iMessage",
            msgs: [
                { from: "them", text: "Sushi Nikko is split ✅\nBob's own share is $14.59\nJohn owes $32.99\nSusan owes $21.56\nCharlie owes $27.91\ni'll tell you as people pay." },
                { from: "them", text: "💸 John paid you $32.99 for Sushi Nikko from their Capital One account." },
                { from: "them", text: "💸 Susan paid you $21.56 for Sushi Nikko by venmo (their word)." },
                { from: "them", text: "💸 Charlie paid you $27.91 for Sushi Nikko from their Capital One account." },
                { from: "them", text: "everyone's paid up for Sushi Nikko 🎉" },
            ],
        },
        {
            view: "room", title: "all square", stamp: "TAB-7K2Q · Sushi Nikko · $97.05 · settled",
            msgs: [
                { from: "room", who: "John's agent", text: "John paid $32.99 from their Capital One account." },
                { from: "room", who: "Susan's agent", text: "Susan paid $21.56 by venmo (their word)." },
                { from: "room", who: "Charlie's agent", text: "Charlie paid $27.91 from their Capital One account." },
                { from: "room", who: "Bob's agent", text: "All square on Sushi Nikko." },
            ],
        },
    ];

    const ICON = {
        play: '<svg viewBox="0 0 14 14"><path d="M3 1.5v11l9-5.5z"/></svg>',
        pause: '<svg viewBox="0 0 14 14"><path d="M3 2h3v10H3zm5 0h3v10H8z"/></svg>',
    };

    function start() {
        const thread = document.getElementById("thread"), player = document.getElementById("player");
        if (!thread || !player) return;
        const sfx = window.GC?.sfx, still = window.GC?.still;
        const tabs = [...document.querySelectorAll(".phone-tabs [data-view]")];
        const now = player.querySelector("#now"), pos = player.querySelector("#pos"), rate = player.querySelector("#rate");
        const seek = player.querySelector("#seek"), playButton = player.querySelector(".w-play");
        const SPEEDS = [0.5, 1, 2, 4];
        const state = { scene: 0, playing: false, speed: 1, run: 0, touched: false };

        seek.max = SCENES.length - 1;

        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms / SPEEDS[state.speed]));

        function bubble(message) {
            const el = document.createElement("div");
            el.className = `msg ${message.from}`;
            if (message.photo) {
                const img = document.createElement("img");
                img.className = "photo";
                img.src = "assets/img/receipt.png";
                img.alt = "photo of the Sushi Nikko receipt";
                el.append(img);
            }
            if (message.who) {
                const who = document.createElement("b");
                who.textContent = `${message.who}:`;
                el.append(who);
            }
            el.append(document.createTextNode(message.text));
            if (message.loose) el.dataset.tip = "the agent's own words; these change from run to run";
            return el;
        }

        function push(el) {
            thread.append(el);
            thread.scrollTop = thread.scrollHeight;
            return el;
        }

        function paint() {
            const scene = SCENES[state.scene];
            tabs.forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.view === scene.view)));
            now.textContent = `now playing: ${scene.title}`;
            // restart the marquee so a new title scrolls in from the edge
            now.style.animation = "none";
            void now.offsetWidth;
            now.style.animation = "";
            pos.textContent = `${state.scene + 1}/${SCENES.length}`;
            rate.textContent = `${SPEEDS[state.speed]}×`;
            seek.value = state.scene;
            playButton.innerHTML = state.playing ? ICON.pause : ICON.play;
            playButton.setAttribute("aria-label", state.playing ? "pause" : "play");
        }

        function header(scene) {
            thread.textContent = "";
            const stamp = document.createElement("div");
            stamp.className = "stamp";
            stamp.textContent = scene.stamp;
            thread.append(stamp);
        }

        /* Show a whole scene at once (paused, or reduced motion). */
        function show(index) {
            state.run += 1;
            state.scene = index;
            const scene = SCENES[index];
            header(scene);
            scene.msgs.forEach((m) => thread.append(bubble(m)));
            thread.scrollTop = 0;
            paint();
        }

        /* Play a scene message by message, then move on. */
        async function play(index) {
            const run = ++state.run;
            state.scene = index;
            const scene = SCENES[index];
            header(scene);
            paint();
            for (const message of scene.msgs) {
                if (message.from === "me") {
                    await wait(650);
                } else {
                    const dots = document.createElement("div");
                    dots.className = `msg typing ${message.from === "room" ? "them" : message.from}`;
                    dots.innerHTML = "<i></i><i></i><i></i>";
                    push(dots);
                    await wait(800);
                    dots.remove();
                }
                if (run !== state.run) return;
                push(bubble(message));
                if (message.from === "me") sfx?.send(); else sfx?.receive();
                await wait(Math.min(900 + message.text.length * 16, 4200));
                if (run !== state.run) return;
            }
            await wait(900);
            if (run !== state.run || !state.playing) return;
            if (index < SCENES.length - 1) {
                play(index + 1);
            } else {
                state.playing = false;
                paint();
            }
        }

        function go(index, { keepPlaying = state.playing } = {}) {
            const next = Math.max(0, Math.min(SCENES.length - 1, index));
            state.playing = keepPlaying;
            if (state.playing) play(next); else show(next);
        }

        player.addEventListener("click", (event) => {
            const button = event.target.closest("button[data-act]");
            if (!button) return;
            state.touched = true;
            const act = button.dataset.act;
            if (act === "play") {
                if (state.playing) {
                    state.playing = false;
                    show(state.scene);
                } else {
                    state.playing = true;
                    play(state.scene === SCENES.length - 1 ? 0 : state.scene);
                }
            } else if (act === "prev") go(state.scene - 1);
            else if (act === "next") go(state.scene + 1);
            else if (act === "restart") go(0, { keepPlaying: true });
            else if (act === "room") go(SCENES.findIndex((sc, i) => sc.view === "room" && i > state.scene) >= 0
                ? SCENES.findIndex((sc, i) => sc.view === "room" && i > state.scene) : 1);
            else if (act === "shuffle") go(Math.floor(Math.random() * SCENES.length));
            else if (act === "faster" || act === "slower") {
                state.speed = Math.max(0, Math.min(SPEEDS.length - 1, state.speed + (act === "faster" ? 1 : -1)));
                paint();
            }
        });
        seek.addEventListener("input", () => {
            state.touched = true;
            go(Number(seek.value));
        });
        tabs.forEach((tab) => tab.addEventListener("click", () => {
            state.touched = true;
            const after = SCENES.findIndex((sc, i) => sc.view === tab.dataset.view && i > state.scene);
            go(after >= 0 ? after : SCENES.findIndex((sc) => sc.view === tab.dataset.view));
        }));

        show(0);
        // start by itself the first time it scrolls into view, unless someone took the controls
        if (!still && "IntersectionObserver" in window) {
            const seen = new IntersectionObserver(([entry]) => {
                if (!entry.isIntersecting || state.touched) return;
                seen.disconnect();
                state.playing = true;
                play(0);
            }, { threshold: 0.6 });
            seen.observe(thread);
        }
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
})();
