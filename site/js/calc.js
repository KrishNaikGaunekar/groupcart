/* The calculator on the split page. Click who had what on the sample receipt
   and the shares update, computed by splitter.js: the same rules, in the same
   integer cents, as the agents use. */
(() => {
    "use strict";

    function start() {
        const root = document.getElementById("calc");
        if (!root || !window.GCSplit) return;
        const { compute, fmt, toCents, frac } = window.GCSplit;

        const PEOPLE = [
            { handle: "bob", name: "Bob", colour: "#2f8cf5" },
            { handle: "john", name: "John", colour: "#5fa56e" },
            { handle: "susan", name: "Susan", colour: "#a48ec2" },
            { handle: "charlie", name: "Charlie", colour: "#d9962f" },
        ];
        const PAYER = "bob";
        const ITEMS = [
            { id: 1, label: "California Roll", cents: 850, qty: 1 },
            { id: 2, label: "Dr Pepper", cents: 300, qty: 1 },
            { id: 3, label: "Spicy Ramen", cents: 1600, qty: 1 },
            { id: 4, label: "Edamame", cents: 600, qty: 1 },
            { id: 5, label: "Salmon Nigiri", cents: 1400, qty: 1 },
            { id: 6, label: "Sapporo", cents: 1400, qty: 2 },
            { id: 7, label: "Chicken Katsu", cents: 1500, qty: 1 },
        ];
        // what each person said at the real dinner: item id -> { handle: how many }
        const DINNER = { 1: { bob: 1 }, 2: { bob: 1 }, 3: { john: 1 }, 4: { john: 1, susan: 1 }, 5: { susan: 1 }, 6: { john: 1, charlie: 1 }, 7: { charlie: 1 } };
        const copy = (counts) => Object.fromEntries(Object.entries(counts).map(([id, who]) => [id, { ...who }]));

        const state = { counts: copy(DINNER), tax: 555, tip: 1500, unclaimed: "even", last: {} };
        const sfx = window.GC?.sfx;

        root.innerHTML = `
            <table class="calc-items">
                <thead><tr><th>item</th><th class="price">price</th><th class="who">who had it</th></tr></thead>
                <tbody>
                    ${ITEMS.map((item) => `
                    <tr data-item="${item.id}">
                        <td>${item.qty > 1 ? `${item.qty}× ` : ""}${item.label}</td>
                        <td class="price">${fmt(item.cents)}</td>
                        <td class="who">${PEOPLE.map((p) => `<button type="button" class="chip" data-who="${p.handle}" style="--person:${p.colour}">${p.name[0]}</button>`).join("")}</td>
                    </tr>`).join("")}
                    <tr><td>Tax</td><td class="price"><input id="calc-tax" value="5.55" inputmode="decimal" aria-label="tax in dollars"></td><td class="who small muted">follows the items</td></tr>
                    <tr><td>Tip</td><td class="price"><input id="calc-tip" value="15.00" inputmode="decimal" aria-label="tip in dollars"></td><td class="who small muted">follows the items</td></tr>
                </tbody>
            </table>
            <div class="calc-options">
                <span class="small">nobody claimed it?</span>
                <button type="button" class="togglebutton" data-unclaimed="even">split evenly</button>
                <button type="button" class="togglebutton" data-unclaimed="payer">bob absorbs it</button>
            </div>
            <div class="calc-options">
                <button type="button" class="togglebutton" data-preset="dinner">the real dinner</button>
                <button type="button" class="togglebutton" data-preset="clear">clear</button>
                <button type="button" class="togglebutton" data-preset="even">everyone shares everything</button>
            </div>
            <div class="shares" aria-live="polite"></div>
            <p class="checksum"></p>`;

        const sharesEl = root.querySelector(".shares"), checksum = root.querySelector(".checksum");

        function claims() {
            const out = [];
            for (const item of ITEMS) {
                for (const person of PEOPLE) {
                    const count = state.counts[item.id]?.[person.handle] || 0;
                    if (!count) continue;
                    // a multi-quantity line is claimed by count, which is a stated portion of it
                    out.push({ item: item.id, handle: person.handle, portion: item.qty > 1 ? frac(count, item.qty) : null });
                }
            }
            return out;
        }

        function render() {
            for (const row of root.querySelectorAll("tr[data-item]")) {
                const item = ITEMS.find((i) => i.id === Number(row.dataset.item));
                for (const chip of row.querySelectorAll(".chip")) {
                    const person = PEOPLE.find((p) => p.handle === chip.dataset.who);
                    const count = state.counts[item.id]?.[person.handle] || 0;
                    chip.setAttribute("aria-pressed", String(count > 0));
                    chip.setAttribute("aria-label", count
                        ? `${person.name} had ${item.qty > 1 ? `${count} of the ${item.qty} ` : "the "}${item.label}`
                        : `${person.name} did not have the ${item.label}`);
                    chip.innerHTML = person.name[0] + (item.qty > 1 && count ? `<sup>${count}</sup>` : "");
                }
            }
            for (const button of root.querySelectorAll("[data-unclaimed]")) {
                button.setAttribute("aria-pressed", String(button.dataset.unclaimed === state.unclaimed));
            }

            const result = compute(ITEMS, PEOPLE.map((p) => p.handle), claims(), { tax: state.tax, tip: state.tip },
                { payer: PAYER, unclaimed: state.unclaimed });
            const bill = ITEMS.reduce((sum, i) => sum + i.cents, 0) + state.tax + state.tip;

            sharesEl.innerHTML = result.shares.map((share) => {
                const person = PEOPLE.find((p) => p.handle === share.handle);
                const role = share.handle === PAYER ? "paid the bill; this is his own share" : (share.total ? "owes Bob" : "owes nothing");
                const lines = share.lines.map(([label, cents]) => `<li><span>${label}</span><span>${fmt(cents)}</span></li>`).join("");
                return `
                    <article class="share${state.last[share.handle] !== undefined && state.last[share.handle] !== share.total ? " flash" : ""}" style="--person:${person.colour}">
                        <header><span>${person.name}</span><strong>${fmt(share.total)}</strong></header>
                        <div class="small muted">${role}</div>
                        <ul>${lines || '<li><span class="muted">nothing claimed</span><span></span></li>'}
                            <li class="extra"><span>tax ${fmt(share.tax)} · tip ${fmt(share.tip)}</span><span></span></li>
                        </ul>
                    </article>`;
            }).join("");
            result.shares.forEach((share) => { state.last[share.handle] = share.total; });

            const sum = result.shares.map((s) => fmt(s.total)).join(" + ");
            checksum.textContent = result.total === bill
                ? `${sum} = ${fmt(bill)}. every cent accounted for.`
                : `${sum} = ${fmt(result.total)}, but the bill is ${fmt(bill)}. that is a bug; tell us.`;
        }

        root.addEventListener("click", (event) => {
            const chip = event.target.closest(".chip");
            if (chip) {
                const item = ITEMS.find((i) => i.id === Number(chip.closest("tr").dataset.item));
                const mine = (state.counts[item.id] ??= {});
                mine[chip.dataset.who] = ((mine[chip.dataset.who] || 0) + 1) % (item.qty + 1);
                sfx?.pop();
                render();
                return;
            }
            const policy = event.target.closest("[data-unclaimed]");
            if (policy) {
                state.unclaimed = policy.dataset.unclaimed;
                render();
                return;
            }
            const preset = event.target.closest("[data-preset]")?.dataset.preset;
            if (!preset) return;
            if (preset === "dinner") state.counts = copy(DINNER);
            else if (preset === "clear") state.counts = {};
            else state.counts = Object.fromEntries(ITEMS.map((item) => [item.id, Object.fromEntries(PEOPLE.map((p) => [p.handle, 1]))]));
            render();
        });

        for (const [id, key] of [["calc-tax", "tax"], ["calc-tip", "tip"]]) {
            const input = root.querySelector(`#${id}`);
            input.addEventListener("input", () => {
                const cents = toCents(input.value);
                const ok = cents !== null && cents >= 0;
                input.setAttribute("aria-invalid", String(!ok));
                if (!ok) return;
                state[key] = cents;
                render();
            });
        }

        render();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
})();
