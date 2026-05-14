/**
 * Library Study Tools - Bookmarks, Highlights, and Notes
 *
 * Features:
 * - Bookmark paragraphs with optional notes
 * - Highlight text with colors
 * - Add notes to paragraphs
 * - Study panel showing all annotations
 * - Export/import study data
 *
 * Requires: library-storage.js
 */

const LibraryStudyTools = (function() {
    'use strict';

    // Configuration
    const CONFIG = {
        highlightColors: [
            { id: 'yellow', name: 'Yellow', color: '#fef08a' },
            { id: 'green', name: 'Green', color: '#bbf7d0' },
            { id: 'blue', name: 'Blue', color: '#bfdbfe' },
            { id: 'pink', name: 'Pink', color: '#fbcfe8' }
        ]
    };

    // State
    let state = {
        bookSlug: null,
        bookCode: null,
        isInitialized: false,
        isPanelOpen: false
    };

    // DOM elements cache
    let elements = {};

    /**
     * Initialize study tools
     */
    function init(options = {}) {
        if (state.isInitialized) return;

        const bookContainer = document.querySelector('.library-book');
        if (!bookContainer || !window.LibraryStorage) {
            console.log('[LibraryStudyTools] Not on a book page or storage unavailable');
            return;
        }

        state.bookSlug = options.bookSlug || bookContainer.dataset.bookSlug || getBookSlugFromUrl();
        state.bookCode = options.bookCode || bookContainer.dataset.bookCode || '';

        // Create study tools UI
        createStudyToolsUI();

        // Cache DOM elements
        cacheElements();

        // Set up event listeners
        setupEventListeners();

        // Render existing annotations
        renderExistingAnnotations();

        state.isInitialized = true;
        console.log('[LibraryStudyTools] Initialized for:', state.bookSlug);
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
     * Create study tools UI elements
     */
    function createStudyToolsUI() {
        // Add bookmark buttons to paragraphs
        document.querySelectorAll('.library-book__paragraph').forEach(para => {
            addParagraphTools(para);
        });

        // Create study panel (sidebar for viewing all annotations)
        createStudyPanel();

        // Create highlight color picker popup
        createHighlightPicker();
    }

    /**
     * Add bookmark/note buttons to a paragraph. Buttons are inserted
     * into the dedicated .library-book__para-actions column (alongside
     * the share button) so they stack vertically in their own gutter
     * and never overlap the paragraph text. Falls back to appending to
     * the paragraph itself if no actions column is present.
     */
    function addParagraphTools(para) {
        const refId = para.dataset.refId || para.id;
        const existingToolbar = para.querySelector('.study-tools__para-toolbar');
        if (existingToolbar) return;

        const toolbar = document.createElement('div');
        toolbar.className = 'study-tools__para-toolbar';
        toolbar.innerHTML = `
            <button class="study-tools__btn study-tools__btn--bookmark"
                    data-action="bookmark"
                    data-ref="${refId}"
                    title="Bookmark (b)"
                    aria-label="Bookmark this paragraph">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                </svg>
            </button>
            <button class="study-tools__btn study-tools__btn--note"
                    data-action="note"
                    data-ref="${refId}"
                    title="Add note"
                    aria-label="Add note to this paragraph">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <line x1="10" y1="9" x2="8" y2="9"></line>
                </svg>
            </button>
        `;

        const actions = para.querySelector('.library-book__para-actions');
        if (actions) {
            actions.appendChild(toolbar);
        } else {
            para.appendChild(toolbar);
        }

        // Check if already bookmarked
        if (window.LibraryStorage.isBookmarked(state.bookSlug, refId)) {
            toolbar.querySelector('[data-action="bookmark"]').classList.add('active');
        }

        // Check if has note
        if (window.LibraryStorage.getNote(state.bookSlug, refId)) {
            toolbar.querySelector('[data-action="note"]').classList.add('has-note');
        }
    }

    /**
     * Create the study panel (for viewing all annotations)
     */
    function createStudyPanel() {
        const panel = document.createElement('div');
        panel.id = 'study-panel';
        panel.className = 'study-panel hidden';
        panel.innerHTML = `
            <div class="study-panel__header">
                <h3 class="study-panel__title">My Study Notes</h3>
                <button class="study-panel__close" aria-label="Close panel">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            <div class="study-panel__tabs" role="tablist">
                <button class="study-panel__tab study-panel__tab--active" data-tab="bookmarks" role="tab">
                    Bookmarks
                </button>
                <button class="study-panel__tab" data-tab="notes" role="tab">
                    Notes
                </button>
            </div>
            <div class="study-panel__content">
                <div class="study-panel__list" id="study-panel-bookmarks"></div>
                <div class="study-panel__list hidden" id="study-panel-notes"></div>
            </div>
            <div class="study-panel__footer">
                <button class="study-panel__export" data-action="export">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    Export
                </button>
                <button class="study-panel__import" data-action="import">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                    </svg>
                    Import
                </button>
            </div>
        `;

        document.body.appendChild(panel);

        // Add toggle button to controls
        const controlsActions = document.querySelector('.library-book__actions');
        if (controlsActions) {
            const toggleBtn = document.createElement('button');
            toggleBtn.id = 'study-panel-toggle';
            toggleBtn.className = 'library-book__btn library-book__btn--secondary';
            toggleBtn.title = 'My Notes';
            toggleBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                </svg>
                <span class="desktop-only">Notes</span>
                <span class="study-panel__badge hidden" id="study-badge">0</span>
            `;
            controlsActions.appendChild(toggleBtn);
        }
    }

    /**
     * Create highlight color picker popup
     */
    function createHighlightPicker() {
        const picker = document.createElement('div');
        picker.id = 'highlight-picker';
        picker.className = 'highlight-picker hidden';
        picker.innerHTML = `
            <div class="highlight-picker__colors">
                ${CONFIG.highlightColors.map(c => `
                    <button class="highlight-picker__color"
                            data-color="${c.id}"
                            style="background-color: ${c.color}"
                            title="${c.name}">
                    </button>
                `).join('')}
                <button class="highlight-picker__remove" data-action="remove-highlight" title="Remove">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        `;

        document.body.appendChild(picker);
    }

    /**
     * Cache DOM elements
     */
    function cacheElements() {
        elements = {
            panel: document.getElementById('study-panel'),
            panelToggle: document.getElementById('study-panel-toggle'),
            bookmarksList: document.getElementById('study-panel-bookmarks'),
            notesList: document.getElementById('study-panel-notes'),
            badge: document.getElementById('study-badge'),
            highlightPicker: document.getElementById('highlight-picker'),
            paragraphs: document.querySelectorAll('.library-book__paragraph')
        };
    }

    /**
     * Set up event listeners
     */
    function setupEventListeners() {
        // Panel toggle
        if (elements.panelToggle) {
            elements.panelToggle.addEventListener('click', togglePanel);
        }

        // Panel close
        const closeBtn = elements.panel?.querySelector('.study-panel__close');
        if (closeBtn) {
            closeBtn.addEventListener('click', closePanel);
        }

        // Tab switching
        elements.panel?.querySelectorAll('.study-panel__tab').forEach(tab => {
            tab.addEventListener('click', () => switchTab(tab.dataset.tab));
        });

        // Paragraph toolbar buttons
        document.addEventListener('click', handleToolbarClick);

        // Text selection for highlights
        document.addEventListener('mouseup', handleTextSelection);

        // Highlight picker
        elements.highlightPicker?.addEventListener('click', handleHighlightPick);

        // Export/Import
        elements.panel?.querySelector('[data-action="export"]')?.addEventListener('click', exportStudyData);
        elements.panel?.querySelector('[data-action="import"]')?.addEventListener('click', importStudyData);

        // Close picker on click outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.highlight-picker') && !e.target.closest('.study-tools__btn--highlight')) {
                hideHighlightPicker();
            }
        });
    }

    /**
     * Handle toolbar button clicks
     */
    function handleToolbarClick(e) {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;

        const action = btn.dataset.action;
        const ref = btn.dataset.ref;

        switch (action) {
            case 'bookmark':
                toggleBookmark(ref, btn);
                break;
            case 'note':
                openNoteEditor(ref, btn);
                break;
        }
    }

    /**
     * Toggle bookmark for a paragraph
     */
    function toggleBookmark(refId, btn) {
        if (window.LibraryStorage.isBookmarked(state.bookSlug, refId)) {
            window.LibraryStorage.removeBookmark(state.bookSlug, refId);
            btn.classList.remove('active');
            showToast('Bookmark removed');
        } else {
            window.LibraryStorage.addBookmark(state.bookSlug, refId);
            btn.classList.add('active');
            showToast('Bookmark added');
        }

        updateBadge();
        renderBookmarksList();
    }

    /**
     * Open note editor for a paragraph
     */
    function openNoteEditor(refId, btn) {
        const existingNote = window.LibraryStorage.getNote(state.bookSlug, refId);
        const para = btn.closest('.library-book__paragraph');

        // Remove any existing editor
        document.querySelectorAll('.study-tools__note-editor').forEach(e => e.remove());

        const editor = document.createElement('div');
        editor.className = 'study-tools__note-editor';
        editor.innerHTML = `
            <textarea class="study-tools__note-input" placeholder="Add your note...">${existingNote?.content || ''}</textarea>
            <div class="study-tools__note-actions">
                <button class="study-tools__note-save" data-action="save-note" data-ref="${refId}">Save</button>
                <button class="study-tools__note-cancel" data-action="cancel-note">Cancel</button>
                ${existingNote ? '<button class="study-tools__note-delete" data-action="delete-note" data-ref="' + refId + '">Delete</button>' : ''}
            </div>
        `;

        para.appendChild(editor);

        const textarea = editor.querySelector('textarea');
        textarea.focus();

        // Handle save
        editor.querySelector('[data-action="save-note"]').addEventListener('click', () => {
            const content = textarea.value.trim();
            if (content) {
                window.LibraryStorage.addNote(state.bookSlug, refId, content);
                btn.classList.add('has-note');
                showToast('Note saved');
            }
            editor.remove();
            updateBadge();
            renderNotesList();
        });

        // Handle cancel
        editor.querySelector('[data-action="cancel-note"]').addEventListener('click', () => {
            editor.remove();
        });

        // Handle delete
        const deleteBtn = editor.querySelector('[data-action="delete-note"]');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                window.LibraryStorage.removeNote(state.bookSlug, refId);
                btn.classList.remove('has-note');
                showToast('Note deleted');
                editor.remove();
                updateBadge();
                renderNotesList();
            });
        }
    }

    /**
     * Handle text selection for highlighting
     */
    function handleTextSelection(e) {
        const selection = window.getSelection();
        const text = selection.toString().trim();

        if (!text || text.length < 3) {
            hideHighlightPicker();
            return;
        }

        const para = e.target.closest('.library-book__paragraph');
        if (!para) {
            hideHighlightPicker();
            return;
        }

        // Position and show highlight picker
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        elements.highlightPicker.style.top = `${rect.top + window.scrollY - 40}px`;
        elements.highlightPicker.style.left = `${rect.left + (rect.width / 2) - 60}px`;
        elements.highlightPicker.classList.remove('hidden');

        // Store selection info for later
        elements.highlightPicker.dataset.refId = para.dataset.refId || para.id;
        elements.highlightPicker.dataset.text = text;
    }

    /**
     * Handle highlight color pick
     */
    function handleHighlightPick(e) {
        const colorBtn = e.target.closest('[data-color]');
        const removeBtn = e.target.closest('[data-action="remove-highlight"]');

        if (colorBtn) {
            const color = colorBtn.dataset.color;
            const refId = elements.highlightPicker.dataset.refId;
            const text = elements.highlightPicker.dataset.text;

            window.LibraryStorage.addHighlight(state.bookSlug, refId, color, text);
            applyHighlight(refId, text, color);
            showToast('Text highlighted');
            hideHighlightPicker();
        } else if (removeBtn) {
            // Remove highlight logic would go here
            hideHighlightPicker();
        }
    }

    /**
     * Apply highlight to text visually
     */
    function applyHighlight(refId, text, colorId) {
        const para = document.querySelector(`[data-ref-id="${refId}"], #${refId}`);
        if (!para) return;

        const color = CONFIG.highlightColors.find(c => c.id === colorId)?.color || '#fef08a';
        const translationEl = para.querySelector('.library-book__para-translation');

        if (translationEl) {
            const html = translationEl.innerHTML;
            const escapedText = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(${escapedText})`, 'gi');
            translationEl.innerHTML = html.replace(regex,
                `<mark class="study-highlight" style="background-color: ${color}">$1</mark>`
            );
        }
    }

    /**
     * Hide highlight picker
     */
    function hideHighlightPicker() {
        if (elements.highlightPicker) {
            elements.highlightPicker.classList.add('hidden');
        }
    }

    /**
     * Toggle study panel
     */
    function togglePanel() {
        if (state.isPanelOpen) {
            closePanel();
        } else {
            openPanel();
        }
    }

    /**
     * Open study panel
     */
    function openPanel() {
        if (elements.panel) {
            elements.panel.classList.remove('hidden');
            state.isPanelOpen = true;
            renderBookmarksList();
            renderNotesList();
        }
    }

    /**
     * Close study panel
     */
    function closePanel() {
        if (elements.panel) {
            elements.panel.classList.add('hidden');
            state.isPanelOpen = false;
        }
    }

    /**
     * Switch tabs in study panel
     */
    function switchTab(tabId) {
        // Update tab buttons
        elements.panel?.querySelectorAll('.study-panel__tab').forEach(tab => {
            tab.classList.toggle('study-panel__tab--active', tab.dataset.tab === tabId);
        });

        // Show/hide content
        if (elements.bookmarksList) {
            elements.bookmarksList.classList.toggle('hidden', tabId !== 'bookmarks');
        }
        if (elements.notesList) {
            elements.notesList.classList.toggle('hidden', tabId !== 'notes');
        }
    }

    /**
     * Render bookmarks list in panel
     */
    function renderBookmarksList() {
        if (!elements.bookmarksList) return;

        const bookmarks = window.LibraryStorage.getBookmarks(state.bookSlug);

        if (bookmarks.length === 0) {
            elements.bookmarksList.innerHTML = `
                <div class="study-panel__empty">
                    <p>No bookmarks yet</p>
                    <p class="study-panel__hint">Click the bookmark icon on any paragraph to save it.</p>
                </div>
            `;
            return;
        }

        elements.bookmarksList.innerHTML = bookmarks.map(bookmark => {
            const para = document.querySelector(`[data-ref-id="${bookmark.refId}"], #${bookmark.refId.replace(/:/g, '\\:')}`);
            const preview = para?.querySelector('.library-book__para-translation')?.textContent.substring(0, 100) || '';

            return `
                <div class="study-panel__item" data-ref="${bookmark.refId}">
                    <div class="study-panel__item-ref">${bookmark.refId}</div>
                    <div class="study-panel__item-preview">${preview}...</div>
                    ${bookmark.note ? `<div class="study-panel__item-note">${bookmark.note}</div>` : ''}
                    <div class="study-panel__item-actions">
                        <button class="study-panel__item-goto" data-action="goto" data-ref="${bookmark.refId}">Go to</button>
                        <button class="study-panel__item-remove" data-action="remove-bookmark" data-ref="${bookmark.refId}">Remove</button>
                    </div>
                </div>
            `;
        }).join('');

        // Add event listeners
        elements.bookmarksList.querySelectorAll('[data-action="goto"]').forEach(btn => {
            btn.addEventListener('click', () => goToRef(btn.dataset.ref));
        });

        elements.bookmarksList.querySelectorAll('[data-action="remove-bookmark"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const ref = btn.dataset.ref;
                window.LibraryStorage.removeBookmark(state.bookSlug, ref);
                const paraBtn = document.querySelector(`[data-ref="${ref}"][data-action="bookmark"]`);
                if (paraBtn) paraBtn.classList.remove('active');
                renderBookmarksList();
                updateBadge();
                showToast('Bookmark removed');
            });
        });
    }

    /**
     * Render notes list in panel
     */
    function renderNotesList() {
        if (!elements.notesList) return;

        const notes = window.LibraryStorage.getNotes(state.bookSlug);

        if (notes.length === 0) {
            elements.notesList.innerHTML = `
                <div class="study-panel__empty">
                    <p>No notes yet</p>
                    <p class="study-panel__hint">Click the note icon on any paragraph to add a note.</p>
                </div>
            `;
            return;
        }

        elements.notesList.innerHTML = notes.map(note => `
            <div class="study-panel__item" data-ref="${note.refId}">
                <div class="study-panel__item-ref">${note.refId}</div>
                <div class="study-panel__item-note">${note.content}</div>
                <div class="study-panel__item-date">${new Date(note.updatedAt).toLocaleDateString()}</div>
                <div class="study-panel__item-actions">
                    <button class="study-panel__item-goto" data-action="goto" data-ref="${note.refId}">Go to</button>
                    <button class="study-panel__item-edit" data-action="edit-note" data-ref="${note.refId}">Edit</button>
                    <button class="study-panel__item-remove" data-action="remove-note" data-ref="${note.refId}">Remove</button>
                </div>
            </div>
        `).join('');

        // Add event listeners
        elements.notesList.querySelectorAll('[data-action="goto"]').forEach(btn => {
            btn.addEventListener('click', () => goToRef(btn.dataset.ref));
        });

        elements.notesList.querySelectorAll('[data-action="remove-note"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const ref = btn.dataset.ref;
                window.LibraryStorage.removeNote(state.bookSlug, ref);
                const paraBtn = document.querySelector(`[data-ref="${ref}"][data-action="note"]`);
                if (paraBtn) paraBtn.classList.remove('has-note');
                renderNotesList();
                updateBadge();
                showToast('Note removed');
            });
        });
    }

    /**
     * Go to a specific reference
     */
    function goToRef(refId) {
        // Try to find by data-ref-id first, then by id
        let para = document.querySelector(`[data-ref-id="${refId}"]`);
        if (!para) {
            // Convert ref format (TBWTT-1:5) to id format (c1p5)
            const match = refId.match(/^\w+-(\d+):(\d+)$/);
            if (match) {
                para = document.getElementById(`c${match[1]}p${match[2]}`);
            }
        }

        if (para) {
            closePanel();
            para.scrollIntoView({ behavior: 'smooth', block: 'center' });
            para.classList.add('library-book__paragraph--selected');
            setTimeout(() => para.classList.remove('library-book__paragraph--selected'), 2000);
        }
    }

    /**
     * Update badge count
     */
    function updateBadge() {
        if (!elements.badge) return;

        const bookmarks = window.LibraryStorage.getBookmarks(state.bookSlug);
        const notes = window.LibraryStorage.getNotes(state.bookSlug);
        const count = bookmarks.length + notes.length;

        if (count > 0) {
            elements.badge.textContent = count;
            elements.badge.classList.remove('hidden');
        } else {
            elements.badge.classList.add('hidden');
        }
    }

    /**
     * Render existing annotations on page load
     */
    function renderExistingAnnotations() {
        // Mark bookmarked paragraphs
        const bookmarks = window.LibraryStorage.getBookmarks(state.bookSlug);
        bookmarks.forEach(bookmark => {
            const btn = document.querySelector(`[data-ref="${bookmark.refId}"][data-action="bookmark"]`);
            if (btn) btn.classList.add('active');
        });

        // Mark paragraphs with notes
        const notes = window.LibraryStorage.getNotes(state.bookSlug);
        notes.forEach(note => {
            const btn = document.querySelector(`[data-ref="${note.refId}"][data-action="note"]`);
            if (btn) btn.classList.add('has-note');
        });

        // Apply highlights
        const highlights = window.LibraryStorage.getHighlights(state.bookSlug);
        highlights.forEach(highlight => {
            applyHighlight(highlight.refId, highlight.text, highlight.color);
        });

        // Update badge
        updateBadge();
    }

    /**
     * Export study data
     */
    function exportStudyData() {
        const data = window.LibraryStorage.exportData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `woh-study-notes-${new Date().toISOString().split('T')[0]}.json`;
        a.click();

        URL.revokeObjectURL(url);
        showToast('Study data exported');
    }

    /**
     * Import study data
     */
    function importStudyData() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    if (window.LibraryStorage.importData(data)) {
                        showToast('Study data imported');
                        renderExistingAnnotations();
                        renderBookmarksList();
                        renderNotesList();
                    } else {
                        showToast('Import failed - invalid data');
                    }
                } catch (err) {
                    showToast('Import failed - invalid file');
                }
            };
            reader.readAsText(file);
        });

        input.click();
    }

    /**
     * Show toast notification
     */
    function showToast(message) {
        if (window.LibraryReader && window.LibraryReader.showToast) {
            window.LibraryReader.showToast(message);
        } else {
            console.log('[StudyTools]', message);
        }
    }

    // Public API
    return {
        init,
        togglePanel,
        openPanel,
        closePanel,
        toggleBookmark,
        goToRef,
        exportStudyData,
        importStudyData
    };
})();

// Auto-initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    // Slight delay to ensure storage is ready
    setTimeout(() => LibraryStudyTools.init(), 100);
});

// Make available globally
window.LibraryStudyTools = LibraryStudyTools;
