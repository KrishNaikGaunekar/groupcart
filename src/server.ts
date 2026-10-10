// Small HTTP server: mock payment pages (when Stripe isn't configured) + state API for the dashboard.
// OWNER: payments/dashboard worktree.
import { createServer } from "node:http";
import { allSpaces } from "./store.js";
import { markMockPaid } from "./tools/payments.js";

const page = (body: string) =>
  `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><body style="font-family:system-ui;max-width:420px;margin:40px auto;padding:0 16px">${body}</body>`;

export function startServer(port = Number(process.env.PORT ?? 3000)) {
  createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const pay = url.pathname.match(/^\/pay\/([\w-]+)$/);
    if (pay && req.method === "POST") {
      markMockPaid(pay[1]);
      res.writeHead(303, { location: "/paid" }).end();
    } else if (pay) {
      const p = allSpaces().flatMap((s) => s.cart.payments).find((x) => x.externalId === pay[1]);
      res.writeHead(200, { "content-type": "text/html" }).end(
        page(`<h2>GroupCart</h2><p>Your share: <b>$${p?.amount.toFixed(2) ?? "?"}</b></p>
        <form method=post><button style="font-size:18px;padding:12px 24px">Pay (demo)</button></form>`),
      );
    } else if (url.pathname === "/paid") {
      res.writeHead(200, { "content-type": "text/html" }).end(page("<h2>Paid ✅</h2><p>You can go back to iMessage.</p>"));
    } else if (url.pathname === "/api/state") {
      res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" }).end(JSON.stringify(allSpaces()));
    } else {
      res.writeHead(404).end("not found");
    }
  }).listen(port, () => console.log(`http on :${port}`));
}
