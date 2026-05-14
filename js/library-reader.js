/**
 * Library Reader - Reading experience enhancements
 *
 * Features:
 * - Font size adjustment (small, medium, large, x-large)
 * - Theme selection (light, sepia, dark)
 * - View mode (translation only, original only, side-by-side)
 * - Reading progress tracking
 * - Keyboard navigation
 * - Reference URL handling
 *
 * Requires: library-storage.js
 */

const LibraryReader = (function() {
    'use strict';

    // Configuration
    const CONFIG = {
        fontSizes: {
            small: '0.875rem',
            medium: '1rem',
            large: '1.125rem',
            'x-large': '1.25rem'
        },
        themes: ['light', 'sepia', 'dark'],
        viewModes: ['translation', 'original', 'side-by-side'],
        progressSaveInterval: 3000, // ms
        scrollDebounceDelay: 150
    };

    // State
    let state = {
        bookSlug: null,
        bookCode: null,
        currentChapter: 1,
        currentParagraph: 1,
        totalChapters: 1,
        isInitialized: false,
        progressSaveTimeout: null
    };

    // DOM elements cache
    let elements = {};

    /**
     * Initialize the reader
     */
    function init(options = {}) {
        if (state.isInitialized) return;

        // Get book info from data attributes or options
        const bookContainer = document.querySelector('.library-book');
        if (!bookContainer) {
            console.log('[LibraryReader] Not on a book page, skipping init');
            return;
        }

        state.bookSlug = options.bookSlug || bookContainer.dataset.bookSlug || getBookSlugFromUrl();
        state.bookCode = options.bookCode || bookContainer.dataset.bookCode || '';
        state.totalChapters = document.querySelectorAll('.library-book__chapter').length;

        // Cache DOM elements
        cacheElements();

        // Apply stored preferences
        applyStoredPreferences();

        // Set up event listeners
        setupEventListeners();

        // Handle deep linking
        handleDeepLink();

        // Restore reading progress
        restoreProgress();

        // Add to reading history
        if (window.LibraryStorage) {
            const title = document.querySelector('.library-book__title')?.textContent || state.bookSlug;
            window.LibraryStorage.addToHistory(state.bookSlug, title, getCurrentRef());
        }

        state.isInitialized = true;
        console.log('[LibraryReader] Initialized for:', state.bookSlug);
    }

    /**
     * Get book slug from current URL
     */
    function getBookSlugFromUrl() {
        const path = window.location.pathname;
        const match = path.match(/\/library\/([^/]+)/);
        return match ? match[1] : '';
    }

    /**
     * Cache DOM elements for performance
     */
    function cacheElements() {
        elements = {
            container: document.querySelector('.library-book'),
            content: document.querySelector('.library-book__content'),
            chapters: document.querySelectorAll('.library-book__chapter'),
            paragraphs: document.querySelectorAll('.library-book__paragraph'),
            tocItems: document.querySelectorAll('.library-book__toc-item'),
            chapterProgress: document.getElementById('chapter-progress'),
            paragraphProgress: document.getElementById('paragraph-progress'),
            currentChapterDisplay: document.getElementById('current-chapter-display'),
            settingsBtn: document.getElementById('reader-settings-btn'),
            settingsPanel: document.getElementById('reader-settings-panel')
        };
    }

    /**
     * Apply stored preferences from localStorage
     */
    function applyStoredPreferences() {
        if (!window.LibraryStorage) return;

        const prefs = window.LibraryStorage.getPreferences();

        // Apply font size
        setFontSize(prefs.fontSize, false);

        // Apply reader theme
        setReaderTheme(prefs.theme, false);

        // Apply view mode
        setViewMode(prefs.viewMode, false);
    }

    /**
     * Set font size for reading content
     */
    function setFontSize(size, save = true) {
        if (!CONFIG.fontSizes[size]) return;

        const content = elements.content || document.querySelector('.library-book__content');
        if (content) {
            content.style.setProperty('--reader-font-size', CONFIG.fontSizes[size]);
            content.dataset.fontSize = size;
        }

        // Update button states
        document.querySelectorAll('[data-font-size]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.fontSize === size);
        });

        if (save && window.LibraryStorage) {
            window.LibraryStorage.setPreference('fontSize', size);
        }
    }

    /**
     * Set reader theme (light, sepia, dark)
     */
    function setReaderTheme(theme, save = true) {
        const container = elements.container || document.querySelector('.library-book');
        if (!container) return;

        // Remove existing theme classes
        CONFIG.themes.forEach(t => container.classList.remove(`library-book--theme-${t}`));

        // Apply new theme (or inherit from system if 'auto')
        if (theme !== 'auto') {
            container.classList.add(`library-book--theme-${theme}`);
        }

        container.dataset.readerTheme = theme;

        // Update button states
        document.querySelectorAll('[data-reader-theme]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.readerTheme === theme);
        });

        if (save && window.LibraryStorage) {
            window.LibraryStorage.setPreference('theme', theme);
        }
    }

    /**
     * Set view mode (translation, original, side-by-side)
     */
    function setViewMode(mode, save = true) {
        const textContents = document.querySelectorAll('.library-book__text');
        const originalTexts = document.querySelectorAll('.library-book__para-original');

        textContents.forEach(tc => {
            tc.classList.remove('library-book__text--split');
            if (mode === 'side-by-side') {
                tc.classList.add('library-book__text--split');
            }
        });

        originalTexts.forEach(ot => {
            if (mode === 'original' || mode === 'side-by-side') {
                ot.style.display = 'block';
            } else {
                ot.style.display = 'none';
            }
        });

        // Hide translation if original-only mode
        const translationTexts = document.querySelectorAll('.library-book__para-translation');
        translationTexts.forEach(tt => {
            tt.style.display = mode === 'original' ? 'none' : 'block';
        });

        // Update UI
        const originalToggle = document.getElementById('original-toggle');
        const sideBySideToggle = document.getElementById('side-by-side-toggle');

        if (originalToggle) {
            originalToggle.classList.toggle('library-book__btn--active',
                mode === 'original' || mode === 'side-by-side');
        }

        if (sideBySideToggle) {
            sideBySideToggle.classList.toggle('hidden', mode === 'translation');
            sideBySideToggle.classList.toggle('library-book__btn--active', mode === 'side-by-side');
        }

        if (save && window.LibraryStorage) {
            window.LibraryStorage.setPreference('viewMode', mode);
        }
    }

    /**
     * Toggle between view modes
     */
    function cycleViewMode() {
        const prefs = window.LibraryStorage ? window.LibraryStorage.getPreferences() : { viewMode: 'translation' };
        const currentIndex = CONFIG.viewModes.indexOf(prefs.viewMode);
        const nextIndex = (currentIndex + 1) % CONFIG.viewModes.length;
        setViewMode(CONFIG.viewModes[nextIndex]);
    }

    /**
     * Set up event listeners
     */
    function setupEventListeners() {
        // Scroll tracking for progress
        let scrollTimeout;
        window.addEventListener('scroll', () => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                updateCurrentPosition();
                scheduleProgressSave();
            }, CONFIG.scrollDebounceDelay);
        }, { passive: true });

        // Keyboard shortcuts
        document.addEventListener('keydown', handleKeyboard);

        // Settings panel toggle
        if (elements.settingsBtn) {
            elements.settingsBtn.addEventListener('click', toggleSettingsPanel);
        }

        // Font size buttons
        document.querySelectorAll('[data-font-size]').forEach(btn => {
            btn.addEventListener('click', () => setFontSize(btn.dataset.fontSize));
        });

        // Theme buttons
        document.querySelectorAll('[data-reader-theme]').forEach(btn => {
            btn.addEventListener('click', () => setReaderTheme(btn.dataset.readerTheme));
        });

        // Paragraph click for selection
        elements.paragraphs.forEach(para => {
            para.addEventListener('click', () => {
                selectParagraph(para.id);
            });
        });
    }

    /**
     * Handle keyboard shortcuts
     */
    function handleKeyboard(e) {
        // Ignore if in input field
        if (e.target.matches('input, textarea, select')) return;

        switch (e.key) {
            case 'j': // Next paragraph
                navigateParagraph(1);
                break;
            case 'k': // Previous paragraph
                navigateParagraph(-1);
                break;
            case 'n': // Next chapter
                navigateChapter(1);
                break;
            case 'p': // Previous chapter
                navigateChapter(-1);
                break;
            case 'b': // Toggle bookmark
                toggleCurrentBookmark();
                break;
            case 'o': // Toggle original text
                toggleOriginal();
                break;
            case 's': // Toggle side-by-side
                toggleSideBySide();
                break;
            case '/': // Focus search
                e.preventDefault();
                focusSearch();
                break;
            case 'Escape':
                closeAllPanels();
                break;
            case '?': // Show keyboard shortcuts
                if (e.shiftKey) {
                    showKeyboardShortcuts();
                }
                break;
        }
    }

    /**
     * Navigate paragraphs
     */
    function navigateParagraph(direction) {
        const paragraphs = Array.from(elements.paragraphs);
        const current = document.querySelector('.library-book__paragraph--selected');
        let currentIndex = current ? paragraphs.indexOf(current) : -1;

        let newIndex = currentIndex + direction;
        if (newIndex < 0) newIndex = 0;
        if (newIndex >= paragraphs.length) newIndex = paragraphs.length - 1;

        if (paragraphs[newIndex]) {
            selectParagraph(paragraphs[newIndex].id);
            paragraphs[newIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    /**
     * Navigate chapters
     */
    function navigateChapter(direction) {
        const newChapter = state.currentChapter + direction;
        if (newChapter >= 1 && newChapter <= state.totalChapters) {
            scrollToChapter(newChapter);
        }
    }

    /**
     * Select a paragraph
     */
    function selectParagraph(paragraphId) {
        // Remove previous selection
        elements.paragraphs.forEach(p => p.classList.remove('library-book__paragraph--selected'));

        // Select new paragraph
        const para = document.getElementById(paragraphId);
        if (para) {
            para.classList.add('library-book__paragraph--selected');

            // Update URL
            const newUrl = window.location.pathname + '#' + paragraphId;
            history.replaceState(null, null, newUrl);

            // Schedule progress save
            scheduleProgressSave();
        }
    }

    /**
     * Scroll to specific chapter
     */
    function scrollToChapter(chapterNumber) {
        const chapter = document.getElementById('chapter-' + chapterNumber);
        if (chapter) {
            chapter.scrollIntoView({ behavior: 'smooth', block: 'start' });
            state.currentChapter = chapterNumber;
            updateProgressDisplay();
        }
    }

    /**
     * Update current reading position based on scroll
     */
    function updateCurrentPosition() {
        const scrollPos = window.scrollY + 300;

        // Find current chapter
        elements.chapters.forEach(chapter => {
            const rect = chapter.getBoundingClientRect();
            const top = rect.top + window.scrollY;
            const bottom = top + rect.height;

            if (scrollPos >= top && scrollPos < bottom) {
                const chapterNum = parseInt(chapter.id.replace('chapter-', ''));
                if (chapterNum !== state.currentChapter) {
                    state.currentChapter = chapterNum;
                    updateProgressDisplay();
                    updateTocHighlight();
                }
            }
        });

        // Find current paragraph
        elements.paragraphs.forEach(para => {
            const rect = para.getBoundingClientRect();
            const top = rect.top + window.scrollY;
            const bottom = top + rect.height;

            if (scrollPos >= top && scrollPos < bottom) {
                const match = para.id.match(/^c(\d+)p(\d+)$/);
                if (match) {
                    state.currentParagraph = parseInt(match[2]);
                    updateProgressDisplay();
                }
            }
        });
    }

    /**
     * Update progress display UI
     */
    function updateProgressDisplay() {
        if (elements.chapterProgress) {
            elements.chapterProgress.textContent = `Chapter ${state.currentChapter}`;
        }

        if (elements.paragraphProgress) {
            const chapter = document.getElementById(`chapter-${state.currentChapter}`);
            const totalInChapter = chapter ?
                chapter.querySelectorAll('.library-book__paragraph').length : 0;
            elements.paragraphProgress.textContent = `${state.currentParagraph}/${totalInChapter}`;
        }

        if (elements.currentChapterDisplay) {
            elements.currentChapterDisplay.textContent =
                `Chapter ${state.currentChapter} of ${state.totalChapters}`;
        }
    }

    /**
     * Update ToC highlight
     */
    function updateTocHighlight() {
        elements.tocItems.forEach(item => {
            const itemChapter = parseInt(item.dataset.chapter);
            item.classList.toggle('library-book__toc-item--active',
                itemChapter === state.currentChapter);
        });
    }

    /**
     * Get current reference ID
     */
    function getCurrentRef() {
        return `${state.bookCode}-${state.currentChapter}:${state.currentParagraph}`;
    }

    /**
     * Schedule progress save (debounced)
     */
    function scheduleProgressSave() {
        if (!window.LibraryStorage) return;

        clearTimeout(state.progressSaveTimeout);
        state.progressSaveTimeout = setTimeout(() => {
            const prefs = window.LibraryStorage.getPreferences();
            if (prefs.autoSaveProgress) {
                window.LibraryStorage.updateProgress(state.bookSlug, {
                    chapter: state.currentChapter,
                    paragraph: state.currentParagraph,
                    refId: getCurrentRef(),
                    scrollPosition: window.scrollY
                });
            }
        }, CONFIG.progressSaveInterval);
    }

    /**
     * Restore reading progress
     */
    function restoreProgress() {
        if (!window.LibraryStorage) return;

        const progress = window.LibraryStorage.getProgress(state.bookSlug);
        if (progress && progress.chapter && !window.location.hash) {
            // Show continue reading prompt
            showContinueReadingPrompt(progress);
        }
    }

    /**
     * Show continue reading prompt
     */
    function showContinueReadingPrompt(progress) {
        const prompt = document.createElement('div');
        prompt.className = 'library-reader__continue-prompt';
        prompt.innerHTML = `
            <div class="library-reader__continue-content">
                <span class="library-reader__continue-text">
                    Continue from Chapter ${progress.chapter}, Paragraph ${progress.paragraph}?
                </span>
                <div class="library-reader__continue-actions">
                    <button class="library-reader__continue-btn library-reader__continue-btn--primary" data-action="continue">
                        Continue
                    </button>
                    <button class="library-reader__continue-btn" data-action="dismiss">
                        Start Over
                    </button>
                </div>
            </div>
        `;

        prompt.querySelector('[data-action="continue"]').addEventListener('click', () => {
            const paraId = `c${progress.chapter}p${progress.paragraph}`;
            const para = document.getElementById(paraId);
            if (para) {
                para.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => selectParagraph(paraId), 500);
            }
            prompt.remove();
        });

        prompt.querySelector('[data-action="dismiss"]').addEventListener('click', () => {
            prompt.remove();
        });

        document.body.appendChild(prompt);

        // Auto-dismiss after 10 seconds
        setTimeout(() => prompt.remove(), 10000);
    }

    /**
     * Handle deep linking (hash URLs)
     */
    function handleDeepLink() {
        const hash = window.location.hash.substring(1);
        if (!hash) return;

        // Canonical reference format: TBWTT-1:5 or direct ID: c1p5
        if (hash.includes('-') && hash.includes(':')) {
            // Canonical format
            const match = hash.match(/^(\w+)-(\d+):(\d+)$/);
            if (match) {
                const [, code, chapter, para] = match;
                const paraId = `c${chapter}p${para}`;
                setTimeout(() => {
                    const element = document.getElementById(paraId);
                    if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        selectParagraph(paraId);
                    }
                }, 300);
            }
        } else if (hash.match(/^c\d+p\d+$/)) {
            // Direct paragraph ID
            setTimeout(() => {
                const element = document.getElementById(hash);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    selectParagraph(hash);
                }
            }, 300);
        } else if (hash.startsWith('chapter-')) {
            // Chapter anchor
            const chapterNum = parseInt(hash.replace('chapter-', ''));
            setTimeout(() => scrollToChapter(chapterNum), 300);
        }
    }

    /**
     * Toggle bookmark for current paragraph
     */
    function toggleCurrentBookmark() {
        if (!window.LibraryStorage) return;

        const selected = document.querySelector('.library-book__paragraph--selected');
        if (!selected) return;

        const refId = getCurrentRef();
        if (window.LibraryStorage.isBookmarked(state.bookSlug, refId)) {
            window.LibraryStorage.removeBookmark(state.bookSlug, refId);
            selected.classList.remove('library-book__paragraph--bookmarked');
            showToast('Bookmark removed');
        } else {
            window.LibraryStorage.addBookmark(state.bookSlug, refId);
            selected.classList.add('library-book__paragraph--bookmarked');
            showToast('Bookmark added');
        }
    }

    /**
     * Toggle original text display
     */
    function toggleOriginal() {
        const prefs = window.LibraryStorage ? window.LibraryStorage.getPreferences() : { viewMode: 'translation' };
        const current = prefs.viewMode;

        if (current === 'translation') {
            setViewMode('original');
        } else if (current === 'original') {
            setViewMode('side-by-side');
        } else {
            setViewMode('translation');
        }
    }

    /**
     * Toggle side-by-side view
     */
    function toggleSideBySide() {
        const prefs = window.LibraryStorage ? window.LibraryStorage.getPreferences() : { viewMode: 'translation' };
        const current = prefs.viewMode;

        if (current === 'side-by-side') {
            setViewMode('original');
        } else if (current !== 'translation') {
            setViewMode('side-by-side');
        }
    }

    /**
     * Focus search input
     */
    function focusSearch() {
        const search = document.getElementById('library-search') ||
                       document.getElementById('book-search');
        if (search) {
            search.focus();
        }
    }

    /**
     * Close all open panels
     */
    function closeAllPanels() {
        // Close settings panel
        if (elements.settingsPanel) {
            elements.settingsPanel.classList.add('hidden');
        }

        // Deselect paragraph
        elements.paragraphs.forEach(p => p.classList.remove('library-book__paragraph--selected'));
    }

    /**
     * Toggle settings panel
     */
    function toggleSettingsPanel() {
        if (elements.settingsPanel) {
            elements.settingsPanel.classList.toggle('hidden');
        }
    }

    /**
     * Show keyboard shortcuts modal
     */
    function showKeyboardShortcuts() {
        const modal = document.createElement('div');
        modal.className = 'library-reader__shortcuts-modal';
        modal.innerHTML = `
            <div class="library-reader__shortcuts-content">
                <h3>Keyboard Shortcuts</h3>
                <ul>
                    <li><kbd>j</kbd> / <kbd>k</kbd> - Next / Previous paragraph</li>
                    <li><kbd>n</kbd> / <kbd>p</kbd> - Next / Previous chapter</li>
                    <li><kbd>b</kbd> - Toggle bookmark</li>
                    <li><kbd>o</kbd> - Toggle original text</li>
                    <li><kbd>s</kbd> - Toggle side-by-side view</li>
                    <li><kbd>/</kbd> - Focus search</li>
                    <li><kbd>Esc</kbd> - Close panels</li>
                    <li><kbd>?</kbd> - Show this help</li>
                </ul>
                <button class="library-reader__shortcuts-close">Close</button>
            </div>
        `;

        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.matches('.library-reader__shortcuts-close')) {
                modal.remove();
            }
        });

        document.body.appendChild(modal);
    }

    /**
     * Show toast notification
     */
    function showToast(message, duration = 2000) {
        const existing = document.querySelector('.library-reader__toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'library-reader__toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => toast.classList.add('library-reader__toast--visible'), 10);
        setTimeout(() => {
            toast.classList.remove('library-reader__toast--visible');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    // Public API
    return {
        init,
        setFontSize,
        setReaderTheme,
        setViewMode,
        cycleViewMode,
        selectParagraph,
        scrollToChapter,
        toggleCurrentBookmark,
        showToast,
        getCurrentRef,
        getState: () => ({ ...state })
    };
})();

// Auto-initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    LibraryReader.init();
});

// Make available globally
window.LibraryReader = LibraryReader;
