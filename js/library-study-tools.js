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
        bookTitle: '',
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
        state.bookTitle = options.bookTitle
            || bookContainer.dataset.bookTitle
            || document.getElementById('book-title')?.textContent?.trim()
            || '';

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
     * Collect the displayable passage text and structural numbers for a
     * given refId from the live DOM. Returns null if the paragraph is
     * not on this page (i.e. the user is in a different book). Trims
     * whitespace and collapses internal runs so the quote round-trips
     * cleanly into Markdown and JSON.
     */
    function captureParagraphMeta(refId) {
        let para = document.querySelector(`[data-ref-id="${cssEscape(refId)}"]`);
        if (!para) {
            const parsed = window.LibraryStorage.parseRefId(refId);
            if (parsed.chapter != null && parsed.paragraph != null) {
                para = document.getElementById(`c${parsed.chapter}p${parsed.paragraph}`);
            }
        }
        if (!para) return null;

        const translationEl = para.querySelector('.library-book__para-translation');
        const quote = (translationEl?.textContent || para.textContent || '')
            .replace(/\s+/g, ' ')
            .trim();

        const parsed = window.LibraryStorage.parseRefId(refId);
        return {
            quote,
            chapter: parsed.chapter,
            paragraph: parsed.paragraph,
            bookTitle: state.bookTitle
        };
    }

    /**
     * Minimal CSS.escape shim — newer browsers ship it natively, but
     * refIds contain ":" which would otherwise break attribute selectors.
     */
    function cssEscape(s) {
        if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(s);
        return String(s).replace(/[^a-zA-Z0-9_-]/g, ch => '\\' + ch);
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
                <button class="study-panel__export" data-action="export-notes">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    Export notes
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
            <div class="study-panel__footer-secondary">
                <button type="button" class="study-panel__secondary-link" data-action="export-all">
                    Export full backup (all study data)
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
        elements.panel?.querySelector('[data-action="export-notes"]')?.addEventListener('click', exportNotesOnly);
        elements.panel?.querySelector('[data-action="export-all"]')?.addEventListener('click', exportStudyData);
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
            const meta = captureParagraphMeta(refId);
            window.LibraryStorage.addBookmark(state.bookSlug, refId, '', meta);
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
                const meta = captureParagraphMeta(refId);
                window.LibraryStorage.addNote(state.bookSlug, refId, content, meta);
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
                <div class="study-panel__item-ref">${escapeHtml(note.refId)}</div>
                <div class="study-panel__item-note">${escapeHtml(note.content)}</div>
                <div class="study-panel__item-date">${new Date(note.updatedAt).toLocaleDateString()}</div>
                <div class="study-panel__item-actions">
                    <button class="study-panel__item-goto" data-action="goto" data-ref="${note.refId}">Go to</button>
                    <button class="study-panel__item-edit" data-action="edit-note" data-ref="${note.refId}">Edit</button>
                    <details class="study-panel__item-export">
                        <summary class="study-panel__item-export-toggle" aria-label="Export this note">Export</summary>
                        <div class="study-panel__item-export-menu" role="menu">
                            <button type="button" role="menuitem" data-action="export-note-json" data-ref="${note.refId}">Download .json</button>
                            <button type="button" role="menuitem" data-action="export-note-md" data-ref="${note.refId}">Download .md</button>
                        </div>
                    </details>
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

        elements.notesList.querySelectorAll('[data-action="export-note-json"]').forEach(btn => {
            btn.addEventListener('click', () => {
                exportSingleNote(btn.dataset.ref, 'json');
                btn.closest('details')?.removeAttribute('open');
            });
        });

        elements.notesList.querySelectorAll('[data-action="export-note-md"]').forEach(btn => {
            btn.addEventListener('click', () => {
                exportSingleNote(btn.dataset.ref, 'md');
                btn.closest('details')?.removeAttribute('open');
            });
        });

        elements.notesList.querySelectorAll('[data-action="edit-note"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const ref = btn.dataset.ref;
                goToRef(ref);
                setTimeout(() => {
                    const paraBtn = document.querySelector(`[data-ref="${ref}"][data-action="note"]`);
                    if (paraBtn) openNoteEditor(ref, paraBtn);
                }, 350);
            });
        });
    }

    /**
     * Escape a string for safe insertion as text inside HTML built via
     * template literals. The previous render injected note.content
     * verbatim, which is fine for trusted local input but breaks if a
     * user pastes "<" into a note.
     */
    function escapeHtml(s) {
        const div = document.createElement('div');
        div.textContent = s == null ? '' : String(s);
        return div.innerHTML;
    }

    /**
     * Build a Markdown rendering of a single note in the
     * "quote-above, note-below" layout. The attribution line is an
     * em-dash followed by a Markdown link to the deep paragraph URL so
     * the export round-trips into any Markdown reader.
     */
    function noteToMarkdown(record) {
        const bookTitle = record.bookTitle || record.bookSlug || '';
        const refLabel = bookTitle ? `${bookTitle}, ${record.refId}` : record.refId;
        const lines = [];
        lines.push(`# Note — ${record.refId}`);
        lines.push('');
        if (record.quote) {
            const quoteLines = record.quote.split(/\n+/).map(l => `> ${l}`);
            lines.push(...quoteLines);
            lines.push('>');
            const linkPart = record.link ? `[${refLabel}](${record.link})` : refLabel;
            lines.push(`> — ${linkPart}`);
            lines.push('');
        } else if (record.link) {
            lines.push(`Source: [${refLabel}](${record.link})`);
            lines.push('');
        }
        lines.push(record.content || '');
        lines.push('');
        lines.push('---');
        const created = record.createdAt ? new Date(record.createdAt).toLocaleDateString() : '';
        const updated = record.updatedAt ? new Date(record.updatedAt).toLocaleDateString() : '';
        if (created || updated) {
            lines.push(`*Created ${created}${updated && updated !== created ? ` · Updated ${updated}` : ''}*`);
        }
        return lines.join('\n');
    }

    /**
     * Build a single-note export record (same shape as one entry in
     * the bulk woh-notes-export). Pulls live DOM context if the note's
     * paragraph happens to be on the current page so the export
     * benefits from any newly-rendered text.
     */
    function buildNoteRecord(refId) {
        const note = window.LibraryStorage.getNote(state.bookSlug, refId);
        if (!note) return null;
        const live = captureParagraphMeta(refId);
        const parsed = window.LibraryStorage.parseRefId(refId);
        const chapter = note.chapter != null ? note.chapter : (live?.chapter ?? parsed.chapter);
        const paragraph = note.paragraph != null ? note.paragraph : (live?.paragraph ?? parsed.paragraph);
        return {
            bookSlug: state.bookSlug,
            bookTitle: note.bookTitle || live?.bookTitle || state.bookTitle || '',
            refId: note.refId,
            chapter,
            paragraph,
            quote: note.quote || live?.quote || '',
            link: window.LibraryStorage.buildParagraphLink(state.bookSlug, chapter, paragraph),
            content: note.content || '',
            createdAt: note.createdAt,
            updatedAt: note.updatedAt
        };
    }

    function exportSingleNote(refId, format) {
        const record = buildNoteRecord(refId);
        if (!record) {
            showToast('Note not found');
            return;
        }
        const safeRef = String(refId).replace(/[^A-Za-z0-9-]+/g, '_');
        if (format === 'md') {
            downloadBlob(noteToMarkdown(record), 'text/markdown', `woh-note-${safeRef}.md`);
        } else {
            const payload = {
                kind: 'woh-notes-export',
                version: 1,
                exportedAt: new Date().toISOString(),
                notes: [record]
            };
            downloadBlob(JSON.stringify(payload, null, 2), 'application/json', `woh-note-${safeRef}.json`);
        }
        showToast('Note exported');
    }

    function downloadBlob(contents, mime, filename) {
        const blob = new Blob([contents], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
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
        // Mark bookmarked paragraphs and lazy-backfill any meta we can
        // observe from the current DOM (older annotations created
        // before the metadata-capture upgrade).
        const bookmarks = window.LibraryStorage.getBookmarks(state.bookSlug);
        bookmarks.forEach(bookmark => {
            const btn = document.querySelector(`[data-ref="${bookmark.refId}"][data-action="bookmark"]`);
            if (btn) btn.classList.add('active');
            if (!bookmark.quote || !bookmark.bookTitle) {
                const meta = captureParagraphMeta(bookmark.refId);
                if (meta) {
                    window.LibraryStorage.backfillBookmarkMeta(state.bookSlug, bookmark.refId, meta);
                }
            }
        });

        // Mark paragraphs with notes (same lazy backfill)
        const notes = window.LibraryStorage.getNotes(state.bookSlug);
        notes.forEach(note => {
            const btn = document.querySelector(`[data-ref="${note.refId}"][data-action="note"]`);
            if (btn) btn.classList.add('has-note');
            if (!note.quote || !note.bookTitle) {
                const meta = captureParagraphMeta(note.refId);
                if (meta) {
                    window.LibraryStorage.backfillNoteMeta(state.bookSlug, note.refId, meta);
                }
            }
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
     * Primary export: notes only (all books), in the portable
     * woh-notes-export schema. Use the "Export full backup" link for
     * the legacy whole-library blob (preferences, progress, history).
     */
    function exportNotesOnly() {
        const data = window.LibraryStorage.exportNotes();
        downloadBlob(
            JSON.stringify(data, null, 2),
            'application/json',
            `woh-notes-${new Date().toISOString().split('T')[0]}.json`
        );
        showToast(`Exported ${data.notes.length} note${data.notes.length === 1 ? '' : 's'}`);
    }

    /**
     * Full-backup export — kept for users who relied on the prior
     * behavior. Includes preferences, progress, bookmarks, highlights,
     * notes, and history.
     */
    function exportStudyData() {
        const data = window.LibraryStorage.exportData();
        downloadBlob(
            JSON.stringify(data, null, 2),
            'application/json',
            `woh-study-backup-${new Date().toISOString().split('T')[0]}.json`
        );
        showToast('Full backup exported');
    }

    /**
     * Import accepts both the notes-only schema and the legacy
     * whole-library blob. We sniff by the `kind` field: presence ⇒
     * notes-only; absence ⇒ legacy whole-library import.
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
                let data;
                try {
                    data = JSON.parse(event.target.result);
                } catch (err) {
                    showToast('Import failed — not valid JSON');
                    return;
                }

                if (data && data.kind === 'woh-notes-export') {
                    const touched = window.LibraryStorage.importNotes(data);
                    if (touched < 0) {
                        showToast('Import failed — unsupported notes export');
                        return;
                    }
                    showToast(`Imported ${touched} note${touched === 1 ? '' : 's'}`);
                } else if (data && data.kind === 'woh-bookmarks-export') {
                    showToast('That looks like a Reading List file — use the Reading List panel to import it.');
                    return;
                } else if (window.LibraryStorage.importData(data)) {
                    showToast('Full backup imported');
                } else {
                    showToast('Import failed — invalid data');
                    return;
                }

                renderExistingAnnotations();
                renderBookmarksList();
                renderNotesList();
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
        exportNotesOnly,
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
