// PWA functionality - Install prompts, offline detection, caching
(function() {
    'use strict';

    // State
    let deferredPrompt = null;
    let isOnline = navigator.onLine;

    // DOM elements (created on init)
    let installBanner = null;
    let offlineIndicator = null;

    // Initialize PWA features
    function init() {
        registerServiceWorker();
        setupInstallPrompt();
        setupOfflineDetection();
        setupSaveForOffline();
    }

    // Register Service Worker
    function registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', async () => {
                try {
                    const registration = await navigator.serviceWorker.register('/sw.js', {
                        scope: '/'
                    });

                    console.log('[PWA] Service Worker registered:', registration.scope);

                    // Check for updates
                    registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                showUpdateNotification();
                            }
                        });
                    });
                } catch (error) {
                    console.error('[PWA] Service Worker registration failed:', error);
                }
            });

            // Listen for messages from Service Worker
            navigator.serviceWorker.addEventListener('message', handleSWMessage);
        }
    }

    // Handle messages from Service Worker
    function handleSWMessage(event) {
        if (event.data.type === 'CACHE_COMPLETE') {
            showSnackbar('Page saved for offline reading');
        }
    }

    // Setup install prompt
    function setupInstallPrompt() {
        // Capture the install prompt
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;

            // Show install banner if not dismissed before
            if (!localStorage.getItem('pwa-install-dismissed')) {
                showInstallBanner();
            }
        });

        // Track successful installs
        window.addEventListener('appinstalled', () => {
            console.log('[PWA] App installed');
            deferredPrompt = null;
            hideInstallBanner();
            localStorage.setItem('pwa-installed', 'true');
        });
    }

    // Show install banner
    function showInstallBanner() {
        if (installBanner) return;

        installBanner = document.createElement('div');
        installBanner.className = 'pwa-install-banner';
        installBanner.innerHTML = `
            <div class="pwa-install-banner__content">
                <div class="pwa-install-banner__icon">
                    <img src="/brand/icon-192.png" alt="" width="40" height="40">
                </div>
                <div class="pwa-install-banner__text">
                    <strong>Install Wheel of Heaven</strong>
                    <span>Add to home screen for offline access</span>
                </div>
            </div>
            <div class="pwa-install-banner__actions">
                <button class="pwa-install-banner__btn pwa-install-banner__btn--dismiss" aria-label="Dismiss">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
                <button class="pwa-install-banner__btn pwa-install-banner__btn--install">Install</button>
            </div>
        `;

        document.body.appendChild(installBanner);

        // Animate in
        requestAnimationFrame(() => {
            installBanner.classList.add('pwa-install-banner--visible');
        });

        // Setup button handlers
        installBanner.querySelector('.pwa-install-banner__btn--install').addEventListener('click', promptInstall);
        installBanner.querySelector('.pwa-install-banner__btn--dismiss').addEventListener('click', dismissInstallBanner);
    }

    // Hide install banner
    function hideInstallBanner() {
        if (!installBanner) return;

        installBanner.classList.remove('pwa-install-banner--visible');
        setTimeout(() => {
            if (installBanner && installBanner.parentNode) {
                installBanner.parentNode.removeChild(installBanner);
            }
            installBanner = null;
        }, 300);
    }

    // Dismiss install banner
    function dismissInstallBanner() {
        localStorage.setItem('pwa-install-dismissed', 'true');
        hideInstallBanner();
    }

    // Prompt install
    async function promptInstall() {
        if (!deferredPrompt) return;

        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;

        console.log('[PWA] Install prompt outcome:', outcome);
        deferredPrompt = null;
        hideInstallBanner();
    }

    // Setup offline detection
    function setupOfflineDetection() {
        // Create offline indicator
        offlineIndicator = document.createElement('div');
        offlineIndicator.className = 'offline-indicator';
        offlineIndicator.setAttribute('role', 'status');
        offlineIndicator.setAttribute('aria-live', 'polite');
        offlineIndicator.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="1" y1="1" x2="23" y2="23"></line>
                <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
                <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
                <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
                <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
                <line x1="12" y1="20" x2="12.01" y2="20"></line>
            </svg>
            <span>You're offline</span>
        `;
        document.body.appendChild(offlineIndicator);

        // Set initial state
        updateOnlineStatus();

        // Listen for online/offline events
        window.addEventListener('online', () => {
            isOnline = true;
            updateOnlineStatus();
            showSnackbar('You\'re back online');
        });

        window.addEventListener('offline', () => {
            isOnline = false;
            updateOnlineStatus();
        });
    }

    // Update online status indicator
    function updateOnlineStatus() {
        if (!offlineIndicator) return;

        if (isOnline) {
            offlineIndicator.classList.remove('offline-indicator--visible');
        } else {
            offlineIndicator.classList.add('offline-indicator--visible');
        }

        document.body.classList.toggle('is-offline', !isOnline);
    }

    // Setup "Save for Offline" buttons
    function setupSaveForOffline() {
        // Add save button to article pages
        const saveButtons = document.querySelectorAll('[data-save-offline]');
        saveButtons.forEach(btn => {
            btn.addEventListener('click', () => saveCurrentPage(btn));
        });

        // Check if current page is cached
        checkPageCached();
    }

    // Save current page for offline
    function saveCurrentPage(button) {
        if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
            showSnackbar('Offline saving not available');
            return;
        }

        const url = window.location.pathname;
        navigator.serviceWorker.controller.postMessage({
            type: 'CACHE_URLS',
            urls: [url]
        });

        // Update button state
        if (button) {
            button.classList.add('is-saved');
            button.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Saved Offline
            `;
        }
    }

    // Check if current page is cached
    async function checkPageCached() {
        if (!('caches' in window)) return;

        try {
            // Look up the active pages cache by prefix so this stays
            // correct when sw.js bumps CACHE_VERSION.
            const cacheNames = await caches.keys();
            const pagesCacheName = cacheNames.find(name => name.startsWith('woh-pages-'));
            if (!pagesCacheName) return;

            const cache = await caches.open(pagesCacheName);
            const response = await cache.match(window.location.pathname);

            if (response) {
                const saveButtons = document.querySelectorAll('[data-save-offline]');
                saveButtons.forEach(btn => {
                    btn.classList.add('is-saved');
                    btn.innerHTML = `
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        Saved Offline
                    `;
                });
            }
        } catch (error) {
            console.error('[PWA] Error checking cache:', error);
        }
    }

    // Show update notification
    function showUpdateNotification() {
        const updateBanner = document.createElement('div');
        updateBanner.className = 'pwa-update-banner';
        updateBanner.innerHTML = `
            <span>A new version is available</span>
            <button class="pwa-update-banner__btn" onclick="location.reload()">Refresh</button>
        `;
        document.body.appendChild(updateBanner);

        requestAnimationFrame(() => {
            updateBanner.classList.add('pwa-update-banner--visible');
        });
    }

    // Show snackbar message
    function showSnackbar(message) {
        // Use existing snackbar if available
        const snackbar = document.querySelector('.snackbar');
        if (snackbar) {
            snackbar.textContent = message;
            snackbar.classList.add('snackbar--visible');
            setTimeout(() => {
                snackbar.classList.remove('snackbar--visible');
            }, 3000);
        } else {
            // Create temporary snackbar
            const tempSnackbar = document.createElement('div');
            tempSnackbar.className = 'snackbar snackbar--visible';
            tempSnackbar.textContent = message;
            document.body.appendChild(tempSnackbar);
            setTimeout(() => {
                tempSnackbar.remove();
            }, 3000);
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
