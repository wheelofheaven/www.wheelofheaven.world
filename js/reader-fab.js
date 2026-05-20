// Mobile reader options FAB — bottom-right floating action button that
// expands into a glassmorphic panel of reader-context options. Hidden
// on >=1000px via CSS (the navbar exposes the same affordances there).
//
// Responsibilities:
//   • Toggle open/close + cross-fade icon
//   • Detect `.library-book` / `.wiki__sidebar` / `.article` to set
//     the context (`data-context="book" | "wiki" | "article"`) —
//     controls which slots show
//   • Track scroll → reading-progress % (book pages only)
//   • Build the secondary TOC sheet on first open by cloning the
//     sidebar's chapter list (library) or heading list (wiki)
//   • Delegate theme + font + bookmarks + metadata scroll to existing
//     globals/buttons; mirror the sidebar Interlinear toggle for books
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
        const wikiSidebar = document.querySelector(".wiki__sidebar");
        const articleEl = document.querySelector(".article");
        const timelineEl = document.querySelector(".timeline-page");
        const isBookPage = !!bookEl;
        const isWikiPage = !!wikiSidebar && !isBookPage;
        const isArticlePage = !!articleEl && !isBookPage && !isWikiPage;
        const isTimelinePage = !!timelineEl && !isBookPage && !isWikiPage && !isArticlePage;

        if (isBookPage) fab.setAttribute("data-context", "book");
        else if (isWikiPage) fab.setAttribute("data-context", "wiki");
        else if (isArticlePage) fab.setAttribute("data-context", "article");
        else if (isTimelinePage) fab.setAttribute("data-context", "timeline");

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

        // Stop ALL clicks inside the panel from bubbling out to the
        // document handler below. Without this, certain taps inside the
        // panel (notably A− / A+ on iOS) bubble in a way that trips the
        // outside-close check and dismisses the menu mid-tap. Buttons
        // that intentionally close the panel call setExpanded(false)
        // themselves.
        panel.addEventListener("click", function (e) {
            e.stopPropagation();
        });

        // Click outside collapses the panel.
        document.addEventListener("click", function (e) {
            if (fab.getAttribute("data-state") !== "expanded") return;
            if (fab.contains(e.target)) return;
            setExpanded(false);
        });

        // Esc collapses (and dismisses the TOC sheet first if open).
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
        // Call LibraryReader.setFontSize directly rather than dispatching
        // a click on the sidebar button — a bubbled click on an element
        // outside `.reader-fab` would trip the outside-click handler and
        // close the panel mid-tap.
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
            if (window.LibraryReader && typeof window.LibraryReader.setFontSize === "function") {
                window.LibraryReader.setFontSize(next);
            }
        }

        const decBtn = panel.querySelector('[data-action="font-decrease"]');
        const incBtn = panel.querySelector('[data-action="font-increase"]');
        if (decBtn) decBtn.addEventListener("click", function () { stepFontSize(-1); });
        if (incBtn) incBtn.addEventListener("click", function () { stepFontSize(+1); });

        // ── Interlinear toggle (book pages only) ────────────────────
        // The original `#interlinear-toggle` button lives in the
        // book's sidebar. From the FAB we just defer to its global
        // `toggleInterlinear()` and mirror the resulting state — same
        // pattern as the font controls below.
        const interlinearBtn = panel.querySelector('[data-action="interlinear"]');
        function syncInterlinearState() {
            if (!interlinearBtn || !bookEl) return;
            const on = bookEl.classList.contains("library-book--interlinear");
            interlinearBtn.setAttribute("aria-pressed", on ? "true" : "false");
            interlinearBtn.classList.toggle("reader-fab__option--active", on);
        }
        if (interlinearBtn && isBookPage) {
            syncInterlinearState();
            interlinearBtn.addEventListener("click", function () {
                if (typeof window.toggleInterlinear === "function") {
                    window.toggleInterlinear();
                }
                syncInterlinearState();
            });
        }

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

        // ── Metadata jump ───────────────────────────────────────────
        // On mobile the sidebar (page meta, claim badge, infobox, TOC,
        // study tools, etc.) stacks below the article. The Metadata
        // option scrolls the reader straight to the top of that block
        // without forcing them to skim past everything else.
        //
        // Uses window.scrollTo with a computed offset rather than
        // scrollIntoView, both to land below the fixed navbar (so the
        // sidebar header isn't hidden behind it) and because Safari's
        // scrollIntoView smooth behavior has historically been flaky.
        const metadataBtn = panel.querySelector('[data-action="metadata"]');
        if (metadataBtn) {
            metadataBtn.addEventListener("click", function () {
                setExpanded(false);
                const target =
                    document.querySelector(".library-book__sidebar") ||
                    document.querySelector(".wiki__sidebar");
                if (!target) return;
                // Navbar pill is ~64px + 8px top inset → offset by 80px
                // so the sidebar header clears the floating navbar.
                const NAVBAR_CLEARANCE = 80;
                const top = target.getBoundingClientRect().top + window.scrollY - NAVBAR_CLEARANCE;
                window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
            });
        }

        // ── TOC sheet ───────────────────────────────────────────────
        // Built on first open by cloning the sidebar's heading/chapter
        // list, so changes there flow through automatically. Works for
        // both book pages (.library-book__toc-list) and wiki pages
        // (.wiki__toc-list — flat list of section headings).
        let tocBuilt = false;

        function buildToc() {
            if (tocBuilt || !tocList) return;

            if (isBookPage) {
                const source = document.querySelector(".library-book__toc-list");
                if (!source) return;
                source.querySelectorAll(".library-book__toc-item").forEach(function (item) {
                    const link = item.querySelector(".library-book__toc-link");
                    if (!link) return;
                    const num = item.querySelector(".library-book__toc-chapter-number");
                    const title = item.querySelector(".library-book__toc-chapter-title");
                    tocList.appendChild(buildTocLi({
                        href: link.getAttribute("href") || "#",
                        chapter: item.dataset.chapter || "",
                        num: num ? num.textContent.trim() : "",
                        title: title ? title.textContent.trim() : "",
                        onActivate: function (chRaw) {
                            const ch = parseInt(chRaw, 10);
                            if (!isNaN(ch) && typeof window.scrollToChapter === "function") {
                                window.scrollToChapter(ch);
                                return true;
                            }
                            return false;
                        }
                    }));
                });
            } else if (isWikiPage) {
                const source = document.querySelector(".wiki__toc-list, .wiki__toc-nav");
                if (!source) return;
                source.querySelectorAll(".wiki__toc-link").forEach(function (link, idx) {
                    tocList.appendChild(buildTocLi({
                        href: link.getAttribute("href") || "#",
                        chapter: String(idx + 1),
                        num: "",
                        title: link.textContent.trim(),
                        onActivate: null
                    }));
                });
            }
            tocBuilt = true;
        }

        function buildTocLi(opts) {
            const li = document.createElement("li");
            li.className = "reader-fab-toc__item";

            const a = document.createElement("a");
            a.className = "reader-fab-toc__link";
            a.href = opts.href;
            if (opts.chapter) a.dataset.chapter = opts.chapter;

            if (opts.num) {
                const span = document.createElement("span");
                span.className = "reader-fab-toc__chapter-number";
                span.textContent = opts.num;
                a.appendChild(span);
            }
            if (opts.title) {
                const span = document.createElement("span");
                span.className = "reader-fab-toc__chapter-title";
                span.textContent = opts.title;
                a.appendChild(span);
            }

            a.addEventListener("click", function (e) {
                e.preventDefault();
                closeToc();
                if (opts.onActivate && opts.onActivate(a.dataset.chapter)) return;
                if (a.hash) {
                    const target = document.querySelector(a.hash);
                    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
                }
            });

            li.appendChild(a);
            return li;
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
            const activeItem = document.querySelector(
                ".library-book__toc-item--active, .wiki__toc-link--active"
            );
            const activeCh = activeItem && activeItem.dataset && activeItem.dataset.chapter;
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
