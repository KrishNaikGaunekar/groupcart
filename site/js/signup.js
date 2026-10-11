/* "get your agent": name, phone and invite code in; the number to text out.
   Talks to the signup endpoint in app/split/signup.py. On the deployed site that
   is /api (vercel.json forwards it to the backend). To point a local copy
   somewhere else:  localStorage.setItem("gc-api", "http://localhost:8787")  */
(() => {
    "use strict";

    function start() {
        const form = document.getElementById("signup");
        if (!form) return;
        const status = document.getElementById("signup-status");
        const result = document.getElementById("signup-result");
        const button = form.querySelector("button[type=submit]");
        let api = "/api";
        try { api = localStorage.getItem("gc-api") || api; } catch { /* private mode */ }
        const sfx = window.GC?.sfx;
        const minion = () => window.GC?.minion;
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

        const say = (text, mood = "") => {
            status.textContent = text;
            status.dataset.mood = mood;
        };

        async function call(path, body) {
            const response = await fetch(api + path, body
                ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
                : { headers: { accept: "application/json" } });
            const type = response.headers.get("content-type") || "";
            // anything that is not our JSON means there is no backend behind this copy of the site
            if (!type.includes("json")) throw new Error("no backend");
            return { status: response.status, data: await response.json() };
        }

        // "+16287896827" -> "+1 (628) 789-6827"; anything else is shown as it came
        const pretty = (number) => number.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "+1 ($1) $2-$3");

        function show(data) {
            const number = data.agent_number;
            result.querySelector("[data-name]").textContent = data.name;
            result.querySelector("[data-number]").textContent = pretty(number);
            // "?&body=" is the one spelling both iOS and Android accept
            result.querySelector("[data-sms]").href = `sms:${number}?&body=${encodeURIComponent(`hi, i'm ${data.name}`)}`;
            result.querySelector("[data-vcard]").onclick = () => {
                const card = ["BEGIN:VCARD", "VERSION:3.0", "N:;Minion;;;", "FN:Minion", "ORG:GroupCart",
                    `TEL;TYPE=CELL:${number}`, "NOTE:Your GroupCart agent. Text it a photo of the receipt.", "END:VCARD"].join("\r\n");
                const link = document.createElement("a");
                link.href = URL.createObjectURL(new Blob([card], { type: "text/vcard" }));
                link.download = "minion.vcf";
                link.click();
                setTimeout(() => URL.revokeObjectURL(link.href), 2000);
            };
            form.hidden = true;
            result.hidden = false;
            say(data.known ? "you already had one. here it is again." : "done. your agent is waiting.", "good");
            sfx?.coin();
            minion()?.poke("dance");
        }

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const body = Object.fromEntries(new FormData(form));
            if (!body.name.trim() || !body.phone.trim() || !body.code.trim()) {
                say("name, phone and invite code, please.", "bad");
                return;
            }
            button.disabled = true;
            say("asking the phone line...");
            minion()?.talk(true);
            try {
                // Photon can take a few seconds to hand out a number; ask again until it has one
                for (let attempt = 0; attempt < 12; attempt++) {
                    const { status: code, data } = await call("/signup", body);
                    if (code === 200) return show(data);
                    if (code !== 202) {
                        say(data.error || "that did not work. try again.", "bad");
                        minion()?.poke("dizzy");
                        return undefined;
                    }
                    say("you are registered. waiting for your number...");
                    await wait(3000);
                }
                say("you are registered, but the number is taking a while. try again in a minute.", "bad");
            } catch {
                say("the agents cannot be reached from here right now.", "bad");
            } finally {
                button.disabled = false;
                minion()?.talk(false);
            }
            return undefined;
        });

        // is anyone home? this is also how the page shows it is connected to the backend
        call("/health").then(({ data }) => {
            if (data.signups === "open") say("the line is open.", "good");
            else say("the agents are up, but signups are closed for now.");
        }).catch(() => say("the agents cannot be reached from here right now.", "bad"));
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
})();
