/**
 * Library Storage - Persistent user data for the Library
 *
 * Provides localStorage-based persistence for:
 * - Reading preferences (font size, theme, view mode)
 * - Reading progress (last position per book)
 * - Bookmarks
 * - Highlights
 * - Notes
 *
 * Inspired by Sefaria's study tools approach.
 */

const LibraryStorage = (function() {
    'use strict';

    const STORAGE_PREFIX = 'woh_library_';
    const STORAGE_VERSION = 1;

    // Storage keys
    const KEYS = {
        VERSION: STORAGE_PREFIX + 'version',
        PREFERENCES: STORAGE_PREFIX + 'preferences',
        PROGRESS: STORAGE_PREFIX + 'progress',
        BOOKMARKS: STORAGE_PREFIX + 'bookmarks',
        HIGHLIGHTS: STORAGE_PREFIX + 'highlights',
        NOTES: STORAGE_PREFIX + 'notes',
        HISTORY: STORAGE_PREFIX + 'history'
    };

    // Default preferences
    const DEFAULT_PREFERENCES = {
        fontSize: 'medium', // small, medium, large, x-large
        theme: 'auto',      // light, sepia, dark, auto
        viewMode: 'translation', // translation, original, side-by-side
        showParagraphNumbers: true,
        autoSaveProgress: true
    };

    /**
     * Initialize storage and migrate if needed
     */
    function init() {
        const version = getItem(KEYS.VERSION);
        if (!version || version < STORAGE_VERSION) {
            migrate(version || 0);
            setItem(KEYS.VERSION, STORAGE_VERSION);
        }
    }

    /**
     * Migrate storage from older versions
     */
    function migrate(fromVersion) {
        // Future migrations can be added here
        console.log(`[LibraryStorage] Migrated from version ${fromVersion} to ${STORAGE_VERSION}`);
    }

    /**
     * Get item from localStorage with JSON parsing
     */
    function getItem(key) {
        try {
            const value = localStorage.getItem(key);
            return value ? JSON.parse(value) : null;
        } catch (e) {
            console.error('[LibraryStorage] Error reading:', key, e);
            return null;
        }
    }

    /**
     * Set item in localStorage with JSON stringification
     */
    function setItem(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            console.error('[LibraryStorage] Error writing:', key, e);
            return false;
        }
    }

    /**
     * Remove item from localStorage
     */
    function removeItem(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (e) {
            console.error('[LibraryStorage] Error removing:', key, e);
            return false;
        }
    }

    // =====================================================
    // Preferences API
    // =====================================================

    function getPreferences() {
        const stored = getItem(KEYS.PREFERENCES);
        return { ...DEFAULT_PREFERENCES, ...stored };
    }

    function setPreference(key, value) {
        const prefs = getPreferences();
        prefs[key] = value;
        return setItem(KEYS.PREFERENCES, prefs);
    }

    function getPreference(key) {
        const prefs = getPreferences();
        return prefs[key];
    }

    function resetPreferences() {
        return setItem(KEYS.PREFERENCES, DEFAULT_PREFERENCES);
    }

    // =====================================================
    // Reading Progress API
    // =====================================================

    function getProgress(bookSlug) {
        const allProgress = getItem(KEYS.PROGRESS) || {};
        return allProgress[bookSlug] || null;
    }

    function getAllProgress() {
        return getItem(KEYS.PROGRESS) || {};
    }

    function updateProgress(bookSlug, data) {
        const allProgress = getItem(KEYS.PROGRESS) || {};
        allProgress[bookSlug] = {
            ...allProgress[bookSlug],
            ...data,
            lastRead: new Date().toISOString()
        };
        return setItem(KEYS.PROGRESS, allProgress);
    }

    function clearProgress(bookSlug) {
        const allProgress = getItem(KEYS.PROGRESS) || {};
        delete allProgress[bookSlug];
        return setItem(KEYS.PROGRESS, allProgress);
    }

    // =====================================================
    // Bookmarks API
    // =====================================================

    function getBookmarks(bookSlug) {
        const allBookmarks = getItem(KEYS.BOOKMARKS) || {};
        if (bookSlug) {
            return allBookmarks[bookSlug] || [];
        }
        return allBookmarks;
    }

    function addBookmark(bookSlug, refId, note = '') {
        const allBookmarks = getItem(KEYS.BOOKMARKS) || {};
        if (!allBookmarks[bookSlug]) {
            allBookmarks[bookSlug] = [];
        }

        // Check if already bookmarked
        const existing = allBookmarks[bookSlug].find(b => b.refId === refId);
        if (existing) {
            existing.note = note;
            existing.updatedAt = new Date().toISOString();
        } else {
            allBookmarks[bookSlug].push({
                refId,
                note,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
        }

        return setItem(KEYS.BOOKMARKS, allBookmarks);
    }

    function removeBookmark(bookSlug, refId) {
        const allBookmarks = getItem(KEYS.BOOKMARKS) || {};
        if (allBookmarks[bookSlug]) {
            allBookmarks[bookSlug] = allBookmarks[bookSlug].filter(b => b.refId !== refId);
            return setItem(KEYS.BOOKMARKS, allBookmarks);
        }
        return true;
    }

    function isBookmarked(bookSlug, refId) {
        const bookmarks = getBookmarks(bookSlug);
        return bookmarks.some(b => b.refId === refId);
    }

    // =====================================================
    // Highlights API
    // =====================================================

    function getHighlights(bookSlug) {
        const allHighlights = getItem(KEYS.HIGHLIGHTS) || {};
        if (bookSlug) {
            return allHighlights[bookSlug] || [];
        }
        return allHighlights;
    }

    function addHighlight(bookSlug, refId, color, text) {
        const allHighlights = getItem(KEYS.HIGHLIGHTS) || {};
        if (!allHighlights[bookSlug]) {
            allHighlights[bookSlug] = [];
        }

        allHighlights[bookSlug].push({
            refId,
            color,
            text,
            createdAt: new Date().toISOString()
        });

        return setItem(KEYS.HIGHLIGHTS, allHighlights);
    }

    function removeHighlight(bookSlug, highlightId) {
        const allHighlights = getItem(KEYS.HIGHLIGHTS) || {};
        if (allHighlights[bookSlug]) {
            allHighlights[bookSlug] = allHighlights[bookSlug].filter(h => h.id !== highlightId);
            return setItem(KEYS.HIGHLIGHTS, allHighlights);
        }
        return true;
    }

    // =====================================================
    // Notes API
    // =====================================================

    function getNotes(bookSlug) {
        const allNotes = getItem(KEYS.NOTES) || {};
        if (bookSlug) {
            return allNotes[bookSlug] || [];
        }
        return allNotes;
    }

    function addNote(bookSlug, refId, content) {
        const allNotes = getItem(KEYS.NOTES) || {};
        if (!allNotes[bookSlug]) {
            allNotes[bookSlug] = [];
        }

        // Check if note exists for this ref
        const existing = allNotes[bookSlug].find(n => n.refId === refId);
        if (existing) {
            existing.content = content;
            existing.updatedAt = new Date().toISOString();
        } else {
            allNotes[bookSlug].push({
                refId,
                content,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
        }

        return setItem(KEYS.NOTES, allNotes);
    }

    function updateNote(bookSlug, refId, content) {
        return addNote(bookSlug, refId, content);
    }

    function removeNote(bookSlug, refId) {
        const allNotes = getItem(KEYS.NOTES) || {};
        if (allNotes[bookSlug]) {
            allNotes[bookSlug] = allNotes[bookSlug].filter(n => n.refId !== refId);
            return setItem(KEYS.NOTES, allNotes);
        }
        return true;
    }

    function getNote(bookSlug, refId) {
        const notes = getNotes(bookSlug);
        return notes.find(n => n.refId === refId) || null;
    }

    // =====================================================
    // Reading History API
    // =====================================================

    function addToHistory(bookSlug, bookTitle, refId) {
        const history = getItem(KEYS.HISTORY) || [];

        // Remove if exists (to move to top)
        const filtered = history.filter(h => h.bookSlug !== bookSlug);

        // Add to beginning
        filtered.unshift({
            bookSlug,
            bookTitle,
            lastRefId: refId,
            visitedAt: new Date().toISOString()
        });

        // Keep only last 20 entries
        const trimmed = filtered.slice(0, 20);

        return setItem(KEYS.HISTORY, trimmed);
    }

    function getHistory() {
        return getItem(KEYS.HISTORY) || [];
    }

    function clearHistory() {
        return removeItem(KEYS.HISTORY);
    }

    // =====================================================
    // Export/Import API
    // =====================================================

    function exportData() {
        return {
            version: STORAGE_VERSION,
            exportedAt: new Date().toISOString(),
            preferences: getItem(KEYS.PREFERENCES),
            progress: getItem(KEYS.PROGRESS),
            bookmarks: getItem(KEYS.BOOKMARKS),
            highlights: getItem(KEYS.HIGHLIGHTS),
            notes: getItem(KEYS.NOTES),
            history: getItem(KEYS.HISTORY)
        };
    }

    function importData(data) {
        if (!data || data.version > STORAGE_VERSION) {
            console.error('[LibraryStorage] Invalid or newer import data');
            return false;
        }

        try {
            if (data.preferences) setItem(KEYS.PREFERENCES, data.preferences);
            if (data.progress) setItem(KEYS.PROGRESS, data.progress);
            if (data.bookmarks) setItem(KEYS.BOOKMARKS, data.bookmarks);
            if (data.highlights) setItem(KEYS.HIGHLIGHTS, data.highlights);
            if (data.notes) setItem(KEYS.NOTES, data.notes);
            if (data.history) setItem(KEYS.HISTORY, data.history);
            return true;
        } catch (e) {
            console.error('[LibraryStorage] Import error:', e);
            return false;
        }
    }

    function clearAllData() {
        Object.values(KEYS).forEach(key => removeItem(key));
        return true;
    }

    // =====================================================
    // Statistics API
    // =====================================================

    function getStats() {
        const progress = getAllProgress();
        const bookmarks = getBookmarks();
        const notes = getNotes();

        let totalBookmarks = 0;
        let totalNotes = 0;
        let booksStarted = Object.keys(progress).length;

        Object.values(bookmarks).forEach(arr => totalBookmarks += arr.length);
        Object.values(notes).forEach(arr => totalNotes += arr.length);

        return {
            booksStarted,
            totalBookmarks,
            totalNotes
        };
    }

    // Initialize on load
    init();

    // Public API
    return {
        // Preferences
        getPreferences,
        setPreference,
        getPreference,
        resetPreferences,

        // Progress
        getProgress,
        getAllProgress,
        updateProgress,
        clearProgress,

        // Bookmarks
        getBookmarks,
        addBookmark,
        removeBookmark,
        isBookmarked,

        // Highlights
        getHighlights,
        addHighlight,
        removeHighlight,

        // Notes
        getNotes,
        addNote,
        updateNote,
        removeNote,
        getNote,

        // History
        addToHistory,
        getHistory,
        clearHistory,

        // Export/Import
        exportData,
        importData,
        clearAllData,

        // Statistics
        getStats
    };
})();

// Make available globally
window.LibraryStorage = LibraryStorage;
