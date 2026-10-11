"""The calculator on the site must give the same cents as the agents.

Runs site/js/splitter.js under node against app/split/splitter.py, on the
sample dinner and on random bills. Skipped when node is not installed.

    python3 -m unittest discover -s site/tests
"""
from __future__ import annotations

import json
import random
import shutil
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "app"))

from split.splitter import Charges, Claim, Item, compute  # noqa: E402

PORT = ROOT / "site" / "js" / "splitter.js"
RUNNER = """
const split = require(process.argv[1]);
let input = "";
process.stdin.on("data", (chunk) => { input += chunk; }).on("end", () => {
    const out = JSON.parse(input).map((c) => {
        const claims = c.claims.map(([item, handle, n, d]) => ({ item, handle, portion: n == null ? null : split.frac(n, d) }));
        const result = split.compute(c.items, c.members, claims, c.charges, { payer: c.payer, unclaimed: c.unclaimed });
        return result.shares.map((s) => [s.handle, s.lines, s.tax, s.tip, s.fees, s.discount, s.total]);
    });
    process.stdout.write(JSON.stringify(out));
});
"""

DINNER = {
    "items": [
        {"id": 1, "label": "California Roll", "cents": 850, "qty": 1},
        {"id": 2, "label": "Dr Pepper", "cents": 300, "qty": 1},
        {"id": 3, "label": "Spicy Ramen", "cents": 1600, "qty": 1},
        {"id": 4, "label": "Edamame", "cents": 600, "qty": 1},
        {"id": 5, "label": "Salmon Nigiri", "cents": 1400, "qty": 1},
        {"id": 6, "label": "Sapporo", "cents": 1400, "qty": 2},
        {"id": 7, "label": "Chicken Katsu", "cents": 1500, "qty": 1},
    ],
    "members": ["bob", "john", "susan", "charlie"],
    "claims": [[1, "bob", None, None], [2, "bob", None, None], [3, "john", None, None], [6, "john", 1, 2],
               [4, "john", None, None], [5, "susan", None, None], [4, "susan", None, None],
               [7, "charlie", None, None], [6, "charlie", 1, 2]],
    "charges": {"tax": 555, "tip": 1500, "fees": 0, "discount": 0},
    "payer": "bob",
    "unclaimed": "even",
}


def random_case(rng: random.Random) -> dict:
    members = [f"p{i}" for i in range(rng.randint(1, 5))]
    items = [{"id": i + 1, "label": f"item {i + 1}", "cents": rng.randint(1, 6000), "qty": rng.choice([1, 1, 1, 2, 3])}
             for i in range(rng.randint(1, 8))]
    claims = []
    for item in items:
        for handle in rng.sample(members, rng.randint(0, len(members))):
            kind = rng.random()
            if kind < 0.55:
                claims.append([item["id"], handle, None, None])
            elif item["qty"] > 1 and kind < 0.8:
                claims.append([item["id"], handle, rng.randint(1, item["qty"]), item["qty"]])
            else:
                den = rng.choice([2, 3, 4, 5, 8, 10])
                claims.append([item["id"], handle, rng.randint(1, den), den])
    return {
        "items": items, "members": members, "claims": claims,
        "charges": {"tax": rng.randint(0, 900), "tip": rng.randint(0, 2500), "fees": rng.choice([0, 0, 199, -37]),
                    "discount": rng.choice([0, 0, 500])},
        "payer": members[0], "unclaimed": rng.choice(["even", "payer"]),
    }


def expected(case: dict) -> list:
    result = compute(
        [Item(i["id"], i["label"], i["cents"], i["qty"]) for i in case["items"]],
        case["members"],
        [Claim(item, handle, None if n is None else n / d) for item, handle, n, d in case["claims"]],
        Charges(case["charges"]["tax"], case["charges"]["tip"], case["charges"]["fees"], case["charges"]["discount"]),
        payer=case["payer"], unclaimed=case["unclaimed"],
    )
    return [[h, [list(line) for line in s.lines], s.tax_cents, s.tip_cents, s.fees_cents, s.discount_cents, s.total_cents]
            for h, s in result.shares.items()]


@unittest.skipUnless(shutil.which("node"), "node is not installed")
class SplitterPortTest(unittest.TestCase):
    def run_port(self, cases: list[dict]) -> list:
        done = subprocess.run(["node", "-e", RUNNER, str(PORT)], input=json.dumps(cases), capture_output=True,
                              text=True, timeout=60)
        self.assertEqual(done.returncode, 0, done.stderr)
        return json.loads(done.stdout)

    def test_sample_dinner(self):
        (shares,) = self.run_port([DINNER])
        self.assertEqual(shares, expected(DINNER))
        self.assertEqual({s[0]: s[-1] for s in shares}, {"bob": 1459, "john": 3299, "susan": 2156, "charlie": 2791})
        self.assertEqual(sum(s[-1] for s in shares), 9705)

    def test_random_bills_match_python(self):
        rng = random.Random(20261010)
        cases = [random_case(rng) for _ in range(400)]
        for case, got in zip(cases, self.run_port(cases)):
            self.assertEqual(got, expected(case), case)


if __name__ == "__main__":
    unittest.main()
