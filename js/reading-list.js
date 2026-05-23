// Reading List / Bookmarks
// Save articles for later reading with localStorage and service worker caching
(function() {
    'use strict';

    const STORAGE_KEY = 'woh-reading-list';
    const MAX_ITEMS = 100;

    // State
    let readingList = [];
    let panel = null;

    // Initialize
    function init() {
        loadReadingList();
        setupBookmarkButtons();
        createPanel();
        setupKeyboardShortcut();
        updateAllBookmarkButtons();
    }

    // Load reading list from localStorage
    function loadReadingList() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                readingList = JSON.parse(stored);
                // Clean up any invalid entries
                readingList = readingList.filter(item => item.url && item.title);
            }
        } catch (e) {
            console.error('[ReadingList] Error loading:', e);
            readingList = [];
        }
    }

    // Save reading list to localStorage
    function saveReadingList() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(readingList));
        } catch (e) {
            console.error('[ReadingList] Error saving:', e);
        }
    }

    // Add item to reading list
    function addItem(item) {
        // Check if already exists
        const existingIndex = readingList.findIndex(i => i.url === item.url);
        if (existingIndex !== -1) {
            return false; // Already exists
        }

        // Add to beginning
        readingList.unshift({
            url: item.url,
            title: item.title,
            description: item.description || '',
            section: item.section || '',
            addedAt: Date.now()
        });

        // Limit list size
        if (readingList.length > MAX_ITEMS) {
            readingList = readingList.slice(0, MAX_ITEMS);
        }

        saveReadingList();
        cacheUrl(item.url);
        updatePanel();
        updateAllBookmarkButtons();
        return true;
    }

    // Remove item from reading list
    function removeItem(url) {
        const index = readingList.findIndex(i => i.url === url);
        if (index !== -1) {
            readingList.splice(index, 1);
            saveReadingList();
            updatePanel();
            updateAllBookmarkButtons();
            return true;
        }
        return false;
    }

    // Check if item is in reading list
    function isInList(url) {
        return readingList.some(i => i.url === url);
    }

    // Cache URL with service worker
    function cacheUrl(url) {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'CACHE_URLS',
                urls: [url]
            });
        }
    }

    // Setup bookmark buttons on the page
    function setupBookmarkButtons() {
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-bookmark]');
            if (!btn) return;

            e.preventDefault();
            const url = btn.dataset.url || window.location.pathname;
            const title = btn.dataset.title || document.title;
            const description = btn.dataset.description || '';
            const section = btn.dataset.section || '';

            if (isInList(url)) {
                removeItem(url);
                showSnackbar(getTranslation('removedFromList', 'Removed from reading list'));
            } else {
                addItem({ url, title, description, section });
                showSnackbar(getTranslation('addedToList', 'Added to reading list'));
            }
        });
    }

    // Update all bookmark buttons on page
    function updateAllBookmarkButtons() {
        const buttons = document.querySelectorAll('[data-bookmark]');
        buttons.forEach(btn => {
            const url = btn.dataset.url || window.location.pathname;
            const isBookmarked = isInList(url);
            btn.classList.toggle('is-bookmarked', isBookmarked);
            btn.setAttribute('aria-pressed', isBookmarked);

            // Update icon if it has one
            const iconFilled = btn.querySelector('.bookmark-icon-filled');
            const iconOutline = btn.querySelector('.bookmark-icon-outline');
            if (iconFilled && iconOutline) {
                iconFilled.style.display = isBookmarked ? 'block' : 'none';
                iconOutline.style.display = isBookmarked ? 'none' : 'block';
            }
        });

        // Update counter badge
        updateCounterBadge();
    }

    // Update the counter badge
    function updateCounterBadge() {
        const badges = document.querySelectorAll('.reading-list-toggle__badge');
        const count = readingList.length;
        badges.forEach(badge => {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'flex' : 'none';
        });
    }

    // Create the reading list panel
    function createPanel() {
        panel = document.createElement('div');
        panel.className = 'reading-list-panel';
        panel.id = 'readingListPanel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-labelledby', 'readingListTitle');
        panel.setAttribute('aria-hidden', 'true');

        panel.innerHTML = `
            <div class="reading-list-panel__backdrop"></div>
            <div class="reading-list-panel__content">
                <header class="reading-list-panel__header">
                    <h2 class="reading-list-panel__title" id="readingListTitle">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                        </svg>
                        ${getTranslation('readingList', 'Reading List')}
                    </h2>
                    <button class="reading-list-panel__close" aria-label="${getTranslation('close', 'Close')}" data-close-reading-list>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </header>
                <div class="reading-list-panel__body">
                    <div class="reading-list-panel__empty">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                        </svg>
                        <p>${getTranslation('emptyReadingList', 'Your reading list is empty')}</p>
                        <p class="reading-list-panel__empty-hint">${getTranslation('emptyReadingListHint', 'Bookmark articles to save them for later')}</p>
                    </div>
                    <ul class="reading-list-panel__list"></ul>
                </div>
                <footer class="reading-list-panel__footer">
                    <button class="reading-list-panel__export" data-export-reading-list>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        ${getTranslation('exportReadingList', 'Export')}
                    </button>
                    <button class="reading-list-panel__import" data-import-reading-list>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="17 8 12 3 7 8"></polyline>
                            <line x1="12" y1="3" x2="12" y2="15"></line>
                        </svg>
                        ${getTranslation('importReadingList', 'Import')}
                    </button>
                    <button class="reading-list-panel__clear" data-clear-reading-list>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                        ${getTranslation('clearAll', 'Clear all')}
                    </button>
                </footer>
            </div>
        `;

        document.body.appendChild(panel);

        // Setup event listeners
        const backdrop = panel.querySelector('.reading-list-panel__backdrop');
        const closeBtn = panel.querySelector('[data-close-reading-list]');
        const clearBtn = panel.querySelector('[data-clear-reading-list]');
        const exportBtn = panel.querySelector('[data-export-reading-list]');
        const importBtn = panel.querySelector('[data-import-reading-list]');

        backdrop?.addEventListener('click', closePanel);
        closeBtn?.addEventListener('click', closePanel);
        clearBtn?.addEventListener('click', clearAll);
        exportBtn?.addEventListener('click', exportList);
        importBtn?.addEventListener('click', importList);

        // Setup toggle button
        document.addEventListener('click', (e) => {
            const toggleBtn = e.target.closest('[data-toggle-reading-list]');
            if (toggleBtn) {
                e.preventDefault();
                togglePanel();
            }
        });

        updatePanel();
    }

    // Update panel content
    function updatePanel() {
        if (!panel) return;

        const listEl = panel.querySelector('.reading-list-panel__list');
        const emptyEl = panel.querySelector('.reading-list-panel__empty');
        const footerEl = panel.querySelector('.reading-list-panel__footer');
        const clearBtn = panel.querySelector('[data-clear-reading-list]');
        const exportBtn = panel.querySelector('[data-export-reading-list]');

        // Keep the footer mounted so Import is available even when the
        // list is empty (that's exactly when a user is most likely to
        // want to restore a backup). Only the destructive/whole-list
        // actions are gated on having items.
        if (readingList.length === 0) {
            emptyEl.style.display = 'flex';
            listEl.style.display = 'none';
            footerEl.style.display = 'flex';
            if (clearBtn) clearBtn.style.display = 'none';
            if (exportBtn) exportBtn.style.display = 'none';
            updateCounterBadge();
            return;
        }

        emptyEl.style.display = 'none';
        listEl.style.display = 'block';
        footerEl.style.display = 'flex';
        if (clearBtn) clearBtn.style.display = '';
        if (exportBtn) exportBtn.style.display = '';

        listEl.innerHTML = readingList.map(item => `
            <li class="reading-list-panel__item">
                <a href="${escapeHtml(item.url)}" class="reading-list-panel__link">
                    ${item.section ? `<span class="reading-list-panel__section">${escapeHtml(item.section)}</span>` : ''}
                    <span class="reading-list-panel__item-title">${escapeHtml(item.title)}</span>
                    ${item.description ? `<span class="reading-list-panel__item-desc">${escapeHtml(truncate(item.description, 100))}</span>` : ''}
                </a>
                <button class="reading-list-panel__remove" data-remove-url="${escapeHtml(item.url)}" aria-label="${getTranslation('remove', 'Remove')}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </li>
        `).join('');

        // Setup remove buttons
        listEl.querySelectorAll('[data-remove-url]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const url = btn.dataset.removeUrl;
                removeItem(url);
                showSnackbar(getTranslation('removedFromList', 'Removed from reading list'));
            });
        });

        updateCounterBadge();
    }

    // Open panel
    function openPanel() {
        if (!panel) return;
        panel.classList.add('reading-list-panel--open');
        panel.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';

        // Focus first focusable element
        const firstFocusable = panel.querySelector('button, a');
        firstFocusable?.focus();
    }

    // Close panel
    function closePanel() {
        if (!panel) return;
        panel.classList.remove('reading-list-panel--open');
        panel.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }

    // Toggle panel
    function togglePanel() {
        if (panel?.classList.contains('reading-list-panel--open')) {
            closePanel();
        } else {
            openPanel();
        }
    }

    // Export the reading list as a portable JSON file. The schema is
    // intentionally tiny and stable so users can re-import or pipe it
    // into other tools without surprises.
    function exportList() {
        if (readingList.length === 0) {
            showSnackbar(getTranslation('emptyReadingList', 'Your reading list is empty'));
            return;
        }
        const payload = {
            kind: 'woh-bookmarks-export',
            version: 1,
            exportedAt: new Date().toISOString(),
            bookmarks: readingList.map(item => ({
                url: item.url,
                title: item.title,
                description: item.description || '',
                section: item.section || '',
                addedAt: item.addedAt || Date.now()
            }))
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `woh-bookmarks-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showSnackbar(getTranslation('readingListExported', 'Reading list exported'));
    }

    // Import a previously exported reading list. Merges by url:
    // existing entries are kept (preserving their original addedAt),
    // new ones are inserted at the top in incoming order.
    function importList() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                let data;
                try {
                    data = JSON.parse(ev.target.result);
                } catch (err) {
                    showSnackbar(getTranslation('importInvalidJson', 'Import failed — not valid JSON'));
                    return;
                }
                if (!data || data.kind !== 'woh-bookmarks-export' || !Array.isArray(data.bookmarks)) {
                    showSnackbar(getTranslation('importWrongKind', 'Import failed — not a reading-list export'));
                    return;
                }
                if (typeof data.version === 'number' && data.version > 1) {
                    showSnackbar(getTranslation('importTooNew', 'Import failed — file is newer than this app supports'));
                    return;
                }

                let added = 0;
                // Iterate in reverse so the first entry of the incoming
                // list ends up on top after the unshift().
                for (let i = data.bookmarks.length - 1; i >= 0; i--) {
                    const b = data.bookmarks[i];
                    if (!b || !b.url || !b.title) continue;
                    if (readingList.some(x => x.url === b.url)) continue;
                    readingList.unshift({
                        url: b.url,
                        title: b.title,
                        description: b.description || '',
                        section: b.section || '',
                        addedAt: typeof b.addedAt === 'number' ? b.addedAt : Date.now()
                    });
                    added += 1;
                }
                if (readingList.length > MAX_ITEMS) {
                    readingList = readingList.slice(0, MAX_ITEMS);
                }
                saveReadingList();
                updatePanel();
                updateAllBookmarkButtons();
                if (added === 0) {
                    showSnackbar(getTranslation('importNothingNew', 'Nothing new to import'));
                } else {
                    showSnackbar(`${getTranslation('imported', 'Imported')} ${added}`);
                }
            };
            reader.readAsText(file);
        });
        input.click();
    }

    // Clear all items
    function clearAll() {
        if (readingList.length === 0) return;

        if (confirm(getTranslation('confirmClear', 'Clear all items from your reading list?'))) {
            readingList = [];
            saveReadingList();
            updatePanel();
            updateAllBookmarkButtons();
            showSnackbar(getTranslation('listCleared', 'Reading list cleared'));
        }
    }

    // Setup keyboard shortcut (b for bookmark, B for open list)
    function setupKeyboardShortcut() {
        document.addEventListener('keydown', (e) => {
            // Don't trigger when typing in inputs
            const active = document.activeElement;
            const tagName = active?.tagName?.toLowerCase();
            if (tagName === 'input' || tagName === 'textarea' || active?.isContentEditable) {
                return;
            }

            // Don't trigger with modifier keys
            if (e.ctrlKey || e.metaKey || e.altKey) return;

            // Check if any modal is open
            const anyModalOpen = document.querySelector('.search-modal--open, .keyboard-shortcuts-modal--open');

            if (e.key === 'b' && !e.shiftKey && !anyModalOpen) {
                // Toggle bookmark for current page
                const bookmarkBtn = document.querySelector('[data-bookmark]');
                if (bookmarkBtn) {
                    e.preventDefault();
                    bookmarkBtn.click();
                }
            } else if (e.key === 'B' && e.shiftKey && !anyModalOpen) {
                // Open reading list panel
                e.preventDefault();
                openPanel();
            } else if (e.key === 'Escape' && panel?.classList.contains('reading-list-panel--open')) {
                e.preventDefault();
                closePanel();
            }
        });
    }

    // Get translation
    function getTranslation(key, fallback) {
        return window.readingListTranslations?.[key] || fallback;
    }

    // Escape HTML
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Truncate text
    function truncate(text, length) {
        if (text.length <= length) return text;
        return text.substring(0, length).trim() + '…';
    }

    // Show snackbar
    function showSnackbar(message) {
        const snackbar = document.querySelector('.snackbar');
        if (snackbar) {
            snackbar.textContent = message;
            snackbar.classList.add('snackbar--visible');
            setTimeout(() => {
                snackbar.classList.remove('snackbar--visible');
            }, 3000);
        } else {
            const tempSnackbar = document.createElement('div');
            tempSnackbar.className = 'snackbar snackbar--visible';
            tempSnackbar.textContent = message;
            document.body.appendChild(tempSnackbar);
            setTimeout(() => {
                tempSnackbar.remove();
            }, 3000);
        }
    }

    // Expose public API
    window.ReadingList = {
        add: addItem,
        remove: removeItem,
        isInList: isInList,
        getAll: () => [...readingList],
        open: openPanel,
        close: closePanel,
        toggle: togglePanel,
        exportList: exportList,
        importList: importList
    };

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
