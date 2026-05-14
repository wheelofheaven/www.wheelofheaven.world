// Configuration constants
const CONFIG = {
  MOBILE_BREAKPOINT: 999,
  SCROLL_THRESHOLD: 100,
  SCROLL_DELTA_MIN: 5,
  SCROLL_END_DELAY: 150,
  ANIMATION_DELAY: 150,
  DEBOUNCE_DELAY: 100,
  COOKIE_DAYS: 365,
};

// Helper function for mobile detection
const isMobile = () => window.innerWidth <= CONFIG.MOBILE_BREAKPOINT;

document.addEventListener("DOMContentLoaded", () => {
  const navbar = document.querySelector(".navbar");
  const mobileNavToggle = document.getElementById("mobileNavToggle");
  const mobileSearchToggle = document.getElementById("mobileSearchToggle");
  const navbarSearchInput = document.querySelector(".navbar__search-input");

  let isMobileNavExpanded = false;
  let isMobileSearchActive = false;
  let lastScrollY = window.scrollY;
  let ticking = false;
  let isUserScrolling = false;
  let scrollEndTimer = null;

  // 🔁 Function to update all theme icons
  function updateThemeIcons(isLight) {
    document.querySelectorAll(".navbar__theme-icon").forEach((icon) => {
      icon.classList.toggle("navbar__theme-icon--light", isLight);
    });
  }

  // 📱 Mobile navbar scroll behavior with throttling
  function updateNavbarVisibility() {
    // Don't process scroll events when mobile menu is open (body is locked)
    if (isMobileNavExpanded) {
      ticking = false;
      return;
    }

    const currentScrollY = window.scrollY;

    if (isMobile() && navbar) {
      const scrollDelta = Math.abs(currentScrollY - lastScrollY);

      // Only react to significant scroll movements
      if (scrollDelta > CONFIG.SCROLL_DELTA_MIN) {
        if (currentScrollY > lastScrollY && currentScrollY > CONFIG.SCROLL_THRESHOLD) {
          // Scrolling down - hide navbar
          navbar.classList.add("navbar--hidden");
          // Close mobile search if open
          if (isMobileSearchActive) {
            closeMobileSearch();
          }
        } else if (currentScrollY < lastScrollY) {
          // Scrolling up - show navbar
          navbar.classList.remove("navbar--hidden");
        }
      }
    } else if (!isMobile && navbar) {
      // Always show navbar on desktop
      navbar.classList.remove("navbar--hidden");
    }

    lastScrollY = currentScrollY;
    ticking = false;
  }

  function requestScrollUpdate() {
    if (!ticking) {
      requestAnimationFrame(updateNavbarVisibility);
      ticking = true;
    }
  }

  // Track when user is actively scrolling
  function handleScrollStart() {
    isUserScrolling = true;
    if (scrollEndTimer) {
      clearTimeout(scrollEndTimer);
    }
  }

  function handleScrollEnd() {
    scrollEndTimer = setTimeout(() => {
      isUserScrolling = false;
    }, CONFIG.SCROLL_END_DELAY);
  }

  // Add scroll listener with passive option for better performance
  window.addEventListener(
    "scroll",
    () => {
      handleScrollStart();
      requestScrollUpdate();
      handleScrollEnd();
    },
    { passive: true },
  );

  // 🍪 Cookie utilities
  function setCookie(name, value, days = 365) {
    const expires = new Date();
    expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
  }

  function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(";");
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) === " ") c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
  }

  // 🌓 Theme toggle logic
  // Add small delay to ensure DOM is fully ready, especially for elements placed after scripts
  setTimeout(() => {
    const themeToggleButtons = document.querySelectorAll(
      "#theme-toggle, #mobile-theme-toggle",
    );

    themeToggleButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const currentTheme =
          document.documentElement.getAttribute("data-theme");
        const newTheme = currentTheme === "light" ? "dark" : "light";
        document.documentElement.setAttribute("data-theme", newTheme);
        localStorage.setItem("theme", newTheme);
        updateThemeIcons(newTheme === "light");
      });
    });
  }, 10);

  // 🧠 Update UI based on current theme (already set by inline script)
  const currentTheme =
    document.documentElement.getAttribute("data-theme") || "dark";
  updateThemeIcons(currentTheme === "light");

  // 🔍 Search keyboard shortcut (Ctrl+/)
  const searchInput = document.querySelector(".navbar__search-input");

  if (searchInput) {
    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey && (e.key === "/" || e.key === "?")) {
        e.preventDefault();
        const isMobileView = isMobile();
        if (isMobileView) {
          toggleMobileSearch(true);
        } else {
          searchInput.focus();
          searchInput.select();
        }
      }
    });
  }

  // 🔍 Mobile search functionality with expandable input
  const mobileSearchInput = document.getElementById("mobileSearchInput");
  const mobileSearchOverlay = document.querySelector(".navbar__mobile-search");

  function toggleMobileSearch(show = !isMobileSearchActive) {
    const isMobileView = isMobile();

    if (!isMobile) return;

    // Close mobile nav if it's open
    if (show && isMobileNavExpanded) {
      closeMobileNav();
    }

    isMobileSearchActive = show;
    if (navbar) {
      navbar.classList.toggle("navbar--search-active", show);
    }
    if (mobileSearchOverlay) {
      mobileSearchOverlay.classList.toggle(
        "navbar__mobile-search--active",
        show,
      );
    }

    if (show && mobileSearchInput) {
      setTimeout(() => {
        mobileSearchInput.focus();
      }, CONFIG.ANIMATION_DELAY);
    }
  }

  function closeMobileSearch() {
    isMobileSearchActive = false;
    if (navbar) {
      navbar.classList.remove("navbar--search-active");
    }
    if (mobileSearchOverlay) {
      mobileSearchOverlay.classList.remove("navbar__mobile-search--active");
    }
    if (mobileSearchInput) {
      mobileSearchInput.value = "";
      mobileSearchInput.blur();
    }
    // Also hide search modal if it's open
    if (typeof window.hideSearchModal === "function") {
      window.hideSearchModal();
    }
  }

  // Mobile search input handling
  if (mobileSearchInput) {
    mobileSearchInput.addEventListener("focus", () => {
      if (typeof window.showSearchModal === "function") {
        window.showSearchModal();
      }
    });

    mobileSearchInput.addEventListener("input", (e) => {
      const query = e.target.value;
      // Update the main search input to sync with search modal
      if (navbarSearchInput) {
        navbarSearchInput.value = query;
        // Trigger search
        navbarSearchInput.dispatchEvent(new Event("input"));
      }
    });

    // Handle escape key in mobile search
    mobileSearchInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeMobileSearch();
      }
    });
  }

  // Touch event handler to prevent body scroll but allow mobile content scroll
  let mobileContentEl = null;

  function preventBodyScroll(e) {
    if (!mobileContentEl) return;

    // Allow scrolling if touch is inside mobile content
    if (mobileContentEl.contains(e.target)) {
      return; // Don't prevent - allow normal scrolling inside content
    }
    // Prevent scroll on body/outside elements
    e.preventDefault();
  }

  function openMobileNav() {
    isMobileNavExpanded = true;

    // Get mobile content element BEFORE adding class
    mobileContentEl = navbar.querySelector(".navbar__content");

    if (navbar) {
      navbar.classList.add("navbar--mobile-expanded");
    }
    if (mobileNavToggle) {
      mobileNavToggle.setAttribute("aria-expanded", true);
    }

    // Enable scroll lock
    document.body.classList.add("mobile-nav-open");
    document.addEventListener("touchmove", preventBodyScroll, { passive: false });
  }

  function closeMobileNav() {
    isMobileNavExpanded = false;
    if (navbar) {
      navbar.classList.remove("navbar--mobile-expanded");
    }
    if (mobileNavToggle) {
      mobileNavToggle.setAttribute("aria-expanded", false);
    }

    // Remove scroll lock
    document.body.classList.remove("mobile-nav-open");
    document.removeEventListener("touchmove", preventBodyScroll);
    mobileContentEl = null;

    // Close any open dropdowns when closing mobile nav
    if (window.navbarDropdown) {
      window.navbarDropdown.closeAllDropdowns();
    }
  }

  // Mobile search toggle button
  if (mobileSearchToggle) {
    mobileSearchToggle.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Close mobile nav if it's open
      if (isMobileNavExpanded) {
        closeMobileNav();
      }

      toggleMobileSearch();
    });
  }

  // Listen for search modal state changes via body class changes
  const bodyObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (
        mutation.type === "attributes" &&
        mutation.attributeName === "class"
      ) {
        const hasSearchModalOpen =
          document.body.classList.contains("search-modal-open");
        const isMobileView = isMobile();

        if (isMobileView && !hasSearchModalOpen && isMobileSearchActive) {
          // Search modal was closed, sync mobile state and close mobile search
          setTimeout(() => {
            closeMobileSearch();
          }, CONFIG.DEBOUNCE_DELAY);
        }
      }
    });
  });

  // Start observing body class changes
  bodyObserver.observe(document.body, { attributes: true });

  // Global escape key handler for mobile search
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isMobileSearchActive) {
      closeMobileSearch();
    }
  });

  // Handle clicks outside navbar to close mobile search
  document.addEventListener("click", (e) => {
    const isMobileView = isMobile();

    // Don't close during scroll or if touching mobile content
    if (
      isMobileView &&
      isMobileSearchActive &&
      !navbar.contains(e.target) &&
      !isUserScrolling
    ) {
      const searchModal = document.getElementById("search-modal");
      // Only close if not clicking on the search modal
      if (!searchModal || !searchModal.contains(e.target)) {
        closeMobileSearch();
      }
    }
  });

  // 📱 Mobile navigation toggle
  if (mobileNavToggle && navbar) {
    mobileNavToggle.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Close search when toggling nav
      if (isMobileSearchActive) {
        closeMobileSearch();
      }

      if (isMobileNavExpanded) {
        closeMobileNav();
      } else {
        openMobileNav();
      }
    });

    // Close mobile nav when clicking outside (but not during scroll)
    document.addEventListener("click", (e) => {
      if (
        isMobileNavExpanded &&
        !navbar.contains(e.target) &&
        !isUserScrolling
      ) {
        // Additional check to prevent closing when touching mobile menu content
        const mobileContent = document.querySelector(".navbar__content");
        if (!mobileContent || !mobileContent.contains(e.target)) {
          closeMobileNav();
        }
      }
    });

    // Close mobile nav when a link is clicked
    const mobileNavLinks = navbar.querySelectorAll(
      ".navbar__content .navbar__link, .navbar__content .navbar-dropdown__link, .navbar__content .navbar__dropdown-inline-link",
    );
    mobileNavLinks.forEach((link) => {
      link.addEventListener("click", (e) => {
        // Only close if it's an actual navigation (not just a touch/scroll)
        if (!isUserScrolling) {
          closeMobileNav();
        }
      });
    });
  }

  // 📱 Handle window resize to reset mobile states
  window.addEventListener("resize", () => {
    const isMobileView = isMobile();
    if (!isMobile) {
      // Reset mobile states when switching to desktop
      if (navbar) {
        navbar.classList.remove(
          "navbar--hidden",
          "navbar--mobile-expanded",
          "navbar--search-active",
        );
        // Close any open dropdowns when switching to desktop
        if (window.navbarDropdown) {
          window.navbarDropdown.closeAllDropdowns();
        }
        if (mobileSearchOverlay) {
          mobileSearchOverlay.classList.remove("navbar__mobile-search--active");
        }
      }
      isMobileNavExpanded = false;
      isMobileSearchActive = false;
      if (mobileNavToggle) {
        mobileNavToggle.setAttribute("aria-expanded", false);
      }
      if (mobileSearchInput) {
        mobileSearchInput.value = "";
      }
    }
  });

  // 🎯 Mobile logo animation for touch devices
  const logoElement = document.querySelector(".navbar__logo");
  if (logoElement) {
    logoElement.addEventListener("touchstart", (e) => {
      const logoImg = logoElement.querySelector("img, svg");
      if (logoImg) {
        logoImg.style.animation = "logo-spin 9s linear infinite";
        setTimeout(() => {
          logoImg.style.animation = "";
        }, 9000);
      }
    });
  }

  // 🌐 Language selector synchronization
  const desktopLangSelect = document.getElementById("lang-select");
  const mobileLangSelect = document.getElementById("mobile-lang-select");

  function syncLanguageSelectors(sourceSelect, targetSelect) {
    if (
      sourceSelect &&
      targetSelect &&
      sourceSelect.value !== targetSelect.value
    ) {
      targetSelect.value = sourceSelect.value;
    }
  }

  if (desktopLangSelect && mobileLangSelect) {
    desktopLangSelect.addEventListener("change", () => {
      syncLanguageSelectors(desktopLangSelect, mobileLangSelect);
    });

    mobileLangSelect.addEventListener("change", () => {
      syncLanguageSelectors(mobileLangSelect, desktopLangSelect);
      // Close mobile nav after language change
      if (isMobileNavExpanded) {
        closeMobileNav();
      }
    });
  }

  // 🎯 Ensure mobile search button triggers search modal on first click
  // This handles the case where the search modal might not be initialized yet
  if (mobileSearchToggle) {
    mobileSearchToggle.addEventListener("click", (e) => {
      // Small delay to ensure search modal is properly triggered
      setTimeout(() => {
        const modal = document.getElementById("search-modal");
        if (modal && !modal.classList.contains("search-modal--active")) {
          // If modal wasn't triggered by input focus, manually show it
          if (typeof window.showSearchModal === "function") {
            window.showSearchModal();
          }
        }
      }, 50);
    });
  }
});
