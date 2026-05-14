/**
 * Prefetch - Preload pages on hover for instant navigation
 *
 * Prefetches internal links when user hovers for 100ms,
 * making subsequent page loads feel instant.
 */
(function() {
  'use strict';

  const prefetched = new Set();
  let hoverTimer = null;

  // Respect user preferences
  function shouldPrefetch() {
    // Don't prefetch if user has data saver enabled
    if (navigator.connection) {
      if (navigator.connection.saveData) return false;
      // Don't prefetch on slow connections
      if (navigator.connection.effectiveType === '2g') return false;
    }
    return true;
  }

  // Check if link is prefetchable
  function isPrefetchable(anchor) {
    const href = anchor.href;

    // Skip if already prefetched
    if (prefetched.has(href)) return false;

    // Skip external links
    if (anchor.origin !== window.location.origin) return false;

    // Skip hash links on same page
    if (anchor.pathname === window.location.pathname && anchor.hash) return false;

    // Skip non-http(s) links
    if (!href.startsWith('http')) return false;

    // Skip links with download attribute
    if (anchor.hasAttribute('download')) return false;

    // Skip links that open in new tab
    if (anchor.target === '_blank') return false;

    return true;
  }

  // Prefetch a URL
  function prefetch(url) {
    if (prefetched.has(url)) return;

    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = url;
    link.as = 'document';
    document.head.appendChild(link);

    prefetched.add(url);
  }

  // Handle mouse enter on links
  function onMouseEnter(event) {
    if (!shouldPrefetch()) return;

    const anchor = event.target.closest('a[href]');
    if (!anchor || !isPrefetchable(anchor)) return;

    // Wait 100ms before prefetching (avoid accidental hovers)
    hoverTimer = setTimeout(() => {
      prefetch(anchor.href);
    }, 100);
  }

  // Handle mouse leave - cancel pending prefetch
  function onMouseLeave(event) {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
  }

  // Initialize
  function init() {
    // Use event delegation on document body
    document.body.addEventListener('mouseenter', onMouseEnter, true);
    document.body.addEventListener('mouseleave', onMouseLeave, true);

    // Also prefetch on touchstart for mobile (immediate, no delay)
    document.body.addEventListener('touchstart', function(event) {
      if (!shouldPrefetch()) return;
      const anchor = event.target.closest('a[href]');
      if (anchor && isPrefetchable(anchor)) {
        prefetch(anchor.href);
      }
    }, { passive: true });
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
