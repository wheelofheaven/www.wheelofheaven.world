// Mobile reader options FAB — bottom-right floating action button that
// expands into a glassmorphic panel of reader-context options. Hidden
// on >=1000px via CSS (the navbar exposes the same affordances there).
//
// Responsibilities:
//   • Toggle open/close + cross-fade icon
//   • Tie back-to-top into the same scroll-position visibility as
//     the legacy .to-top — FAB stays visible (it's the menu surface)
//     but the "Back to top" option grays out when already at the top
//   • Detect `.library-book` to enable book-context slots
//   • Track scroll → reading-progress percentage
//   • Build the secondary TOC sheet on first open by cloning
//     `.library-book__toc-list` from the sidebar
//   • Delegate theme + font + bookmarks to existing globals/buttons
(function () {
    "use strict";

    document.addEventListener("DOMContentLoaded", function () {
        const fab = document.getElementById("readerFab");
        const toggle = document.getElementById("readerFabToggle");
        const panel = document.getElementById("readerFabPanel");
        if (!fab || !toggle || !panel) return;

        const tocSheet = document.getElementById("readerFabToc");
        const tocList = document.getElementById("readerFabTocList");
        const progressEl = fab.querySelector("[data-reader-fab-progress]");
        const bookEl = document.querySelector(".library-book");
        const isBookPage = !!bookEl;

        if (isBookPage) fab.setAttribute("data-context", "book");

        // ── Open / close ────────────────────────────────────────────
        function setExpanded(open) {
            fab.setAttribute("data-state", open ? "expanded" : "collapsed");
            toggle.setAttribute("aria-expanded", String(open));
            panel.setAttribute("aria-hidden", String(!open));
        }

        toggle.addEventListener("click", function (e) {
            e.stopPropagation();
            setExpanded(fab.getAttribute("data-state") !== "expanded");
        });

        // Click outside collapses the panel.
        document.addEventListener("click", function (e) {
            if (fab.getAttribute("data-state") !== "expanded") return;
            if (fab.contains(e.target)) return;
            setExpanded(false);
        });

        // Esc collapses.
        document.addEventListener("keydown", function (e) {
            if (e.key !== "Escape") return;
            if (tocSheet && tocSheet.classList.contains("reader-fab-toc--open")) {
                closeToc();
                return;
            }
            if (fab.getAttribute("data-state") === "expanded") setExpanded(false);
        });

        // ── Reading progress ────────────────────────────────────────
        function updateProgress() {
            if (!progressEl) return;
            const doc = document.documentElement;
            const scrollTop = window.scrollY || doc.scrollTop;
            const viewport = window.innerHeight;
            const scrollable = Math.max(1, doc.scrollHeight - viewport);
            const pct = Math.min(100, Math.max(0, Math.round((scrollTop / scrollable) * 100)));
            progressEl.textContent = pct + "%";
        }

        if (isBookPage) {
            updateProgress();
            let ticking = false;
            window.addEventListener("scroll", function () {
                if (ticking) return;
                ticking = true;
                requestAnimationFrame(function () {
                    updateProgress();
                    ticking = false;
                });
            }, { passive: true });
        }

        // ── Theme toggle ────────────────────────────────────────────
        const themeBtn = panel.querySelector('[data-action="theme"]');
        const moonIcon = panel.querySelector('[data-theme-icon="dark"]');
        const sunIcon = panel.querySelector('[data-theme-icon="light"]');

        function syncThemeIcon() {
            const theme = document.documentElement.getAttribute("data-theme") || "dark";
            const isLight = theme === "light";
            if (moonIcon) moonIcon.hidden = isLight;
            if (sunIcon) sunIcon.hidden = !isLight;
        }
        syncThemeIcon();

        if (themeBtn) {
            themeBtn.addEventListener("click", function () {
                const current = document.documentElement.getAttribute("data-theme") || "dark";
                const next = current === "light" ? "dark" : "light";
                document.documentElement.setAttribute("data-theme", next);
                try { localStorage.setItem("theme", next); } catch (e) {}
                syncThemeIcon();
            });
        }

        // ── Back to top ─────────────────────────────────────────────
        const topBtn = panel.querySelector('[data-action="to-top"]');
        if (topBtn) {
            topBtn.addEventListener("click", function () {
                window.scrollTo({ top: 0, behavior: "smooth" });
                setExpanded(false);
            });
        }

        // ── Font size (book pages only) ─────────────────────────────
        // Delegates to the existing in-sidebar buttons (data-font-size=
        // small|medium|large|x-large) so persistence + actual font
        // application stay in one place (library-reader.js).
        const fontSizes = ["small", "medium", "large", "x-large"];

        function currentFontSize() {
            const content = document.querySelector(".library-book__content");
            const fromDataset = content && content.dataset.fontSize;
            if (fromDataset && fontSizes.indexOf(fromDataset) >= 0) return fromDataset;
            return "medium";
        }

        function stepFontSize(delta) {
            const cur = currentFontSize();
            const idx = Math.max(0, Math.min(fontSizes.length - 1, fontSizes.indexOf(cur) + delta));
            const next = fontSizes[idx];
            const btn = document.querySelector('[data-font-size="' + next + '"]');
            if (btn) btn.click();
        }

        const decBtn = panel.querySelector('[data-action="font-decrease"]');
        const incBtn = panel.querySelector('[data-action="font-increase"]');
        if (decBtn) decBtn.addEventListener("click", function () { stepFontSize(-1); });
        if (incBtn) incBtn.addEventListener("click", function () { stepFontSize(+1); });

        // ── Bookmarks shortcut ──────────────────────────────────────
        const bookmarksBtn = panel.querySelector('[data-action="bookmarks"]');
        if (bookmarksBtn) {
            bookmarksBtn.addEventListener("click", function () {
                setExpanded(false);
                if (window.LibraryStudyTools && typeof window.LibraryStudyTools.openPanel === "function") {
                    window.LibraryStudyTools.openPanel();
                } else if (window.LibraryStudyTools && typeof window.LibraryStudyTools.togglePanel === "function") {
                    window.LibraryStudyTools.togglePanel();
                }
            });
        }

        // ── TOC sheet ───────────────────────────────────────────────
        // Built on first open by cloning the sidebar's chapter list, so
        // changes there (titles, ordering) flow through automatically.
        let tocBuilt = false;

        function buildToc() {
            if (tocBuilt || !tocList) return;
            const source = document.querySelector(".library-book__toc-list");
            if (!source) return;
            const items = source.querySelectorAll(".library-book__toc-item");
            const frag = document.createDocumentFragment();
            items.forEach(function (item) {
                const link = item.querySelector(".library-book__toc-link");
                if (!link) return;
                const num = item.querySelector(".library-book__toc-chapter-number");
                const title = item.querySelector(".library-book__toc-chapter-title");

                const li = document.createElement("li");
                li.className = "reader-fab-toc__item";

                const a = document.createElement("a");
                a.className = "reader-fab-toc__link";
                a.href = link.getAttribute("href") || "#";
                a.dataset.chapter = item.dataset.chapter || "";

                if (num) {
                    const span = document.createElement("span");
                    span.className = "reader-fab-toc__chapter-number";
                    span.textContent = num.textContent.trim();
                    a.appendChild(span);
                }
                if (title) {
                    const span = document.createElement("span");
                    span.className = "reader-fab-toc__chapter-title";
                    span.textContent = title.textContent.trim();
                    a.appendChild(span);
                }

                a.addEventListener("click", function (e) {
                    e.preventDefault();
                    const ch = parseInt(a.dataset.chapter, 10);
                    closeToc();
                    if (!isNaN(ch) && typeof window.scrollToChapter === "function") {
                        window.scrollToChapter(ch);
                    } else if (a.hash) {
                        const target = document.querySelector(a.hash);
                        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
                    }
                });

                li.appendChild(a);
                frag.appendChild(li);
            });
            tocList.appendChild(frag);
            tocBuilt = true;
        }

        function openToc() {
            if (!tocSheet) return;
            buildToc();
            tocSheet.classList.add("reader-fab-toc--open");
            tocSheet.setAttribute("aria-hidden", "false");
            highlightActiveTocItem();
        }

        function closeToc() {
            if (!tocSheet) return;
            tocSheet.classList.remove("reader-fab-toc--open");
            tocSheet.setAttribute("aria-hidden", "true");
        }

        function highlightActiveTocItem() {
            if (!tocList) return;
            const activeItem = document.querySelector(".library-book__toc-item--active");
            const activeCh = activeItem && activeItem.dataset.chapter;
            tocList.querySelectorAll(".reader-fab-toc__link").forEach(function (a) {
                a.classList.toggle("reader-fab-toc__link--active", a.dataset.chapter === activeCh);
            });
        }

        const tocBtn = panel.querySelector('[data-action="toc"]');
        if (tocBtn) {
            tocBtn.addEventListener("click", function () {
                setExpanded(false);
                openToc();
            });
        }

        if (tocSheet) {
            tocSheet.querySelectorAll("[data-reader-fab-toc-close]").forEach(function (el) {
                el.addEventListener("click", closeToc);
            });
        }
    });
})();
