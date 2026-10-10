// Small HTTP server: state API for the live dashboard.
// OWNER: payments/dashboard worktree.
import { createServer } from "node:http";
import { allSpaces } from "./store.js";

const page = (body: string) =>
  `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><body style="font-family:system-ui;max-width:420px;margin:40px auto;padding:0 16px">${body}</body>`;

export function startServer(port = Number(process.env.PORT ?? 3000)) {
  createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/api/state") {
      res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" }).end(JSON.stringify(allSpaces()));
    } else {
      res.writeHead(404).end("not found");
    }
  }).listen(port, () => console.log(`http on :${port}`));
}
