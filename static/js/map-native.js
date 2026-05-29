(function () {
    "use strict";

    const root = document.querySelector("[data-map-root]");
    if (!root) return;

    const stage = document.getElementById("map-stage");
    const fullscreenBtn = document.getElementById("map-fullscreen-btn");
    const printBtn = document.getElementById("map-print-btn");
    const filterButtons = root.querySelectorAll(".map-toolbar__chip[data-map-filter]");
    const interactiveItems = root.querySelectorAll("[data-map-title]");
    const ageItems = root.querySelectorAll("[data-map-age]");
    const nodeItems = root.querySelectorAll("[data-node-id]");
    const panelTitle = root.querySelector("[data-map-panel-title]");
    const panelMeta = root.querySelector("[data-map-panel-meta]");
    const panelSummary = root.querySelector("[data-map-panel-summary]");
    const panelLink = root.querySelector("[data-map-panel-link]");

    function itemHref(item) {
        const href = item.getAttribute("href");
        if (href) return href;
        const nested = item.querySelector("a[href]");
        return nested ? nested.getAttribute("href") : "#";
    }

    function setPanel(item) {
        if (!item || !panelTitle || !panelSummary || !panelLink) return;

        panelTitle.textContent = item.dataset.mapTitle || "Map";
        panelSummary.textContent = item.dataset.mapSummary || "";
        if (panelMeta) panelMeta.textContent = item.dataset.mapMeta || "";
        panelLink.href = itemHref(item);
    }

    function setActiveAge(ageId, sourceItem) {
        if (!ageId) return;

        root.dataset.activeAge = ageId;

        ageItems.forEach((item) => {
            item.classList.toggle("is-active", item.dataset.mapAge === ageId);
        });

        nodeItems.forEach((item) => {
            const related = item.dataset.nodeAge === ageId || item.dataset.nodeAge === "core";
            item.classList.toggle("is-related", related);
        });

        if (sourceItem) setPanel(sourceItem);
    }

    function setActiveNode(node) {
        if (!node) return;

        const ageId = node.dataset.nodeAge;
        if (ageId && ageId !== "core") {
            setActiveAge(ageId, node);
        } else {
            nodeItems.forEach((item) => {
                item.classList.toggle("is-related", item.dataset.nodeAge === "core");
            });
            setPanel(node);
        }

        nodeItems.forEach((item) => {
            item.classList.toggle("is-selected", item === node);
        });
    }

    function setFilter(filter) {
        root.dataset.mapFilter = filter;

        filterButtons.forEach((button) => {
            const active = button.dataset.mapFilter === filter;
            button.classList.toggle("map-toolbar__chip--active", active);
            button.setAttribute("aria-pressed", active ? "true" : "false");
        });

        nodeItems.forEach((node) => {
            const visible =
                filter === "all" ||
                node.dataset.nodeType === filter ||
                (filter === "timeline" && node.dataset.nodeType === "timeline");
            node.classList.toggle("is-filtered-out", !visible);
        });
    }

    interactiveItems.forEach((item) => {
        item.addEventListener("mouseenter", () => {
            if (item.dataset.nodeId) setActiveNode(item);
            else if (item.dataset.mapAge) setActiveAge(item.dataset.mapAge, item);
        });

        item.addEventListener("focus", () => {
            if (item.dataset.nodeId) setActiveNode(item);
            else if (item.dataset.mapAge) setActiveAge(item.dataset.mapAge, item);
        });
    });

    filterButtons.forEach((button) => {
        button.addEventListener("click", () => setFilter(button.dataset.mapFilter || "all"));
    });

    if (fullscreenBtn && stage) {
        fullscreenBtn.addEventListener("click", () => {
            const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement;
            if (fullscreenElement) {
                if (document.exitFullscreen) document.exitFullscreen();
                else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
            } else if (root.requestFullscreen) {
                root.requestFullscreen();
            } else if (root.webkitRequestFullscreen) {
                root.webkitRequestFullscreen();
            }
        });

        const handleFullscreenChange = () => {
            const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
            root.classList.toggle("is-fullscreen", isFullscreen);
        };

        document.addEventListener("fullscreenchange", handleFullscreenChange);
        document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    }

    if (printBtn) {
        printBtn.addEventListener("click", () => window.print());
    }

    function selectorValue(value) {
        if (window.CSS && CSS.escape) return CSS.escape(value);
        return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
    }

    function activateFromHash() {
        const hash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
        if (!hash) return false;

        const node = root.querySelector('[data-node-id="' + selectorValue(hash) + '"]');
        if (node) {
            setActiveNode(node);
            node.scrollIntoView({ block: "center", inline: "center" });
            return true;
        }

        const age = root.querySelector('[data-map-age="' + selectorValue(hash) + '"]');
        if (age) {
            setActiveAge(hash, age);
            age.scrollIntoView({ block: "center", inline: "center" });
            return true;
        }

        return false;
    }

    function centerStageHorizontally() {
        if (!stage) return;

        const maxScrollLeft = stage.scrollWidth - stage.clientWidth;
        if (maxScrollLeft > 0) {
            stage.scrollLeft = maxScrollLeft / 2;
        }
    }

    function scheduleStageCenter() {
        requestAnimationFrame(() => {
            requestAnimationFrame(centerStageHorizontally);
        });
        window.setTimeout(centerStageHorizontally, 120);
        window.setTimeout(centerStageHorizontally, 360);
    }

    const defaultAge = root.dataset.activeAge || "age-of-aquarius";
    const defaultAgeItem = root.querySelector('.map-age[data-map-age="' + defaultAge + '"]');
    if (defaultAgeItem) setActiveAge(defaultAge, defaultAgeItem);

    if (!activateFromHash()) scheduleStageCenter();
    window.addEventListener("load", scheduleStageCenter, { once: true });
    window.addEventListener("resize", scheduleStageCenter);
    window.addEventListener("hashchange", activateFromHash);
})();
