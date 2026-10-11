/* The share math, ported from app/split/splitter.py and money.py so the
   calculator on the site gives the same cents the agents do. Integer cents and
   exact fractions throughout; no floating point touches an amount.
   site/tests/test_splitter_port.py checks this file against the Python. */
(function (root) {
    "use strict";

    const UNCLAIMED = "__unclaimed__";

    /* ---- exact fractions over plain integers ---- */
    const gcd = (a, b) => {
        a = Math.abs(a); b = Math.abs(b);
        while (b) [a, b] = [b, a % b];
        return a || 1;
    };
    const frac = (n, d = 1) => {
        if (d < 0) { n = -n; d = -d; }
        const g = gcd(n, d);
        return { n: n / g, d: d / g };
    };
    const asFrac = (v) => (typeof v === "number" ? frac(v) : v);
    const add = (a, b) => frac(a.n * b.d + b.n * a.d, a.d * b.d);
    const sub = (a, b) => frac(a.n * b.d - b.n * a.d, a.d * b.d);
    const div = (a, b) => frac(a.n * b.d, a.d * b.n);
    const cmp = (a, b) => a.n * b.d - b.n * a.d;
    const ZERO = frac(0), ONE = frac(1);

    function fmt(cents) {
        const abs = Math.abs(cents);
        return `${cents < 0 ? "-" : ""}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
    }

    /* "$1,234.50" -> 123450, rounding half up like the Python. Returns null if it is not an amount. */
    function toCents(value) {
        const text = String(value ?? "").replace(/[$,\s]/g, "");
        if (text === "") return 0;
        const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(text);
        if (!match || (match[2] === "" && !match[3])) return null;
        const digits = (match[3] || "").padEnd(3, "0");
        const cents = Number(match[2] || 0) * 100 + Number(digits.slice(0, 2)) + (digits[2] >= "5" ? 1 : 0);
        return match[1] ? -cents : cents;
    }

    /* Split total across keys in proportion to weights. Largest-remainder
       rounding: the parts always sum to total, ties go to the earlier key. */
    function allocate(total, weights) {
        const keys = weights.map(([key]) => key);
        if (!keys.length) return new Map();
        let w = weights.map(([, weight]) => asFrac(weight));
        if (cmp(w.reduce(add, ZERO), ZERO) <= 0) w = keys.map(() => ONE);
        const den = w.reduce((lcm, f) => (lcm / gcd(lcm, f.d)) * f.d, 1);
        const ints = w.map((f) => f.n * (den / f.d));
        const sum = ints.reduce((a, b) => a + b, 0);
        const rem = ints.map((i) => (((total * i) % sum) + sum) % sum);
        const out = ints.map((i, k) => (total * i - rem[k]) / sum);
        const leftover = total - out.reduce((a, b) => a + b, 0);
        keys.map((_, k) => k).sort((a, b) => rem[b] - rem[a] || a - b).slice(0, leftover).forEach((k) => { out[k] += 1; });
        return new Map(keys.map((key, k) => [key, out[k]]));
    }

    /* Fraction of one item per claimant; UNCLAIMED holds what nobody took. */
    function itemFractions(claims) {
        let stated = new Map();
        const open = [];
        for (const claim of claims) {
            if (claim.portion == null) {
                if (!open.includes(claim.handle) && !stated.has(claim.handle)) open.push(claim.handle);
            } else {
                let portion = asFrac(claim.portion);
                if (cmp(portion, ZERO) < 0) portion = ZERO;
                if (cmp(portion, ONE) > 0) portion = ONE;
                stated.set(claim.handle, add(stated.get(claim.handle) || ZERO, portion));
            }
        }
        stated = new Map([...stated].filter(([, f]) => cmp(f, ZERO) > 0));
        const taken = [...stated.values()].reduce(add, ZERO);

        if (open.length && cmp(taken, ONE) >= 0) {
            // the stated portions already cover the item, yet someone else claimed it too
            const weights = new Map(stated);
            open.forEach((h) => weights.set(h, ONE));
            const total = [...weights.values()].reduce(add, ZERO);
            return new Map([...weights].map(([h, f]) => [h, div(f, total)]));
        }
        if (cmp(taken, ONE) > 0) return new Map([...stated].map(([h, f]) => [h, div(f, taken)]));

        const out = new Map(stated);
        const left = sub(ONE, taken);
        if (open.length) open.forEach((h) => out.set(h, div(left, frac(open.length))));
        else if (cmp(left, ZERO) > 0) out.set(UNCLAIMED, left);
        return out;
    }

    /* "Edamame", "½ Edamame", or "1 of 2 Sapporo" for a multi-quantity line. */
    function portionLabel(label, fraction, qty = 1) {
        const f = asFrac(fraction);
        if (qty > 1) {
            if (cmp(f, ONE) >= 0) return `${qty} ${label}`;
            const units = frac(f.n * qty, f.d);
            if (units.d === 1) return `${units.n} of ${qty} ${label}`;
            label = `${qty} ${label}`;
        }
        if (cmp(f, ONE) >= 0) return label;
        const nice = { "1/2": "½", "1/3": "⅓", "2/3": "⅔", "1/4": "¼", "3/4": "¾" }[`${f.n}/${f.d}`];
        if (nice) return `${nice} ${label}`;
        // whole percent, ties to even, which is what Python's ":.0%" prints
        const rem = (f.n * 100) % f.d;
        let percent = (f.n * 100 - rem) / f.d;
        if (rem * 2 > f.d || (rem * 2 === f.d && percent % 2)) percent += 1;
        return `${percent}% ${label}`;
    }

    /* items: [{id, label, cents, qty}], members: [handle], claims: [{item, handle, portion}],
       charges: {tax, tip, fees, discount} in cents. Returns shares in member order. */
    function compute(items, members, claims, charges = {}, { payer = null, unclaimed = "even" } = {}) {
        if (!members.length) throw new Error("a split needs at least one member");
        const shares = new Map(members.map((handle) => [handle, { handle, lines: [], items: 0, tax: 0, tip: 0, fees: 0, discount: 0, total: 0 }]));
        const pool = [];

        for (const item of items) {
            const mine = claims.filter((c) => c.item === item.id && shares.has(c.handle));
            const fractions = mine.length ? itemFractions(mine) : new Map([[UNCLAIMED, ONE]]);
            for (const [who, cents] of allocate(item.cents, [...fractions])) {
                const label = portionLabel(item.label, fractions.get(who), item.qty || 1);
                if (who === UNCLAIMED) {
                    if (cents) pool.push([label, cents]);
                } else if (cents || cmp(fractions.get(who), ZERO) > 0) {
                    shares.get(who).lines.push([label, cents]);
                    shares.get(who).items += cents;
                }
            }
        }

        for (const [label, cents] of pool) {
            if (unclaimed === "payer" && shares.has(payer)) {
                shares.get(payer).lines.push([`${label} (unclaimed)`, cents]);
                shares.get(payer).items += cents;
                continue;
            }
            for (const [who, part] of allocate(cents, members.map((h) => [h, 1]))) {
                if (!part) continue;
                shares.get(who).lines.push([`${label} (split ${members.length} ways)`, part]);
                shares.get(who).items += part;
            }
        }

        const basis = members.map((h) => [h, shares.get(h).items]);
        for (const key of ["tax", "tip", "fees", "discount"]) {
            for (const [who, part] of allocate(charges[key] || 0, basis)) shares.get(who)[key] = part;
        }
        for (const share of shares.values()) share.total = share.items + share.tax + share.tip + share.fees - share.discount;
        return { shares: [...shares.values()], unclaimed: pool, total: [...shares.values()].reduce((sum, s) => sum + s.total, 0) };
    }

    const api = { compute, allocate, portionLabel, fmt, toCents, frac };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.GCSplit = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
