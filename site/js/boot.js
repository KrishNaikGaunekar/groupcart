/* Loaded synchronously as the first thing in <body>, before anything paints:
   restores the saved toggles and puts up the loading screen. Without JavaScript
   neither happens and the page simply shows. */
(() => {
    "use strict";
    const read = (key) => {
        try { return localStorage.getItem(key); } catch { return null; }
    };
    const body = document.body;
    if (read("gc-theme") === "dark") body.classList.add("dark");
    if (read("gc-crt") === "off") body.classList.add("crt-off");
    if (read("gc-solid") === "on") body.classList.add("solid");

    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        const loading = document.createElement("div");
        loading.className = "loading";
        loading.id = "loading";
        loading.innerHTML = '<div class="card">loading...</div>';
        body.prepend(loading);
        const started = performance.now();
        const finish = () => setTimeout(() => {
            loading.classList.add("done");
            setTimeout(() => loading.remove(), 700);
        }, Math.max(0, 450 - (performance.now() - started)));
        window.addEventListener("load", finish, { once: true });
        setTimeout(finish, 4000);
    }
})();
