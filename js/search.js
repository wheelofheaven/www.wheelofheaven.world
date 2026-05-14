// Enhanced Fuse.js Search Implementation for Zola
// Features: Fuzzy matching, section filters, suggestions, recent searches

let searchIndex = null;
let fuse = null;
let currentLanguage = "en";
let activeFilters = new Set();
let searchInitPromise = null;
const RECENT_SEARCHES_KEY = 'woh-recent-searches';
const MAX_RECENT_SEARCHES = 5;

// Section definitions with icons
const SECTIONS = {
    Wiki: {
        icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            <path d="M8 7h8"/><path d="M8 11h8"/><path d="M8 15h6"/>
        </svg>`,
        label: 'Wiki'
    },
    Timeline: {
        icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12,6 12,12 16,14"/>
        </svg>`,
        label: 'Timeline'
    },
    Resources: {
        icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
        </svg>`,
        label: 'Resources'
    },
    Articles: {
        icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
            <polyline points="14,2 14,8 20,8"/>
        </svg>`,
        label: 'Articles'
    },
    Library: {
        icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>
        </svg>`,
        label: 'Library'
    }
};

// Popular search suggestions
const SUGGESTIONS = [
    { term: 'Elohim', section: 'Wiki' },
    { term: 'Raelism', section: 'Wiki' },
    { term: 'Genesis', section: 'Wiki' },
    { term: 'Age of Aquarius', section: 'Timeline' },
    { term: 'extraterrestrial', section: 'Wiki' },
    { term: 'creation', section: 'Wiki' },
    { term: 'ancient astronauts', section: 'Articles' },
    { term: 'intelligent design', section: 'Wiki' }
];

// Initialize search functionality (lazy — fetches the multi-MB index
// only when the user first interacts with search). Idempotent: repeat
// calls return the in-flight or completed promise.
function initSearch() {
    if (searchInitPromise) return searchInitPromise;
    searchInitPromise = (async () => {
    try {
        currentLanguage = document.documentElement.lang || "en";

        let response;
        try {
            response = await fetch(`/search_index.${currentLanguage}.json`);
            searchIndex = await response.json();
            if (!searchIndex || searchIndex.length < 5) {
                throw new Error("Search index too small, falling back to English");
            }
        } catch (error) {
            console.warn(`Failed to load search index for ${currentLanguage}, falling back to English:`, error);
            response = await fetch("/search_index.en.json");
            searchIndex = await response.json();
            currentLanguage = "en";
        }

        // Enhanced Fuse.js options for better fuzzy matching
        const options = {
            keys: [
                { name: "title", weight: 0.5 },
                { name: "body", weight: 0.5 }
            ],
            threshold: 0.3, // More lenient for fuzzy matching
            distance: 100, // How far to search for a match
            includeMatches: true,
            includeScore: true,
            minMatchCharLength: 2, // Lower to catch more matches
            findAllMatches: true,
            ignoreLocation: true,
            useExtendedSearch: true,
            shouldSort: true,
            tokenize: false,
            matchAllTokens: false
        };

        fuse = new Fuse(searchIndex, options);
        console.log("Search initialized successfully with", searchIndex.length, "items");
    } catch (error) {
        console.error("Error initializing search:", error);
        searchInitPromise = null; // allow a retry on the next interaction
    }
    })();
    return searchInitPromise;
}

// Get section icon
function getSectionIcon(section) {
    return SECTIONS[section]?.icon || '';
}

// Extract section from URL
function extractSection(url) {
    const uri = extractUri(url);
    const pathWithoutLang = uri.replace(/^\/(?:de|fr|es|ru|ja|zh|zh-Hant|ko)\//, "/");
    const segments = pathWithoutLang.split("/").filter(Boolean);
    if (segments.length === 0) return "Home";

    const section = segments[0];
    const sectionMap = {
        wiki: "Wiki",
        revelations: "Library",
        library: "Library",
        timeline: "Timeline",
        articles: "Articles",
        resources: "Resources"
    };

    return sectionMap[section] || section.charAt(0).toUpperCase() + section.slice(1);
}

// Extract URI from full URL
function extractUri(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.pathname;
    } catch (e) {
        return url.replace(/^https?:\/\/[^\/]+/, "");
    }
}

// Get navigation links
function getNavigationLinks() {
    const baseUrl = currentLanguage === "en" ? "" : `/${currentLanguage}`;
    return [
        { title: "Home", url: baseUrl || "/", section: "Home", description: "Welcome page and site overview" },
        { title: "Articles", url: `${baseUrl}/articles/`, section: "Articles", description: "Long-form analyses and arguments" },
        { title: "Timeline", url: `${baseUrl}/timeline/`, section: "Timeline", description: "Chronological overview of events" },
        { title: "Wiki", url: `${baseUrl}/wiki/`, section: "Wiki", description: "Comprehensive knowledge database" },
        { title: "Resources", url: `${baseUrl}/resources/`, section: "Resources", description: "Books, films, and external references" }
    ];
}

// Recent searches management
function getRecentSearches() {
    try {
        const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        return [];
    }
}

function addRecentSearch(query) {
    if (!query || query.trim().length < 2) return;

    const recent = getRecentSearches();
    const normalized = query.trim().toLowerCase();

    // Remove if exists, add to front
    const filtered = recent.filter(s => s.toLowerCase() !== normalized);
    filtered.unshift(query.trim());

    // Keep only max items
    const updated = filtered.slice(0, MAX_RECENT_SEARCHES);

    try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    } catch (e) {
        console.warn('Could not save recent search:', e);
    }
}

function clearRecentSearches() {
    try {
        localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch (e) {
        console.warn('Could not clear recent searches:', e);
    }
}

// Create filter chips HTML
function createFilterChips() {
    const chips = Object.entries(SECTIONS).map(([key, data]) => {
        const isActive = activeFilters.has(key);
        return `
            <button class="search-filter-chip ${isActive ? 'search-filter-chip--active' : ''}"
                    data-section="${key}"
                    aria-pressed="${isActive}">
                <span class="search-filter-chip__icon">${data.icon}</span>
                <span class="search-filter-chip__label">${data.label}</span>
            </button>
        `;
    }).join('');

    return `
        <div class="search-filters">
            <div class="search-filters__header">
                <span class="search-filters__label">Filter by section</span>
                ${activeFilters.size > 0 ? '<button class="search-filters__clear">Clear all</button>' : ''}
            </div>
            <div class="search-filters__chips">${chips}</div>
        </div>
    `;
}

// Create suggestions HTML
function createSuggestionsHTML() {
    const recent = getRecentSearches();

    let html = '';

    // Recent searches section
    if (recent.length > 0) {
        html += `
            <div class="search-suggestions">
                <div class="search-suggestions__header">
                    <span class="search-suggestions__label">Recent searches</span>
                    <button class="search-suggestions__clear" id="clear-recent">Clear</button>
                </div>
                <div class="search-suggestions__list">
                    ${recent.map(term => `
                        <button class="search-suggestion" data-term="${term}">
                            <svg class="search-suggestion__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/>
                                <polyline points="12,6 12,12 16,14"/>
                            </svg>
                            <span class="search-suggestion__text">${term}</span>
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // Popular suggestions
    html += `
        <div class="search-suggestions">
            <div class="search-suggestions__header">
                <span class="search-suggestions__label">Popular searches</span>
            </div>
            <div class="search-suggestions__list">
                ${SUGGESTIONS.slice(0, 6).map(s => `
                    <button class="search-suggestion" data-term="${s.term}">
                        <svg class="search-suggestion__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8"/>
                            <path d="m21 21-4.3-4.3"/>
                        </svg>
                        <span class="search-suggestion__text">${s.term}</span>
                        <span class="search-suggestion__section">${s.section}</span>
                    </button>
                `).join('')}
            </div>
        </div>
    `;

    return html;
}

// Create navigation links HTML
function createNavigationLinks() {
    const links = getNavigationLinks();
    return `
        <div class="search-modal__navigation">
            <h4 class="search-modal__navigation-title">Browse sections</h4>
            ${links.map(link => `
                <a href="${link.url}" class="search-result search-result--nav">
                    <div class="search-result__left">
                        <div class="search-result__title">${link.title}</div>
                        <div class="search-result__url">${link.url}</div>
                    </div>
                    <div class="search-result__right">
                        <div class="search-result__section">
                            <span class="search-result__section-icon">${getSectionIcon(link.section)}</span>
                            ${link.section}
                        </div>
                    </div>
                </a>
            `).join('')}
        </div>
    `;
}

// Create initial state HTML (filters + suggestions + navigation)
function createInitialState() {
    return `
        ${createFilterChips()}
        ${createSuggestionsHTML()}
        ${createNavigationLinks()}
    `;
}

// Create modal HTML structure
function createSearchModal() {
    const modal = document.createElement("div");
    modal.id = "search-modal";
    modal.className = "search-modal";
    modal.innerHTML = `
        <div class="search-modal__backdrop"></div>
        <div class="search-modal__container">
            <div class="search-modal__header">
                <h3 class="search-modal__title">Search</h3>
                <div class="search-modal__shortcut">Press <kbd>Esc</kbd> to close</div>
                <button class="search-modal__close" aria-label="Close search">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            <div class="search-modal__results" id="search-results">
                ${createInitialState()}
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Setup filter and suggestion handlers
    setupFilterHandlers(modal);
    setupSuggestionHandlers(modal);

    return modal;
}

// Setup filter chip handlers
function setupFilterHandlers(modal) {
    modal.addEventListener('click', (e) => {
        const chip = e.target.closest('.search-filter-chip');
        if (chip) {
            const section = chip.dataset.section;
            if (activeFilters.has(section)) {
                activeFilters.delete(section);
            } else {
                activeFilters.add(section);
            }

            // Re-render filters
            const filtersContainer = modal.querySelector('.search-filters');
            if (filtersContainer) {
                filtersContainer.outerHTML = createFilterChips();
            }

            // Re-run search if there's a query
            const navbarInput = document.querySelector('.navbar__search-input');
            if (navbarInput && navbarInput.value.trim()) {
                performSearch(navbarInput.value);
            }
        }

        // Clear all filters
        const clearBtn = e.target.closest('.search-filters__clear');
        if (clearBtn) {
            activeFilters.clear();
            const filtersContainer = modal.querySelector('.search-filters');
            if (filtersContainer) {
                filtersContainer.outerHTML = createFilterChips();
            }

            const navbarInput = document.querySelector('.navbar__search-input');
            if (navbarInput && navbarInput.value.trim()) {
                performSearch(navbarInput.value);
            }
        }
    });
}

// Setup suggestion handlers
function setupSuggestionHandlers(modal) {
    modal.addEventListener('click', (e) => {
        const suggestion = e.target.closest('.search-suggestion');
        if (suggestion) {
            const term = suggestion.dataset.term;
            const navbarInput = document.querySelector('.navbar__search-input');
            if (navbarInput && term) {
                navbarInput.value = term;
                performSearch(term);
            }
        }

        // Clear recent searches
        const clearRecent = e.target.closest('#clear-recent');
        if (clearRecent) {
            clearRecentSearches();
            renderSearchResults([], '');
        }
    });
}

// Highlight matching text
function highlightText(text, query) {
    if (!query || query.trim().length < 2) return text;

    const searchTerms = query.toLowerCase().split(/\s+/).filter(term => term.length >= 2);
    if (searchTerms.length === 0) return text;

    let result = text;
    searchTerms.forEach(term => {
        const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`(${escapedTerm})`, "gi");
        result = result.replace(regex, '<mark class="search-highlight">$1</mark>');
    });

    return result;
}

// Create truncated text
function createTruncatedText(text, matches, maxLength = 150) {
    if (!text) return "";
    if (text.length <= maxLength) return text;

    let centerPoint = Math.floor(text.length / 2);
    if (matches && matches.length > 0 && matches[0].indices && matches[0].indices.length > 0) {
        centerPoint = matches[0].indices[0][0];
    }

    const start = Math.max(0, centerPoint - Math.floor(maxLength / 2));
    const end = Math.min(text.length, start + maxLength);

    let result = text.slice(start, end);
    if (start > 0) result = "..." + result;
    if (end < text.length) result = result + "...";

    return result;
}

// Filter search results by language and section
function filterResults(results) {
    return results.filter(result => {
        const url = result.item.url;
        const urlPath = extractUri(url);
        const section = extractSection(url);

        // Language filter
        let langMatch = false;
        if (currentLanguage === "en") {
            langMatch = !urlPath.match(/^\/(?:de|fr|es|ru|ja|zh|zh-Hant|ko)\//);
        } else {
            langMatch = urlPath.startsWith(`/${currentLanguage}/`);
        }

        // Section filter
        let sectionMatch = true;
        if (activeFilters.size > 0) {
            sectionMatch = activeFilters.has(section);
        }

        return langMatch && sectionMatch;
    });
}

// Create empty state HTML
function createEmptyState(query) {
    return `
        ${createFilterChips()}
        <div class="search-modal__empty-state">
            <div class="search-modal__empty-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    <line x1="8" y1="11" x2="14" y2="11"></line>
                </svg>
            </div>
            <h4 class="search-modal__empty-title">No results found</h4>
            <p class="search-modal__empty-text">
                No matches for "<strong>${query}</strong>"${activeFilters.size > 0 ? ' in selected sections' : ''}.
                Try different keywords${activeFilters.size > 0 ? ' or clear filters' : ''}.
            </p>
        </div>
        ${createNavigationLinks()}
    `;
}

// Create results count HTML
function createResultsCount(count, query) {
    return `
        <div class="search-results-count">
            <span class="search-results-count__number">${count}</span>
            <span class="search-results-count__text">result${count !== 1 ? 's' : ''} for "${query}"</span>
        </div>
    `;
}

// Render search results
function renderSearchResults(results, query = "") {
    const container = document.getElementById("search-results");
    if (!container) return;

    if (!results || results.length === 0) {
        if (query && query.trim().length >= 2) {
            container.innerHTML = createEmptyState(query);
        } else {
            container.innerHTML = createInitialState();
        }
        setupFilterHandlers(document.getElementById('search-modal'));
        setupSuggestionHandlers(document.getElementById('search-modal'));
        return;
    }

    const resultsHTML = results.slice(0, 15).map(result => {
        const { item, matches } = result;
        const highlightedTitle = highlightText(item.title, query);
        const truncatedBody = createTruncatedText(
            item.body,
            matches?.filter(m => m.key === "body") || [],
            140
        );
        const highlightedBody = highlightText(truncatedBody, query);
        const uri = extractUri(item.url);
        const section = extractSection(item.url);

        return `
            <a href="${item.url}" class="search-result">
                <div class="search-result__left">
                    <div class="search-result__title">${highlightedTitle}</div>
                    <div class="search-result__url">${uri}</div>
                    <div class="search-result__section">
                        <span class="search-result__section-icon">${getSectionIcon(section)}</span>
                        ${section}
                    </div>
                </div>
                <div class="search-result__right">
                    <div class="search-result__body">${highlightedBody}</div>
                </div>
            </a>
        `;
    }).join('');

    container.innerHTML = `
        ${createFilterChips()}
        ${createResultsCount(results.length, query)}
        ${resultsHTML}
    `;

    setupFilterHandlers(document.getElementById('search-modal'));
}

// Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Search function
function performSearch(query) {
    if (!fuse || !query.trim() || query.trim().length < 2) {
        renderSearchResults([]);
        return;
    }

    const results = fuse.search(query);
    const filteredResults = filterResults(results);
    renderSearchResults(filteredResults, query);

    // Save to recent searches (debounced separately to avoid saving partial queries)
    if (query.trim().length >= 3) {
        addRecentSearch(query);
    }
}

// Debounced search
const debouncedSearch = debounce(performSearch, 150);

// Show search modal
function showSearchModal() {
    const modal = document.getElementById("search-modal");
    const body = document.body;

    if (modal) {
        if (window.navbarDropdown) {
            window.navbarDropdown.closeAllDropdowns();
        }

        modal.classList.add("search-modal--active");
        body.classList.add("search-modal-open");

        const elementsToBlur = document.querySelectorAll("main, footer, .totop");
        elementsToBlur.forEach(el => {
            el.style.filter = "blur(4px)";
            el.style.transition = "filter 0.3s ease";
        });
    }
}

// Hide search modal
function hideSearchModal() {
    const modal = document.getElementById("search-modal");
    const body = document.body;

    if (modal) {
        modal.classList.remove("search-modal--active");
        body.classList.remove("search-modal-open");

        const elementsToBlur = document.querySelectorAll("main, footer, .totop");
        elementsToBlur.forEach(el => {
            el.style.filter = "none";
        });

        const navbarInput = document.querySelector(".navbar__search-input");
        if (navbarInput) {
            navbarInput.value = "";
        }

        // Reset to initial state
        activeFilters.clear();
        renderSearchResults([]);
    }
}

// This bundle is lazy-loaded by `search-loader.js` after first user
// intent. By the time we run, DOM is already complete, so init runs
// immediately rather than waiting on DOMContentLoaded. If for some
// reason the bundle is loaded synchronously before DOM is ready, fall
// back to the event.
function initSearchUI() {
    const modal = createSearchModal();
    const navbarSearchInput = document.querySelector(".navbar__search-input");

    // Wrap performSearch so a query typed before the index has loaded
    // re-runs once it does.
    const runQuery = (query) => {
        debouncedSearch(query);
        if (!fuse) {
            initSearch().then(() => {
                if (navbarSearchInput && navbarSearchInput.value === query) {
                    debouncedSearch(query);
                }
            });
        }
    };

    if (navbarSearchInput) {
        navbarSearchInput.addEventListener("focus", () => {
            initSearch();
            showSearchModal();
        });
        navbarSearchInput.addEventListener("click", () => {
            initSearch();
            showSearchModal();
        });

        navbarSearchInput.addEventListener("input", e => {
            const query = e.target.value;
            if (query.trim() && !modal.classList.contains("search-modal--active")) {
                showSearchModal();
            }
            runQuery(query);
            if (!query.trim() && modal.classList.contains("search-modal--active")) {
                renderSearchResults([]);
            }
        });

        navbarSearchInput.addEventListener("keydown", e => {
            if (e.key === "Enter") {
                e.preventDefault();
            }
        });
    }

    // Opportunistically prefetch the index when the browser is idle, so
    // the first query feels instant without blocking initial paint.
    if ("requestIdleCallback" in window) {
        requestIdleCallback(() => initSearch(), { timeout: 4000 });
    } else {
        setTimeout(() => initSearch(), 3000);
    }

    const closeButton = modal.querySelector(".search-modal__close");
    const backdrop = modal.querySelector(".search-modal__backdrop");

    closeButton.addEventListener("click", hideSearchModal);
    backdrop.addEventListener("click", hideSearchModal);

    modal.addEventListener("click", e => {
        const resultLink = e.target.closest(".search-result");
        if (resultLink && resultLink.href) {
            hideSearchModal();
        }
    });

    document.addEventListener("keydown", e => {
        if ((e.ctrlKey || e.metaKey) && e.key === "/") {
            e.preventDefault();
            if (navbarSearchInput) {
                navbarSearchInput.focus();
            }
        }

        if (e.key === "Escape") {
            hideSearchModal();
            if (navbarSearchInput) {
                navbarSearchInput.blur();
            }
        }
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSearchUI);
} else {
    initSearchUI();
}

// Keyboard navigation in results
document.addEventListener("keydown", e => {
    const modal = document.getElementById("search-modal");
    if (!modal || !modal.classList.contains("search-modal--active")) return;

    const results = modal.querySelectorAll(".search-result");
    const suggestions = modal.querySelectorAll(".search-suggestion");
    const allFocusable = [...suggestions, ...results];
    const currentFocus = document.activeElement;
    const navbarInput = document.querySelector(".navbar__search-input");

    if (e.key === "ArrowDown") {
        e.preventDefault();
        if (currentFocus === navbarInput) {
            allFocusable[0]?.focus();
        } else {
            const currentIndex = Array.from(allFocusable).indexOf(currentFocus);
            const nextIndex = Math.min(currentIndex + 1, allFocusable.length - 1);
            allFocusable[nextIndex]?.focus();
        }
    } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const currentIndex = Array.from(allFocusable).indexOf(currentFocus);
        if (currentIndex > 0) {
            allFocusable[currentIndex - 1]?.focus();
        } else {
            navbarInput?.focus();
        }
    }
});
