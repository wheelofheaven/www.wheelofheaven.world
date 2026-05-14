// Table of Contents Scroll Spy
// Highlights the current section in the TOC as user scrolls

(function () {
  "use strict";

  const CONFIG = {
    ROOT_MARGIN: "-80px 0px -60% 0px",
    THRESHOLD: 0,
    ACTIVE_CLASS: "wiki__toc-link--active",
    TOC_SELECTOR: ".wiki__toc-nav",
    HEADING_SELECTOR: "h1[id], h2[id], h3[id], h4[id]",
    // Watch the whole article so Read Next (rendered outside .wiki__content,
    // inside .related-content) also triggers TOC highlighting.
    CONTENT_SELECTOR: ".wiki__article",
  };

  class TocScrollSpy {
    constructor() {
      this.tocNav = document.querySelector(CONFIG.TOC_SELECTOR);
      this.contentArea = document.querySelector(CONFIG.CONTENT_SELECTOR);

      if (!this.tocNav || !this.contentArea) {
        return;
      }

      this.tocLinks = this.tocNav.querySelectorAll("a[href^='#']");
      this.headings = this.contentArea.querySelectorAll(
        CONFIG.HEADING_SELECTOR,
      );

      if (this.tocLinks.length === 0 || this.headings.length === 0) {
        return;
      }

      this.init();
    }

    init() {
      this.createObserver();
      this.observeHeadings();
      this.bindTocClicks();
    }

    createObserver() {
      this.observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              this.setActiveLink(entry.target.id);
            }
          });
        },
        {
          rootMargin: CONFIG.ROOT_MARGIN,
          threshold: CONFIG.THRESHOLD,
        },
      );
    }

    observeHeadings() {
      this.headings.forEach((heading) => {
        if (heading.id) {
          this.observer.observe(heading);
        }
      });
    }

    setActiveLink(headingId) {
      // Remove active class from all links
      this.tocLinks.forEach((link) => {
        link.classList.remove(CONFIG.ACTIVE_CLASS);
      });

      // Find and activate the matching link
      const activeLink = this.tocNav.querySelector(`a[href="#${headingId}"]`);
      if (activeLink) {
        activeLink.classList.add(CONFIG.ACTIVE_CLASS);

        // Scroll TOC to keep active link visible (for long TOCs)
        this.scrollTocToView(activeLink);
      }
    }

    scrollTocToView(activeLink) {
      const tocContainer = this.tocNav;
      const linkRect = activeLink.getBoundingClientRect();
      const containerRect = tocContainer.getBoundingClientRect();

      // Only scroll within the TOC container itself. `scrollIntoView` would
      // bubble up to the document and yank the page during normal reading
      // — especially on mobile where the TOC is in document flow rather
      // than a sticky sidebar.
      if (linkRect.top < containerRect.top || linkRect.bottom > containerRect.bottom) {
        const delta =
          (linkRect.top + linkRect.height / 2) -
          (containerRect.top + containerRect.height / 2);
        tocContainer.scrollBy({ top: delta, behavior: "smooth" });
      }
    }

    bindTocClicks() {
      // Smooth scroll when clicking TOC links
      this.tocLinks.forEach((link) => {
        link.addEventListener("click", (e) => {
          e.preventDefault();
          const targetId = link.getAttribute("href").slice(1);
          const targetElement = document.getElementById(targetId);

          if (targetElement) {
            // Calculate offset for fixed navbar
            const navbarHeight = 80;
            const elementPosition = targetElement.getBoundingClientRect().top;
            const offsetPosition =
              elementPosition + window.pageYOffset - navbarHeight;

            window.scrollTo({
              top: offsetPosition,
              behavior: "smooth",
            });

            // Update active state immediately
            this.setActiveLink(targetId);

            // Update URL hash without jumping
            history.pushState(null, null, `#${targetId}`);
          }
        });
      });
    }

    destroy() {
      if (this.observer) {
        this.observer.disconnect();
      }
    }
  }

  // Initialize when DOM is ready
  document.addEventListener("DOMContentLoaded", () => {
    // Only initialize on wiki pages
    if (document.querySelector(".wiki")) {
      window.tocScrollSpy = new TocScrollSpy();
    }
  });
})();
