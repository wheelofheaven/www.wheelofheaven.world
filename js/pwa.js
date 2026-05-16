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

        // Localized strings exposed by `partials/pwa.html`. Fall back to
        // English so the banner is still functional if the bridge object
        // is ever missing.
        const t = (window.WOHPwaStrings && window.WOHPwaStrings.install) || {};
        const titleStr = t.title || 'Install Wheel of Heaven';
        const descStr = t.description || 'Add to your home screen for one-tap, offline-ready reading — even without signal.';
        const installStr = t.install || 'Install App';
        const dismissStr = t.dismiss || 'Dismiss install prompt';

        // Logomark inlined so the brandmark inherits `currentColor` from
        // the banner's text colour (the static PNG was unreadable on the
        // dark theme).
        const logomark = `
            <svg xmlns="http://www.w3.org/2000/svg" version="1.1" aria-hidden="true" fill="currentColor" stroke="currentColor" viewBox="0 0 49 49" width="40" height="40" preserveAspectRatio="xMidYMid meet">
                <g transform="translate(0.000000,48.000000) scale(0.020000,-0.02000)" fill="currentColor" stroke="currentColor">
                    <path d="M1155 2041 c-44 -26 -177 -103 -295 -171 -118 -67 -225 -129 -237 -137 l-23 -13 0 -330 c0 -182 -3 -330 -6 -330 -3 0 -35 16 -70 36 l-64 36 0 253 0 254 -30 -17 -30 -17 0 -377 0 -376 285 -164 c156 -89 285 -165 285 -168 0 -3 -29 -20 -65 -39 -77 -41 -47 -51 -304 98 -104 61 -192 111 -195 111 -3 0 -6 -17 -6 -37 l0 -38 308 -177 c169 -97 315 -180 324 -183 15 -6 199 95 516 281 l72 43 0 -79 0 -78 -221 -128 -220 -127 31 -18 c17 -11 34 -19 38 -19 4 0 149 83 322 183 l315 182 3 333 c1 197 6 332 12 332 5 0 36 -16 69 -35 l61 -36 2 -254 3 -255 33 20 32 20 0 374 0 374 -62 35 c-97 53 -502 288 -508 294 -3 2 2 9 10 13 8 5 38 23 66 39 l50 29 215 -124 c118 -68 217 -124 222 -124 4 0 7 18 7 39 0 27 -5 41 -16 45 -9 4 -153 85 -319 181 -166 96 -306 175 -312 175 -6 0 -136 -72 -289 -160 -153 -88 -282 -160 -286 -160 -5 0 -8 33 -8 74 l0 74 205 117 c262 150 246 139 207 159 -17 9 -35 16 -39 16 -4 0 -44 -22 -88 -49z m366 -183 c32 -18 59 -36 59 -39 0 -3 -35 -25 -77 -50 -43 -24 -133 -76 -201 -115 l-123 -72 33 -19 c18 -11 71 -41 116 -68 46 -26 86 -53 88 -60 3 -7 4 -42 2 -79 l-3 -66 -182 105 c-101 58 -186 105 -189 105 -4 0 -42 -20 -85 -45 -43 -25 -81 -45 -84 -45 -3 0 -5 35 -3 77 l3 77 120 69 c66 38 192 111 280 162 88 51 166 94 173 94 7 1 40 -14 73 -31z m-721 -338 c0 -126 2 -230 5 -230 3 0 57 30 121 67 l115 67 55 -30 c30 -16 59 -34 65 -40 8 -10 -63 -56 -318 -201 l-42 -24 -3 -94 -3 -94 -62 35 -63 35 0 334 0 333 58 36 c31 19 60 36 65 36 4 0 7 -103 7 -230z m763 76 c121 -70 434 -251 455 -264 9 -6 12 -30 10 -84 l-3 -75 -195 113 c-107 63 -198 114 -202 114 -5 0 -8 -60 -8 -134 l0 -135 -59 -35 c-32 -20 -61 -36 -65 -36 -3 0 -7 95 -8 212 l-3 212 -83 49 -84 49 64 39 c34 21 64 38 66 39 2 0 54 -29 115 -64z m-224 -342 l81 -46 0 -97 0 -97 -81 -47 c-44 -26 -86 -47 -92 -46 -7 0 -46 19 -87 43 l-75 44 -3 100 -3 101 78 45 c43 25 83 46 89 46 6 0 48 -21 93 -46z m428 -11 l63 -37 0 -332 0 -332 -64 -36 c-35 -20 -67 -36 -70 -36 -3 0 -6 104 -6 230 0 127 -2 230 -4 230 -2 0 -55 -30 -117 -66 l-114 -66 -63 34 c-35 19 -64 38 -65 41 -1 4 79 54 178 111 l180 104 3 96 c1 53 6 96 9 96 3 0 35 -17 70 -37z m-757 -295 l0 -213 80 -45 c44 -25 80 -47 80 -50 0 -3 -28 -22 -62 -42 l-62 -37 -46 25 c-25 13 -155 89 -290 167 l-245 142 -3 73 c-2 54 0 72 10 72 7 0 99 -50 203 -110 l190 -110 5 135 5 135 55 34 c30 19 61 35 68 35 9 1 12 -48 12 -211z m289 -143 c136 -78 156 -87 174 -76 11 7 49 29 84 48 l64 35 -3 -78 -3 -78 -73 -43 c-208 -123 -492 -283 -501 -283 -5 0 -37 16 -71 36 l-61 37 28 16 c15 9 106 62 201 116 94 55 172 102 172 105 0 3 -52 34 -115 69 l-115 65 0 79 0 79 33 -20 c17 -10 101 -59 186 -107z"/>
                </g>
            </svg>
        `;

        installBanner = document.createElement('div');
        installBanner.className = 'pwa-install-banner';
        // Wrap in a landmark so the banner's content is reachable by screen
        // readers without falling outside the page's landmark structure.
        installBanner.setAttribute('role', 'region');
        installBanner.setAttribute('aria-label', titleStr);
        // Dismiss button sits to the right of the install CTA so the
        // primary action is the inner target and the close affordance
        // anchors the far edge.
        installBanner.innerHTML = `
            <div class="pwa-install-banner__content">
                <div class="pwa-install-banner__icon" aria-hidden="true">${logomark}</div>
                <div class="pwa-install-banner__text">
                    <strong>${titleStr}</strong>
                    <span>${descStr}</span>
                </div>
            </div>
            <div class="pwa-install-banner__actions">
                <button class="pwa-install-banner__btn pwa-install-banner__btn--install">${installStr}</button>
                <button class="pwa-install-banner__btn pwa-install-banner__btn--dismiss" aria-label="${dismissStr}">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
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

        // Update button state. The only consumer right now is the
        // icon-only `.social-share__btn--offline`, so swap the SVG to a
        // checkmark and let the SCSS state styling handle the rest —
        // injecting a "Saved Offline" text label here broke the 36×36
        // icon cell.
        if (button) {
            button.classList.add('is-saved');
            button.setAttribute('aria-pressed', 'true');
            const svg = button.querySelector('svg');
            if (svg) {
                svg.innerHTML = '<polyline points="20 6 9 17 4 12"></polyline>';
            }
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
                    btn.setAttribute('aria-pressed', 'true');
                    const svg = btn.querySelector('svg');
                    if (svg) {
                        svg.innerHTML = '<polyline points="20 6 9 17 4 12"></polyline>';
                    }
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
