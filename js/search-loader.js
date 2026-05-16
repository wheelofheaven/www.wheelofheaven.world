// Lazy-loads the full search bundle (Fuse.js + index fetcher + modal UI)
// on first user intent — focus / click / ⌘+/ chord. Falls back to an
// idle-time prefetch so the first query feels instant for users who
// linger on a page. The full bundle is ~30 KB minified; this stub is
// tiny and runs synchronously on every page.
(function () {
    let scriptInjected = false;

    function loadSearchBundle() {
        if (scriptInjected) return;
        scriptInjected = true;
        const s = document.createElement("script");
        s.src = "/js/dist/search.bundle.js?v=3";
        s.async = true;
        // When the bundle finishes loading, re-fire focus on the input
        // if the user is already there, so the modal opens without a
        // second click.
        s.onload = function () {
            const input = document.querySelector(".navbar__search-input");
            if (input && document.activeElement === input) {
                input.dispatchEvent(new Event("focus"));
            }
        };
        document.head.appendChild(s);
    }

    const input = document.querySelector(".navbar__search-input");
    if (input) {
        ["focus", "click", "input"].forEach(function (evt) {
            input.addEventListener(evt, loadSearchBundle, { once: false });
        });
    }

    // Global ⌘/ or Ctrl+/ chord — same as in search.js, kept here so the
    // shortcut works before the bundle has loaded.
    document.addEventListener("keydown", function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key === "/") {
            loadSearchBundle();
        }
    });

    // Opportunistic prefetch on idle so the first interaction is instant.
    if ("requestIdleCallback" in window) {
        requestIdleCallback(loadSearchBundle, { timeout: 5000 });
    } else {
        setTimeout(loadSearchBundle, 4000);
    }
})();
