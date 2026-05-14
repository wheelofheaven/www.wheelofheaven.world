// Service Worker for Wheel of Heaven
// Provides offline support and caching

const CACHE_VERSION = 'v2';
const STATIC_CACHE = `woh-static-${CACHE_VERSION}`;
const PAGES_CACHE = `woh-pages-${CACHE_VERSION}`;
const IMAGES_CACHE = `woh-images-${CACHE_VERSION}`;

// CDN origin for images
const CDN_ORIGIN = 'https://assets.wheelofheaven.io';

// Core assets to cache immediately
const STATIC_ASSETS = [
    '/',
    '/offline/',
    '/site.webmanifest',
    '/brand/favicon.svg',
    '/brand/icon-192.png',
    '/brand/icon-512.png',
    // Critical CSS/JS
    '/critical.css',
    '/main.css',
    '/js/dist/core.bundle.js',
    // Fonts (most important)
    '/fonts/vendor/jost/jost-v19-cyrillic_latin-regular.woff2',
    '/fonts/vendor/space-grotesk/space-grotesk-v21-latin-regular.woff2'
];

// Critical CDN images to precache (for offline homepage)
const CDN_PRECACHE = [
    `${CDN_ORIGIN}/images/hero/hero-genesis.webp`,
    `${CDN_ORIGIN}/images/hero/hero-genesis.avif`,
    `${CDN_ORIGIN}/images/hero/sunrise.webp`
];

// Cache strategies
const CACHE_STRATEGIES = {
    static: 'stale-while-revalidate',
    pages: 'network-first',
    images: 'cache-first'
};

// Install event - cache static assets and critical CDN images
self.addEventListener('install', event => {
    event.waitUntil(
        Promise.all([
            // Cache static assets
            caches.open(STATIC_CACHE).then(cache => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            }),
            // Cache critical CDN images
            caches.open(IMAGES_CACHE).then(cache => {
                console.log('[SW] Caching critical CDN images');
                return Promise.all(
                    CDN_PRECACHE.map(url =>
                        fetch(url, { mode: 'cors' })
                            .then(response => {
                                if (response.ok) {
                                    return cache.put(url, response);
                                }
                            })
                            .catch(err => console.warn('[SW] Failed to cache:', url, err))
                    )
                );
            })
        ])
        .then(() => self.skipWaiting())
        .catch(err => console.error('[SW] Install failed:', err))
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames
                        .filter(name => {
                            // Delete old version caches
                            return name.startsWith('woh-') &&
                                   !name.endsWith(CACHE_VERSION);
                        })
                        .map(name => {
                            console.log('[SW] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => self.clients.claim())
    );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Handle CDN requests (cross-origin images)
    if (url.origin === CDN_ORIGIN) {
        event.respondWith(cacheFirst(request, IMAGES_CACHE));
        return;
    }

    // Only handle same-origin requests for everything else
    if (url.origin !== location.origin) {
        return;
    }

    // Determine cache strategy based on request type
    if (isStaticAsset(url.pathname)) {
        event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    } else if (isImage(url.pathname)) {
        event.respondWith(cacheFirst(request, IMAGES_CACHE));
    } else if (isPage(url.pathname)) {
        event.respondWith(networkFirst(request, PAGES_CACHE));
    }
});

// Cache-first strategy (for static assets and images)
async function cacheFirst(request, cacheName) {
    const cached = await caches.match(request);
    if (cached) {
        return cached;
    }

    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        console.error('[SW] Cache-first fetch failed:', error);
        return new Response('Offline', { status: 503 });
    }
}

// Stale-while-revalidate strategy (for CSS/JS)
// Serves cached version immediately, then updates the cache in the background
async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await caches.match(request);

    const fetchPromise = fetch(request).then(response => {
        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    }).catch(error => {
        console.error('[SW] Revalidation failed:', error);
        return cached;
    });

    return cached || fetchPromise;
}

// Network-first strategy (for HTML pages)
async function networkFirst(request, cacheName) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        console.log('[SW] Network failed, trying cache:', request.url);
        const cached = await caches.match(request);
        if (cached) {
            return cached;
        }

        // Return offline page for navigation requests
        if (request.mode === 'navigate') {
            const offlinePage = await caches.match('/offline/');
            if (offlinePage) {
                return offlinePage;
            }
        }

        return new Response('Offline', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' }
        });
    }
}

// Helper functions to determine request type
function isStaticAsset(pathname) {
    return /\.(css|js|woff2?|ttf|eot)$/i.test(pathname) ||
           pathname.startsWith('/fonts/');
}

function isImage(pathname) {
    return /\.(png|jpg|jpeg|gif|svg|webp|avif|ico)$/i.test(pathname) ||
           pathname.startsWith('/images/') ||
           pathname.startsWith('/brand/');
}

function isPage(pathname) {
    // HTML pages typically end with / or have no extension
    return pathname.endsWith('/') ||
           pathname.endsWith('.html') ||
           !pathname.includes('.');
}

// Listen for messages from the client
self.addEventListener('message', event => {
    if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (event.data.type === 'CACHE_URLS') {
        const urls = event.data.urls;
        event.waitUntil(
            caches.open(PAGES_CACHE)
                .then(cache => cache.addAll(urls))
                .then(() => {
                    // Notify clients that caching is complete
                    self.clients.matchAll().then(clients => {
                        clients.forEach(client => {
                            client.postMessage({ type: 'CACHE_COMPLETE', urls });
                        });
                    });
                })
        );
    }

    if (event.data.type === 'GET_CACHED_URLS') {
        event.waitUntil(
            caches.open(PAGES_CACHE)
                .then(cache => cache.keys())
                .then(requests => {
                    const urls = requests.map(req => new URL(req.url).pathname);
                    event.source.postMessage({ type: 'CACHED_URLS', urls });
                })
        );
    }
});

// Background sync for reading progress (if supported)
self.addEventListener('sync', event => {
    if (event.tag === 'sync-reading-progress') {
        event.waitUntil(syncReadingProgress());
    }
});

async function syncReadingProgress() {
    // Get pending reading progress updates from IndexedDB
    // and sync them when back online
    console.log('[SW] Syncing reading progress...');
}
