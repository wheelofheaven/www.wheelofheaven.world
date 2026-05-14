/**
 * Library Search - In-book search and reference lookup
 *
 * Features:
 * - Reference lookup (TBWTT 1:5 → jump to paragraph)
 * - In-book text search with highlighting
 * - Navigate between search results
 * - Search across chapters
 *
 * Requires: library-storage.js
 */

const LibrarySearch = (function() {
    'use strict';

    // Configuration
    const CONFIG = {
        minSearchLength: 2,
        maxResults: 100,
        highlightClass: 'library-search__highlight'
    };

    // State
    let state = {
        bookSlug: null,
        bookCode: null,
        isInitialized: false,
        searchResults: [],
        currentResultIndex: -1,
        searchQuery: ''
    };

    // DOM elements cache
    let elements = {};

    /**
     * Initialize search
     */
    function init(options = {}) {
        if (state.isInitialized) return;

        const bookContainer = document.querySelector('.library-book');
        if (!bookContainer) {
            console.log('[LibrarySearch] Not on a book page');
            return;
        }

        state.bookSlug = options.bookSlug || bookContainer.dataset.bookSlug || getBookSlugFromUrl();
        state.bookCode = options.bookCode || bookContainer.dataset.bookCode || '';

        // Create search UI
        createSearchUI();

        // Cache DOM elements
        cacheElements();

        // Set up event listeners
        setupEventListeners();

        // Handle URL reference lookup on load
        handleUrlReference();

        state.isInitialized = true;
        console.log('[LibrarySearch] Initialized for:', state.bookSlug);
    }

    /**
     * Get book slug from URL
     */
    function getBookSlugFromUrl() {
        const path = window.location.pathname;
        const match = path.match(/\/library\/([^/]+)/);
        return match ? match[1] : '';
    }

    /**
     * Create search UI
     */
    function createSearchUI() {
        // Add search bar to controls
        const controls = document.querySelector('.library-book__controls');
        if (!controls) return;

        const searchBar = document.createElement('div');
        searchBar.className = 'library-search';
        searchBar.innerHTML = `
            <div class="library-search__input-wrapper">
                <svg class="library-search__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                </svg>
                <input type="text"
                       id="library-book-search"
                       class="library-search__input"
                       placeholder="Search or go to (e.g. 1:5)..."
                       autocomplete="off">
                <button class="library-search__clear hidden" id="search-clear" aria-label="Clear search">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            <div class="library-search__nav hidden" id="search-nav">
                <span class="library-search__count" id="search-count">0/0</span>
                <button class="library-search__nav-btn" id="search-prev" aria-label="Previous result">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M15 18l-6-6 6-6"></path>
                    </svg>
                </button>
                <button class="library-search__nav-btn" id="search-next" aria-label="Next result">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 18l6-6-6-6"></path>
                    </svg>
                </button>
            </div>
        `;

        // Insert before the progress indicator
        const progress = controls.querySelector('.library-book__progress');
        if (progress) {
            controls.insertBefore(searchBar, progress);
        } else {
            controls.prepend(searchBar);
        }
    }

    /**
     * Cache DOM elements
     */
    function cacheElements() {
        elements = {
            searchInput: document.getElementById('library-book-search'),
            clearBtn: document.getElementById('search-clear'),
            searchNav: document.getElementById('search-nav'),
            searchCount: document.getElementById('search-count'),
            prevBtn: document.getElementById('search-prev'),
            nextBtn: document.getElementById('search-next'),
            paragraphs: document.querySelectorAll('.library-book__paragraph')
        };
    }

    /**
     * Set up event listeners
     */
    function setupEventListeners() {
        if (!elements.searchInput) return;

        // Search input
        elements.searchInput.addEventListener('input', debounce(handleSearchInput, 300));
        elements.searchInput.addEventListener('keydown', handleSearchKeydown);

        // Clear button
        elements.clearBtn?.addEventListener('click', clearSearch);

        // Navigation buttons
        elements.prevBtn?.addEventListener('click', goToPreviousResult);
        elements.nextBtn?.addEventListener('click', goToNextResult);

        // Focus search on / key (already in library-reader.js, but add fallback)
        document.addEventListener('keydown', (e) => {
            if (e.key === '/' && !e.target.matches('input, textarea')) {
                e.preventDefault();
                elements.searchInput?.focus();
            }
        });
    }

    /**
     * Handle search input
     */
    function handleSearchInput(e) {
        const query = e.target.value.trim();
        state.searchQuery = query;

        // Show/hide clear button
        elements.clearBtn?.classList.toggle('hidden', !query);

        if (!query) {
            clearSearch();
            return;
        }

        // Check if it's a reference lookup (e.g., "1:5" or "TBWTT 1:5")
        if (isReferenceQuery(query)) {
            handleReferenceLookup(query);
            return;
        }

        // Perform text search
        if (query.length >= CONFIG.minSearchLength) {
            performSearch(query);
        }
    }

    /**
     * Handle search keydown
     */
    function handleSearchKeydown(e) {
        switch (e.key) {
            case 'Enter':
                if (e.shiftKey) {
                    goToPreviousResult();
                } else {
                    goToNextResult();
                }
                e.preventDefault();
                break;
            case 'Escape':
                clearSearch();
                elements.searchInput?.blur();
                break;
        }
    }

    /**
     * Check if query is a reference lookup
     */
    function isReferenceQuery(query) {
        // Match patterns like: "1:5", "TBWTT 1:5", "TBWTT-1:5", "chapter 1 paragraph 5"
        const patterns = [
            /^\d+:\d+$/,                           // 1:5
            /^\w+-\d+:\d+$/,                       // TBWTT-1:5
            /^\w+\s+\d+:\d+$/,                     // TBWTT 1:5
            /^chapter\s+\d+\s*(?:paragraph|para|p)?\s*\d+$/i,  // chapter 1 paragraph 5
            /^c\d+p\d+$/                           // c1p5
        ];

        return patterns.some(pattern => pattern.test(query));
    }

    /**
     * Handle reference lookup
     */
    function handleReferenceLookup(query) {
        let chapter, paragraph;

        // Parse different reference formats
        const simpleMatch = query.match(/^(\d+):(\d+)$/);
        const codeMatch = query.match(/^(?:\w+-)?(\d+):(\d+)$/);
        const wordMatch = query.match(/^(?:chapter\s+)?(\d+)\s*(?:paragraph|para|p)?\s*(\d+)$/i);
        const idMatch = query.match(/^c(\d+)p(\d+)$/);

        if (simpleMatch) {
            [, chapter, paragraph] = simpleMatch;
        } else if (codeMatch) {
            [, chapter, paragraph] = codeMatch;
        } else if (wordMatch) {
            [, chapter, paragraph] = wordMatch;
        } else if (idMatch) {
            [, chapter, paragraph] = idMatch;
        }

        if (chapter && paragraph) {
            goToReference(parseInt(chapter), parseInt(paragraph));
        }
    }

    /**
     * Go to a specific reference
     */
    function goToReference(chapter, paragraph) {
        const paraId = `c${chapter}p${paragraph}`;
        const paraEl = document.getElementById(paraId);

        if (paraEl) {
            // Clear any existing search highlights
            clearHighlights();

            // Scroll to and highlight paragraph
            paraEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            paraEl.classList.add('library-book__paragraph--selected');

            // Update URL
            const newUrl = window.location.pathname + '#' + paraId;
            history.replaceState(null, null, newUrl);

            // Update state if LibraryReader is available
            if (window.LibraryReader) {
                window.LibraryReader.selectParagraph(paraId);
            }

            showToast(`Jumped to ${state.bookCode || ''} ${chapter}:${paragraph}`);
        } else {
            showToast(`Reference ${chapter}:${paragraph} not found`);
        }
    }

    /**
     * Perform text search
     */
    function performSearch(query) {
        clearHighlights();
        state.searchResults = [];
        state.currentResultIndex = -1;

        const queryLower = query.toLowerCase();
        let resultCount = 0;

        elements.paragraphs.forEach((para, index) => {
            const translationEl = para.querySelector('.library-book__para-translation');
            const originalEl = para.querySelector('.library-book__para-original');

            const translationText = translationEl?.textContent || '';
            const originalText = originalEl?.textContent || '';

            const translationMatch = translationText.toLowerCase().includes(queryLower);
            const originalMatch = originalText.toLowerCase().includes(queryLower);

            if (translationMatch || originalMatch) {
                state.searchResults.push({
                    element: para,
                    index: resultCount++
                });

                // Highlight matches in translation
                if (translationMatch && translationEl) {
                    highlightText(translationEl, query);
                }

                // Highlight matches in original if visible
                if (originalMatch && originalEl && originalEl.style.display !== 'none') {
                    highlightText(originalEl, query);
                }
            }
        });

        updateSearchUI();

        // Navigate to first result if any
        if (state.searchResults.length > 0) {
            goToResult(0);
        }
    }

    /**
     * Highlight text matches
     */
    function highlightText(element, query) {
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        const textNodes = [];
        while (walker.nextNode()) {
            textNodes.push(walker.currentNode);
        }

        const queryLower = query.toLowerCase();

        textNodes.forEach(node => {
            const text = node.textContent;
            const textLower = text.toLowerCase();
            const index = textLower.indexOf(queryLower);

            if (index !== -1) {
                const before = text.substring(0, index);
                const match = text.substring(index, index + query.length);
                const after = text.substring(index + query.length);

                const span = document.createElement('span');
                span.innerHTML = `${escapeHtml(before)}<mark class="${CONFIG.highlightClass}">${escapeHtml(match)}</mark>${escapeHtml(after)}`;

                node.parentNode.replaceChild(span, node);
            }
        });
    }

    /**
     * Clear all highlights
     */
    function clearHighlights() {
        document.querySelectorAll(`.${CONFIG.highlightClass}`).forEach(mark => {
            const text = mark.textContent;
            mark.parentNode.replaceChild(document.createTextNode(text), mark);
        });

        // Normalize text nodes
        elements.paragraphs.forEach(para => {
            para.querySelectorAll('.library-book__para-translation, .library-book__para-original').forEach(el => {
                el.normalize();
            });
        });

        // Remove search result styling
        document.querySelectorAll('.library-search__current-result').forEach(el => {
            el.classList.remove('library-search__current-result');
        });
    }

    /**
     * Update search UI
     */
    function updateSearchUI() {
        const hasResults = state.searchResults.length > 0;

        elements.searchNav?.classList.toggle('hidden', !state.searchQuery || state.searchResults.length === 0);

        if (elements.searchCount) {
            if (state.searchQuery && state.searchResults.length === 0) {
                elements.searchCount.textContent = 'No results';
            } else {
                elements.searchCount.textContent = `${state.currentResultIndex + 1}/${state.searchResults.length}`;
            }
        }
    }

    /**
     * Go to a specific result
     */
    function goToResult(index) {
        if (index < 0 || index >= state.searchResults.length) return;

        // Remove current result styling
        document.querySelectorAll('.library-search__current-result').forEach(el => {
            el.classList.remove('library-search__current-result');
        });

        state.currentResultIndex = index;
        const result = state.searchResults[index];

        if (result && result.element) {
            result.element.classList.add('library-search__current-result');
            result.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        updateSearchUI();
    }

    /**
     * Go to next result
     */
    function goToNextResult() {
        if (state.searchResults.length === 0) return;

        let nextIndex = state.currentResultIndex + 1;
        if (nextIndex >= state.searchResults.length) {
            nextIndex = 0; // Wrap around
        }

        goToResult(nextIndex);
    }

    /**
     * Go to previous result
     */
    function goToPreviousResult() {
        if (state.searchResults.length === 0) return;

        let prevIndex = state.currentResultIndex - 1;
        if (prevIndex < 0) {
            prevIndex = state.searchResults.length - 1; // Wrap around
        }

        goToResult(prevIndex);
    }

    /**
     * Clear search
     */
    function clearSearch() {
        if (elements.searchInput) {
            elements.searchInput.value = '';
        }

        state.searchQuery = '';
        state.searchResults = [];
        state.currentResultIndex = -1;

        clearHighlights();
        updateSearchUI();

        elements.clearBtn?.classList.add('hidden');
        elements.searchNav?.classList.add('hidden');
    }

    /**
     * Handle URL reference on page load
     */
    function handleUrlReference() {
        const hash = window.location.hash.substring(1);
        if (!hash) return;

        // Handle canonical reference format in URL
        if (hash.includes('-') && hash.includes(':')) {
            const match = hash.match(/^(\w+)-(\d+):(\d+)$/);
            if (match) {
                const [, code, chapter, paragraph] = match;
                setTimeout(() => goToReference(parseInt(chapter), parseInt(paragraph)), 500);
            }
        }
    }

    /**
     * Escape HTML
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Debounce function
     */
    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    /**
     * Show toast notification
     */
    function showToast(message) {
        if (window.LibraryReader && window.LibraryReader.showToast) {
            window.LibraryReader.showToast(message);
        }
    }

    // Public API
    return {
        init,
        search: performSearch,
        goToReference,
        goToNextResult,
        goToPreviousResult,
        clearSearch,
        getResults: () => [...state.searchResults]
    };
})();

// Auto-initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    LibrarySearch.init();
});

// Make available globally
window.LibrarySearch = LibrarySearch;
