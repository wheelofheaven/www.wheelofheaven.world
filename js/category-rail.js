// Category-rail interactions:
//   1. Prev/next buttons scroll the track by one tile-width + gap.
//   2. Buttons disable themselves at the start/end of the track.
//   3. Optional: data-rail-jump="<group-id>" links scroll to a
//      collapsible category-group, opening it if closed.

(function () {
    'use strict';

    function initRail(rail) {
        const track = rail.querySelector('.category-rail__track');
        const prevBtn = rail.querySelector('.category-rail__nav-btn[data-direction="prev"]');
        const nextBtn = rail.querySelector('.category-rail__nav-btn[data-direction="next"]');
        if (!track) return;

        function tileStep() {
            const tile = track.querySelector('.category-rail__tile');
            if (!tile) return 240;
            const styles = getComputedStyle(track);
            const gap = parseFloat(styles.columnGap || styles.gap || '0');
            return tile.getBoundingClientRect().width + gap;
        }

        function updateNav() {
            if (!prevBtn || !nextBtn) return;
            const max = track.scrollWidth - track.clientWidth - 1;
            prevBtn.disabled = track.scrollLeft <= 0;
            nextBtn.disabled = track.scrollLeft >= max;
        }

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                track.scrollBy({ left: -tileStep(), behavior: 'smooth' });
            });
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                track.scrollBy({ left: tileStep(), behavior: 'smooth' });
            });
        }

        track.addEventListener('scroll', updateNav, { passive: true });
        window.addEventListener('resize', updateNav);
        updateNav();
    }

    function initJumps() {
        document.querySelectorAll('[data-rail-jump]').forEach((tile) => {
            tile.addEventListener('click', (event) => {
                const targetId = tile.dataset.railJump;
                const target = document.getElementById(targetId);
                if (!target) return;
                event.preventDefault();
                const details = target.querySelector('details');
                if (details && !details.open) details.setAttribute('open', '');
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        });
    }

    // For tiles with data-rail-filter, set the named <select> element to
    // data-rail-filter-value and dispatch a change event so any wired
    // filter-callback re-runs. Then scroll the filter into view.
    function initFilters() {
        document.querySelectorAll('[data-rail-filter]').forEach((tile) => {
            tile.addEventListener('click', (event) => {
                const targetId = tile.dataset.railFilter;
                const value = tile.dataset.railFilterValue || '';
                const target = document.getElementById(targetId);
                if (!target) return;
                event.preventDefault();
                target.value = value;
                target.dispatchEvent(new Event('change', { bubbles: true }));
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('.category-rail').forEach(initRail);
        initJumps();
        initFilters();
    });
})();
