/* The intake demo on the vault page: the same text, as the person sent it and as
   the model receives it. It plays a fixed script with the published test card
   number; there is nowhere to type a real one. */
(() => {
    "use strict";

    const SCRIPT = [
        { from: "me", text: "can you order this for me on amazon?" },
        { from: "them", text: "sure. which sites may i use your card on?" },
        { from: "me", text: "just amazon.com" },
        { from: "them", text: "ok. text me the card number, expiry and security code in one message." },
        { from: "me", card: true, text: "4242 4242 4242 4242 exp 12/29 cvc 123" },
        { from: "them", after: true, text: "your visa ending 4242 is locked in the vault for amazon.com. just for you, or a group order to split first?" },
    ];
    const NOTE = "their Visa ending 4242 is locked in the vault for amazon.com";

    function start() {
        const sent = document.getElementById("intake-sent"), seen = document.getElementById("intake-seen");
        const gate = document.getElementById("intake-gate"), button = document.getElementById("intake-play");
        if (!sent || !seen || !gate || !button) return;
        const sfx = window.GC?.sfx, still = window.GC?.still;
        let run = 0;

        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, still ? 0 : ms));
        const bubble = (cls, text) => {
            const el = document.createElement("div");
            el.className = `msg ${cls}`;
            el.textContent = text;
            return el;
        };
        const clear = () => [sent, seen].forEach((pane) => pane.querySelectorAll(".msg").forEach((m) => m.remove()));

        async function play() {
            const mine = ++run;
            clear();
            button.disabled = true;
            for (const line of SCRIPT) {
                await wait(line.from === "me" ? 700 : 900);
                if (mine !== run) return;
                sent.append(bubble(line.from, line.text));
                if (line.from === "me") sfx?.send(); else sfx?.receive();
                if (line.card) {
                    // the gateway hook takes the text before the agent runs
                    gate.classList.add("busy");
                    await wait(1200);
                    gate.classList.remove("busy");
                    if (mine !== run) return;
                    const note = bubble("room", "");
                    const tag = document.createElement("b");
                    tag.textContent = "note from the vault:";
                    note.append(tag, document.createTextNode(NOTE));
                    seen.append(note);
                    sfx?.coin();
                } else {
                    seen.append(bubble(line.from, line.text));
                }
            }
            button.disabled = false;
            button.textContent = "send it again";
        }

        button.addEventListener("click", play);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
})();
