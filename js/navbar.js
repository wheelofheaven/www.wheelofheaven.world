// Initialize global namespace for Wheel of Heaven
window.WheelOfHeaven = window.WheelOfHeaven || {
  navbar: {},
  search: {},
  ui: {},
};

// Navbar dropdown functionality
class NavbarDropdown {
  constructor() {
    this.activeDropdown = null;
    this.dropdowns = new Map();
    this.init();
  }

  init() {
    this.bindEvents();
    this.initDropdowns();
  }

  initDropdowns() {
    // Find all dropdown trigger elements
    const dropdownElements = document.querySelectorAll(".navbar__dropdown");

    dropdownElements.forEach((element) => {
      const trigger = element.querySelector(".navbar__dropdown-trigger");
      const dropdownId = element.dataset.dropdown;
      // Dropdown panels are now outside navbar, find by ID
      const dropdown = document.getElementById(`${dropdownId}-dropdown`);

      if (trigger && dropdown && dropdownId) {
        this.dropdowns.set(dropdownId, {
          element,
          trigger,
          dropdown,
          isOpen: false,
        });
      }
    });
  }

  bindEvents() {
    // Click events for dropdown triggers
    document.addEventListener("click", (e) => {
      const trigger = e.target.closest(".navbar__dropdown-trigger");

      if (trigger) {
        e.preventDefault();
        e.stopPropagation();
        this.handleTriggerClick(trigger);
        return;
      }

      // Close dropdowns when clicking outside (but not on backdrop or during mobile scroll)
      const isMobile = window.innerWidth <= 768;
      const isScrolling = window.isUserScrolling || false;

      if (
        !e.target.closest(".navbar-dropdown") &&
        !e.target.closest(".navbar__dropdown") &&
        !e.target.closest(".navbar__content") &&
        !(isMobile && isScrolling)
      ) {
        this.closeAllDropdowns();
      }
    });

    // Escape key to close dropdowns
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.closeAllDropdowns();
      }
    });

    // Handle mobile navigation
    this.handleMobileNavigation();
  }

  handleTriggerClick(trigger) {
    // Disable dropdown triggers in mobile viewport
    if (window.innerWidth <= 768) {
      return;
    }

    const dropdownElement = trigger.closest(".navbar__dropdown");
    const dropdownId = dropdownElement?.dataset.dropdown;

    if (!dropdownId || !this.dropdowns.has(dropdownId)) {
      return;
    }

    const dropdownData = this.dropdowns.get(dropdownId);

    if (dropdownData.isOpen) {
      this.closeDropdown(dropdownId);
    } else {
      this.closeAllDropdowns();
      this.openDropdown(dropdownId);
    }
  }

  openDropdown(dropdownId) {
    const dropdownData = this.dropdowns.get(dropdownId);
    if (!dropdownData || dropdownData.isOpen) {
      return;
    }

    // Set active state
    dropdownData.isOpen = true;
    this.activeDropdown = dropdownId;

    // Update DOM immediately
    dropdownData.trigger.classList.add("navbar__dropdown-trigger--active");
    dropdownData.trigger.setAttribute("aria-expanded", "true");
    dropdownData.dropdown.classList.add("navbar-dropdown--active");

    // Add modal open class to body
    document.body.classList.add("navbar-dropdown-open");

    // Position dropdown to avoid going off-screen
    requestAnimationFrame(() => {
      this.positionDropdown(dropdownData);
    });
  }

  closeDropdown(dropdownId) {
    const dropdownData = this.dropdowns.get(dropdownId);
    if (!dropdownData || !dropdownData.isOpen) {
      return;
    }

    // Set inactive state immediately
    dropdownData.isOpen = false;
    if (this.activeDropdown === dropdownId) {
      this.activeDropdown = null;
    }

    // Update DOM immediately without animation delay
    dropdownData.trigger.classList.remove("navbar__dropdown-trigger--active");
    dropdownData.trigger.setAttribute("aria-expanded", "false");
    dropdownData.dropdown.classList.remove(
      "navbar-dropdown--active",
      "navbar-dropdown--align-left",
      "navbar-dropdown--align-right",
    );

    // Don't reset inline positioning styles - let the animation complete
    // Styles will be overwritten when dropdown opens again

    // Remove modal open class if no dropdowns are open
    if (!this.hasOpenDropdowns()) {
      document.body.classList.remove("navbar-dropdown-open");
    }
  }

  closeAllDropdowns() {
    this.dropdowns.forEach((dropdownData, dropdownId) => {
      if (dropdownData.isOpen) {
        this.closeDropdown(dropdownId);
      }
    });
  }

  hasOpenDropdowns() {
    return Array.from(this.dropdowns.values()).some(
      (dropdown) => dropdown.isOpen,
    );
  }

  positionDropdown(dropdownData) {
    const dropdown = dropdownData.dropdown;
    const trigger = dropdownData.trigger;
    const navbar = document.querySelector('.navbar');

    // Reset positioning classes
    dropdown.classList.remove(
      "navbar-dropdown--align-left",
      "navbar-dropdown--align-right",
    );

    // Wait for next frame to get accurate measurements
    requestAnimationFrame(() => {
      const navbarRect = navbar.getBoundingClientRect();
      const triggerRect = trigger.getBoundingClientRect();
      const viewportWidth = window.innerWidth;

      // Position dropdown below navbar with 1px gap
      const topPosition = navbarRect.bottom + 1;
      dropdown.style.top = `${topPosition}px`;

      // Center dropdown under trigger
      const triggerCenter = triggerRect.left + (triggerRect.width / 2);
      dropdown.style.left = `${triggerCenter}px`;
      dropdown.style.transform = 'translateX(-50%)';

      // Check bounds after positioning
      requestAnimationFrame(() => {
        const dropdownRect = dropdown.getBoundingClientRect();

        // Check if dropdown goes off the right edge
        if (dropdownRect.right > viewportWidth - 20) {
          dropdown.classList.add("navbar-dropdown--align-right");
          dropdown.style.left = 'auto';
          dropdown.style.right = '20px';
          dropdown.style.transform = 'none';
        }
        // Check if dropdown goes off the left edge
        else if (dropdownRect.left < 20) {
          dropdown.classList.add("navbar-dropdown--align-left");
          dropdown.style.left = '20px';
          dropdown.style.transform = 'none';
        }
      });
    });
  }

  handleMobileNavigation() {
    // In mobile, dropdowns should behave differently
    const handleMobileResize = () => {
      if (window.innerWidth <= 768) {
        // Close all dropdowns when switching to mobile
        this.closeAllDropdowns();
      }
    };

    window.addEventListener("resize", handleMobileResize);

    // Handle mobile nav toggle
    const mobileNavToggle = document.getElementById("mobileNavToggle");
    if (mobileNavToggle) {
      mobileNavToggle.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Close dropdowns when mobile nav is toggled
        this.closeAllDropdowns();
      });
    }

    // Sync scroll state for mobile
    window.addEventListener(
      "scroll",
      () => {
        window.isUserScrolling = true;
        clearTimeout(window.scrollEndTimer);
        window.scrollEndTimer = setTimeout(() => {
          window.isUserScrolling = false;
        }, 150);
      },
      { passive: true },
    );
  }
}

// Icon management for dropdown sections
class DropdownIcons {
  constructor() {
    this.configIcons = this.loadConfigIcons();
    this.fallbackIcons = {
      // Knowledge section
      knowledge: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>`,

      revelations: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14,2 14,8 20,8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10,9 9,9 8,9"/>
            </svg>`,

      wiki: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                <path d="M8 7h8"/>
                <path d="M8 11h8"/>
                <path d="M8 15h6"/>
            </svg>`,

      // Resources section
      org: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>`,

      community: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>`,

      about: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 16v-4"/>
                <path d="M12 8h.01"/>
            </svg>`,

      code_of_conduct: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 12l2 2 4-4"/>
                <path d="M21 12c-1 0-3-1-3-3s2-3 3-3 3 1 3 3-2 3-3 3"/>
                <path d="M3 12c1 0 3-1 3-3s-2-3-3-3-3 1-3 3 2 3 3 3"/>
                <path d="M3 12v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6"/>
            </svg>`,

      contributing: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <line x1="19" y1="8" x2="19" y2="14"/>
                <line x1="22" y1="11" x2="16" y2="11"/>
            </svg>`,

      forums: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>`,

      faq: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                <path d="M12 17h.01"/>
            </svg>`,

      social: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"/>
            </svg>`,
    };
  }

  loadConfigIcons() {
    // Try to load icons from config if available
    // This would be populated by Zola's template system in the future
    return window.navbarIcons || {};
  }

  async getIcon(key) {
    // First try to get from config (future implementation)
    if (this.configIcons[key]) {
      try {
        const response = await fetch(this.configIcons[key]);
        if (response.ok) {
          return await response.text();
        }
      } catch (error) {
        console.warn(
          `Failed to load icon from ${this.configIcons[key]}:`,
          error,
        );
      }
    }

    // Fall back to embedded SVG
    return this.fallbackIcons[key] || "";
  }

  getIconSync(key) {
    // Synchronous version that uses fallback icons
    return this.fallbackIcons[key] || "";
  }

  updateIcons() {
    // This could be used to dynamically update icons if needed
    // For example, if icons are loaded from config.toml in the future
    this.configIcons = this.loadConfigIcons();
  }
}

// Initialize navbar dropdown functionality when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  // Use namespace for organization
  window.WheelOfHeaven.navbar.dropdown = new NavbarDropdown();
  window.WheelOfHeaven.navbar.icons = new DropdownIcons();

  // Keep legacy references for backwards compatibility
  window.navbarDropdown = window.WheelOfHeaven.navbar.dropdown;
  window.dropdownIcons = window.WheelOfHeaven.navbar.icons;
});

// Export for potential use in other modules
if (typeof module !== "undefined" && module.exports) {
  module.exports = { NavbarDropdown, DropdownIcons };
}
