// Enhanced Fuse.js Search Implementation for Zola
// Features: Fuzzy matching, section filters, suggestions, recent searches

let searchIndex = null;
let fuse = null;
let currentLanguage = "en";
let activeFilters = new Set();
let searchInitPromise = null;
const RECENT_SEARCHES_KEY = 'woh-recent-searches';
const MAX_RECENT_SEARCHES = 5;

// Localized labels injected by `partials/search-i18n.html`. The script
// tag emitting it is included before this bundle, so the object exists
// by the time we run. Fallbacks keep the modal usable if the partial
// somehow doesn't run (e.g. during template-edit dev cycles).
const I18N = (typeof window !== 'undefined' && window.__searchI18n) || {};
const t = (key, fallback) => (I18N[key] || fallback);
const sectionLabel = (key) => (I18N.sectionLabels && I18N.sectionLabels[key]) || key;

// Section definitions with icons. Order matches the navbar IA:
// Timeline, Newsroom, then the Knowledge group (Articles, Library,
// Wiki, Sources). Icons mirror the canonical set in
// `partials/icons/` used by the navbar Knowledge dropdown, Read panel,
// and homepage path cards — keep these in sync if those partials change.
const SECTIONS = {
    Timeline: {
        // partials/icons/game-star-cycle.html
        icon: `<svg width="16" height="16" viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M197.666 22.36c-37.354 0-67.637 30.284-67.637 67.64c0 11.57 2.908 22.46 8.03 31.982c-41.127 38.07-75.686 84.545-97.312 134.717c-55.608 129.01-4.667 233.597 113.78 233.597c118.446 0 259.545-104.586 315.154-233.598S474.352 23.1 355.904 23.1c-34.222 0-70.334 8.745-105.73 24.273c-12.402-15.26-31.313-25.014-52.508-25.014zm-6.7 14.083l13.288 27.666l30.496-7.065l-15.695 24.07C214.683 77.09 208.6 74.9 202.207 75.4c-12.196.954-21.35 11.656-20.398 23.852c.167 2.03.958 3.905 1.618 5.732l-28.75 6.932l17.93-25.418l-21.702-22.908l31.223 2.25l8.835-29.397zm129.49 16.44q4.397-.012 8.753.242c74.362 4.336 116.098 66.005 108.73 147.703c-13.446 90.524-69.506 168.88-165.03 199.758c18.422 3.867 35.72 4.313 51.713 1.797c-44.73 36.55-96.58 57.906-144.285 55.125c-24.947-1.455-46.217-9.37-63.2-22.32c18.472 2.268 40.657-1.352 65.132-12.37C122.06 410.5 80 368.245 88.89 297.358c-7.795 11.485-13.765 22.637-18.103 33.308c-.356-26.225 4.678-55.082 15.75-85.158c6.296-17.1 14.182-33.6 23.348-49.264c13.746-19.44 29.697-36.908 47.365-52.037c11.277 8.425 25.256 13.43 40.416 13.43c37.354 0 67.64-30.283 67.64-67.637c0-.786-.033-1.563-.06-2.342c32.21-8.183 66.18-10.1 100.418-4.625c-16.914-15.152-34.966-24.902-53.45-29.894c2.756-.16 5.505-.25 8.24-.257z"/></svg>`
    },
    Newsroom: {
        // partials/icons/feather-newspaper.html (no canonical game-style
        // icon for the Newsroom; this matches the Press-link icon used
        // in the Community dropdown.)
        icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/>
            <path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8z"/>
        </svg>`
    },
    Articles: {
        // partials/icons/game-dna2.html
        icon: `<svg width="16" height="16" viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M415.03 17.563c-4.89 3.61-9.423 7.793-13.5 12.656c-13.096 15.624-20.828 37.513-21.436 66.78c-20.397-11.956-42.823-16.838-64.563-16.03c-22.81.845-44.876 7.946-63 19.655c-20.71 13.382-36.663 33-42.5 56.625c-4.722 19.12-2.484 40.57 8.44 62.188a260 260 0 0 0-16.907-.563c-1.642 0-3.265.027-4.875.063c-38.65.848-68.484 11.434-87.438 31.906c-22.476 24.275-27.11 60.72-14.28 104.406c-25.94-6.293-52.112-5.46-75.907 5.406v40.906c5.85-4.94 13.04-9.213 21.562-12.687h.03l81.22 55.094c.02.76.032 1.53.03 2.28c-.014 13.522-2.952 24.835-8.78 34.375l-94.063-65.03v22.717l78.907 54.532h29.374c8.707-13.213 13.23-29.072 13.25-46.563c.02-18.367-4.637-38.573-13.813-60.436c51.663 16.18 97.765 3.348 123.782-26.344c25.218-28.78 30.145-72.742 5.657-115.875c34.87 5.496 64.61 4.11 88.28-4.344l.22.314l1.092-.78c8.527-3.17 16.258-7.26 23.125-12.314c25.508-18.77 36.86-50.167 33.094-89.625c28.385 18.706 61.257 21.906 92.314 18.813V81.25l-23.25-63.688H415.03zm37.19 2.875l36.53 99.937c-8.585.79-17.944.76-28-.063l-33.938-88.218c7.333-5.274 15.906-9.045 25.407-11.657zM412.436 46.75l27.22 70.78c-12.692-2.245-26.26-5.58-40.657-10.155c-1.062-28.198 4.344-47.378 13.438-60.625zm-75.625 69.688c13.4.654 28.175 2.68 44.094 6.093c4.365 21.814 4.248 39.968.156 54.75zm-22.906.28l58.22 80.032c-3.88 5.663-8.634 10.555-14.25 14.688c-2.198 1.616-4.555 3.106-7.063 4.5l-66.625-93.313c8.662-3.01 18.59-5.016 29.718-5.906zm-46.812 14.126L333 223.188c-9.03 2.58-19.307 4.134-30.75 4.593L247.094 152c4.302-7.57 10.024-13.915 17.062-19.094c.95-.7 1.93-1.403 2.938-2.062zm-27.688 42.406l39.313 54.03c-10.835-.848-22.472-2.53-34.876-5.093l-.063-.156l-1.53-.186c-.314-.067-.623-.12-.938-.188c-.203-.305-.394-.6-.593-.906c-3.555-18.387-3.9-34.173-1.314-47.5zm-38.25 64.406c8.99-.016 18.71.588 28.938 1.688c5.57 15.795 8.692 29.98 9.594 42.625l-46.625-44.126c1.414-.063 2.832-.123 4.28-.156c1.254-.03 2.53-.03 3.813-.032zm-32.312 2.97l69.5 65.78c-2.33 11.467-7.14 21.086-14.156 28.875l-86.532-83.405c8.55-5.023 18.955-8.837 31.188-11.25m-45.938 22.968l86.625 83.53c-7.925 4.71-17.485 8.373-28.655 10.813l-71.03-67.25l-1.47 1.563c2.475-11.374 7.402-20.933 14.53-28.656m-16.312 49.78l50.437 47.75c-12.246.736-25.866.352-40.81-1.28c-6.097-17.403-9.2-32.877-9.626-46.47zm-3.78 65.126c7.247 14.534 12.34 28.058 15.436 40.438l-54.375-36.844c11.462-2.273 24.45-3.53 38.938-3.594zm-83.75 91.563l-.002 22.03l1.22.75h35.437l-36.657-22.78z"/></svg>`
    },
    Library: {
        // partials/icons/game-wax-tablet.html
        icon: `<svg width="16" height="16" viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="m436.992 30.271l-94.19 3.489l-35.874 39.347l-23.596-34.214l-187.894.859l-5.778 252.535l52.742 48.498l114.059 1.383l-.219 17.996l-94.004-1.139l13.25 12.184l160.268 16.852l54.121-3.733l1.238 17.955l-45.183 3.117l-2.606 25.493l94.756 24.796l-.512-200.06l-28.111-12.621l28.004-29.17zM280.85 96.351l.166 17.997l-152.407 1.406l-.166-17.998l152.407-1.404zm120.046 0l.27 17.997l-94.113 1.404l-.268-17.996l94.111-1.404zm-2.91 38.631l.473 17.993l-53.377 1.404l-.475-17.992zm-77.822.7l.2 17.998l-191.036 2.105l-.2-17.996zm-188.678 41.44l42.139.7l-.299 17.996l-42.14-.703l.3-17.994zm262.317 0l.41 17.993l-153.81 3.512l-.41-17.994l153.81-3.512zm-198.555 2.105h21.773v17.998h-21.773zm86.305 37.222l.164 17.998l-153.81 1.405l-.165-17.997l153.81-1.406zm24.664 0h89.898v17.998h-89.898zm-44.854 44.95l132.74 1.406l-.19 17.996l-132.741-1.405zm-133.539.703H243.71V280.1H127.824zm32.81 40.736l.4 17.994l-31.604.703l-.4-17.994l31.605-.703zm233.735.006l.684 17.984l-55.485 2.108l-.683-17.987zm-68.53 2.802l.085 17.999l-151.703.7l-.084-17.997l151.703-.702zm-234.083 13.02l-.35 21.574l64.11 57.606l5.1-15.864zm302.139 24.906l.228 17.996l-110.266 1.407l-.23-17.998zM177.11 389.477l-5.195 16.162l154.508 13.613l1.424-13.926l-150.737-15.85zm158.977 58.127l-4.574 15.039l106.638 26.703c.27-5.17.572-10.058.877-14.805z"/></svg>`
    },
    Wiki: {
        // partials/icons/game-dragon-balls.html
        icon: `<svg width="16" height="16" viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M324.582 17.393c-93.624 0-169.723 76.094-169.723 169.72s76.098 169.725 169.722 169.725s169.725-76.098 169.725-169.725c0-93.624-76.1-169.72-169.725-169.72zm0 18.69c83.523 0 151.033 67.507 151.033 151.03c0 83.525-67.51 151.033-151.033 151.033s-151.03-67.508-151.03-151.033s67.507-151.03 151.03-151.03M356.54 62.01c-4.802-.08-9.63.392-14.448 1.474c-34.385 7.73-39.338 45.97.678 50.385c30.042 3.316 51.002 53.078 45.642 90.703c-6.692 46.976 45.08 44.456 59.164-2.53c18.33-61.148-34.38-139.084-91.037-140.032zm-33.093 65.316l-15.857 42.883l-31-5.303l22.71 27.352l-21.933 26.414l29.07-4.97l17.01 46.005l17.008-45.992l29.375 5.023l-21.988-26.48l22.765-27.418l-31.306 5.353l-15.853-42.866zm-297.633 67.56c-1.02.027-2.096.09-3.23.206h-.002v.002a53 53 0 0 0-3.193.437v19.075c1.79-.417 3.474-.755 5.108-.923c1.993-.206 4.99.048 8.97.048c48.645 0 88.188 39.026 88.188 87.602S82.11 388.936 33.47 388.936c-4.908 0-9.516-.402-14.08-1.172v18.896c4.576.628 9.247.965 14.08.965c58.69 0 106.874-47.533 106.874-106.293S92.16 195.042 33.469 195.042c-1.366 0-2.954-.105-4.767-.15a54 54 0 0 0-2.89-.007zM49.8 238.282c-3.21-.066-6.43.286-9.618 1.11c-18.975 4.897-24.602 31.424-2.22 32.938v-.004c17.73 1.2 23.966 21.076 22.374 41.6c-1.972 25.428 34.927 23.09 41.713-2.442c8.68-32.663-21.24-72.554-52.25-73.2zm146.815 115.413c-37.322 0-67.78 30.457-67.78 67.78s30.458 67.78 67.78 67.78s67.78-30.457 67.78-67.78s-30.458-67.78-67.78-67.78m0 18.69a48.95 48.95 0 0 1 49.09 49.09a48.95 48.95 0 0 1-49.09 49.09a48.95 48.95 0 0 1-49.09-49.09a48.95 48.95 0 0 1 49.09-49.09m3.627 17.55c-1.13 0-2.265.104-3.402.323c-10.146 1.957-13.307 13.24-2.44 17.844c6.05 2.562 13.452 9.213 10.127 23.478c-3.156 13.546 17.432 13.867 21.98.225c6.02-18.053-9.33-41.855-26.265-41.87"/></svg>`
    },
    Sources: {
        // partials/icons/game-fossil.html
        icon: `<svg width="16" height="16" viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M337.268 21.412L97.643 43.66L17.125 159.672l30.592 194.662l.25.088L60.9 439.168l166.438 56.05l119.598-10.36l127.832-60.915l5.377-84.605l7.605-85.133l-10.02-31.236l-35.45-10.642l.548-96.982l.276-.328l-.872-2.717zM221.338 58.39c27.232.292 53.762 7.89 75.67 21.313c26.706 16.363 46.742 41.84 51.01 73.23c2.406 17.697-1.08 35.415-9.15 51.063c24.128 7.656 41.976 13.968 55.943 25.027c16.303 12.91 25.883 31.77 34.08 62.31l1.483 5.534l-4.256 3.834c-35.05 31.564-81.466 52.728-131.297 58.57c-51.316 6.02-103.156-5.577-144.302-30.446c-41.147-24.87-71.802-63.446-78.82-110.922C60.755 143.87 116.99 68.67 203.38 59.264a150 150 0 0 1 17.958-.876zm-.215 18.702a134 134 0 0 0-4.78.027c-3.648.086-7.298.325-10.94.722c-20.212 2.2-38.422 8.412-54.114 17.515c4.263 22.597 19.14 36.716 41.003 46.123c9.088-7.047 20.425-11.79 33.28-12.925h.003a62 62 0 0 1 4.504-.225c-.274-17.968 4.715-33.666 11.166-49.455a135 135 0 0 0-20.123-1.783zm38.535 6.13c-7.05 16.748-11.816 30.916-10.82 47.737c5.064 1.534 9.877 3.708 14.264 6.487c5.04 3.194 9.55 7.294 13.09 12.127l48.736-11.43c-6.917-17.315-20.272-31.837-37.684-42.505c-8.4-5.148-17.72-9.33-27.586-12.417zM134.906 106.62c-33.29 26.87-50.667 68.3-44.72 108.548v.002c.183 1.24.39 2.472.61 3.7c28.092 10.36 52.05 12.284 85.534-3.616c-3.505-6.465-5.89-13.582-6.828-21.24c-1.658-13.547 1.935-27.047 9.443-38.258c-20.607-10.497-37.12-26.62-44.04-49.137zm289.108 31.18l-.39 68.927l-45.843-13.76zm-193.323 9.216q-1.742.004-3.473.156c-.523.046-1.033.114-1.547.176l14.02 20.65c8.896-1.71 18.57.49 25.402 6.56c.172-1.28.212-2.564.078-3.826c-.75-7.038-5.032-13.038-12.072-17.5c-5.28-3.346-12.004-5.54-18.932-6.084a43 43 0 0 0-3.475-.132zm-23.323 6.644c-13.68 8.462-21.077 23.678-19.314 38.082v.002a41 41 0 0 0 2.27 9.27l28.066-11.325c.303-4.362 1.994-8.657 5.05-12.356zm122.217 2.588l-46.068 10.805c.085.564.177 1.125.238 1.7c.645 6.055-.246 12.067-2.377 17.55l34.928 18.935c10.45-14.344 15.387-31.86 13.28-48.99zm-59.127 45.393c-.254.215-.518.416-.777.624c-1.303 2.125-3 4.114-5.096 5.88c-2.283 1.923-4.854 3.426-7.588 4.518l-2.793 24.46c1.878-.047 3.758-.13 5.63-.317c17.064-1.695 31.717-8.165 43.165-17.522l-32.54-17.642zm-45.07 5.38l-24.764 9.992c3.253 3.334 7.042 6.348 11.293 8.994c6.95 4.326 15.077 7.51 23.678 9.353l2.45-21.467c-4.424-1.106-8.586-3.194-12.02-6.272c-.218-.196-.427-.4-.637-.6m102.855 13.234c-15.41 18.853-38.614 32.373-66.562 35.148c-.73.073-1.46.116-2.192.172c8.186 18.072 10.37 32.67 6.744 46.588c-3.447 13.235-11.147 24.704-21.238 38.715c15.69 1.695 31.723 1.702 47.65-.166c43.894-5.146 84.95-23.416 116.46-50.16c-7.193-24.805-14.51-37.858-25.895-46.874c-11.237-8.897-28.577-15.043-54.968-23.422zm-140.53 10.22c-33.997 16.75-62.925 17.738-90.94 9.962c11.302 29.815 33.998 54.615 63.412 72.392c19.095 11.54 40.97 20 64.074 24.785c12.61-17.636 21.18-29.762 23.888-40.162c2.844-10.915 1.06-22.145-9.806-42.554c-13.078-1.858-25.54-6.326-36.3-13.023c-5.22-3.25-10.053-7.073-14.327-11.398zm272.32 130.657l-3.22 50.667l-97.4 46.414l14.133-62.933l86.488-34.146zm-392.083.352l143.605 50.743l6.398 60.113l-140.297-47.246l-9.707-63.61zm285.304 38.854l-14.936 66.51l-101.224 8.77l-6.54-61.454z"/></svg>`
    }
};

// Popular search suggestions. Terms left in English/source spelling so
// the underlying Fuse index (which contains the canonical title forms)
// can match them in every locale. `Raëlism` keeps the diaeresis per
// the terminology rule.
const SUGGESTIONS = [
    { term: 'Elohim', section: 'Wiki' },
    { term: 'Raëlism', section: 'Wiki' },
    { term: 'Genesis', section: 'Wiki' },
    { term: 'Age of Aquarius', section: 'Timeline' },
    { term: 'precession', section: 'Wiki' },
    { term: 'creation', section: 'Wiki' },
    { term: 'ancient astronaut theory', section: 'Articles' },
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
    const pathWithoutLang = uri.replace(/^\/(?:de|fr|es|he|ru|ja|zh|zh-Hant|ko)\//, "/");
    const segments = pathWithoutLang.split("/").filter(Boolean);
    if (segments.length === 0) return "Home";

    const section = segments[0];
    // URL-segment → SECTIONS key. The Knowledge group's "Sources"
    // chip points at the `/sources/` content section — the URL was
    // renamed in the 2026-05 IA pass but the public label stayed as
    // "Sources" in the navbar, and we mirror that here.
    const sectionMap = {
        wiki: "Wiki",
        library: "Library",
        timeline: "Timeline",
        articles: "Articles",
        news: "Newsroom",
        sources: "Sources"
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

// Get navigation links. Order and URLs mirror the current navbar IA:
// Timeline + Newsroom as top-level, then the Knowledge dropdown
// (Articles, Library, Wiki, Sources).
function getNavigationLinks() {
    const baseUrl = currentLanguage === "en" ? "" : `/${currentLanguage}`;
    return [
        { title: sectionLabel("Timeline"), url: `${baseUrl}/timeline/`, section: "Timeline" },
        { title: sectionLabel("Newsroom"), url: `${baseUrl}/news/`, section: "Newsroom" },
        { title: sectionLabel("Articles"), url: `${baseUrl}/articles/`, section: "Articles" },
        { title: sectionLabel("Library"), url: `${baseUrl}/library/`, section: "Library" },
        { title: sectionLabel("Wiki"), url: `${baseUrl}/wiki/`, section: "Wiki" },
        { title: sectionLabel("Sources"), url: `${baseUrl}/sources/`, section: "Sources" }
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
                <span class="search-filter-chip__label">${sectionLabel(key)}</span>
            </button>
        `;
    }).join('');

    return `
        <div class="search-filters">
            <div class="search-filters__header">
                <span class="search-filters__label">${t('filterLabel', 'Filter by section')}</span>
                ${activeFilters.size > 0 ? `<button class="search-filters__clear">${t('filterClearAll', 'Clear all')}</button>` : ''}
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
                    <span class="search-suggestions__label">${t('recentLabel', 'Recent searches')}</span>
                    <button class="search-suggestions__clear" id="clear-recent">${t('recentClear', 'Clear')}</button>
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
                <span class="search-suggestions__label">${t('popularLabel', 'Popular searches')}</span>
            </div>
            <div class="search-suggestions__list">
                ${SUGGESTIONS.slice(0, 6).map(s => `
                    <button class="search-suggestion" data-term="${s.term}">
                        <svg class="search-suggestion__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8"/>
                            <path d="m21 21-4.3-4.3"/>
                        </svg>
                        <span class="search-suggestion__text">${s.term}</span>
                        <span class="search-suggestion__section">${sectionLabel(s.section)}</span>
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
            <h4 class="search-modal__navigation-title">${t('browseTitle', 'Browse sections')}</h4>
            ${links.map(link => `
                <a href="${link.url}" class="search-result search-result--nav">
                    <div class="search-result__left">
                        <div class="search-result__title">${link.title}</div>
                        <div class="search-result__url">${link.url}</div>
                    </div>
                    <div class="search-result__right">
                        <div class="search-result__section">
                            <span class="search-result__section-icon">${getSectionIcon(link.section)}</span>
                            ${sectionLabel(link.section)}
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
                <h3 class="search-modal__title">${t('modalTitle', 'Search')}</h3>
                <div class="search-modal__shortcut">${t('closeHint', 'Press <kbd>Esc</kbd> to close')}</div>
                <button class="search-modal__close" aria-label="${t('closeLabel', 'Close search')}">
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
            langMatch = !urlPath.match(/^\/(?:de|fr|es|he|ru|ja|zh|zh-Hant|ko)\//);
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

// Wrap the query in <strong> after substitution so locale-specific
// punctuation around the placeholder (e.g. JP 「…」, FR « … ») stays
// visually consistent with the emphasized term.
function formatEmptyBody(template, query) {
    const safeQuery = `<strong>${query}</strong>`;
    return template.replace('{query}', safeQuery);
}

// Create empty state HTML
function createEmptyState(query) {
    const tmpl = activeFilters.size > 0
        ? t('emptyBodyFiltered', 'No matches for "{query}" in selected sections. Try different keywords or clear filters.')
        : t('emptyBody', 'No matches for "{query}". Try different keywords.');
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
            <h4 class="search-modal__empty-title">${t('emptyTitle', 'No results found')}</h4>
            <p class="search-modal__empty-text">${formatEmptyBody(tmpl, query)}</p>
        </div>
        ${createNavigationLinks()}
    `;
}

// Create results count HTML
function createResultsCount(count, query) {
    const tmpl = count === 1
        ? t('resultsForOne', '1 result for "{query}"')
        : t('resultsForMany', '{count} results for "{query}"');
    const text = tmpl
        .replace('{count}', `<span class="search-results-count__number">${count}</span>`)
        .replace('{query}', query);
    return `
        <div class="search-results-count">
            <span class="search-results-count__text">${text}</span>
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
                        ${sectionLabel(section)}
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

// Scroll position captured at modal-open time and restored on close.
// The CSS-only `overflow: hidden` lock on body isn't enough — on the
// landing page <html> is the scroll container (scroll-snap lives on
// :root), and browsers also collapse scrollY when style changes
// invalidate the snap target. Pinning <body> with `position: fixed;
// top: -scrollY` parks the page visually where the user was and lets
// us restore the exact pixel offset on close.
let savedScrollY = 0;

// Show search modal
function showSearchModal() {
    const modal = document.getElementById("search-modal");
    const body = document.body;

    if (modal) {
        if (window.navbarDropdown) {
            window.navbarDropdown.closeAllDropdowns();
        }

        savedScrollY = window.scrollY || window.pageYOffset || 0;
        body.style.position = "fixed";
        body.style.top = `-${savedScrollY}px`;
        body.style.left = "0";
        body.style.right = "0";
        body.style.width = "100%";

        modal.classList.add("search-modal--active");
        body.classList.add("search-modal-open");

        // Page blur via a dedicated overlay layered between content and
        // the navbar. We can't apply `filter: blur()` directly to
        // <main> / <footer> — `filter` turns the element into the
        // containing block for its fixed descendants, which re-anchors
        // the landing hero's `.landing-section__media` (position:fixed
        // inset:0) to main's box and breaks its viewport-sized cover
        // crop. `backdrop-filter` on a sibling overlay sidesteps that.
        ensureBlurOverlay();
    }
}

// Lazily inject the blur overlay the first time the modal opens.
// Visibility is driven by `body.search-modal-open` so we don't need to
// toggle it from JS on every show/hide.
function ensureBlurOverlay() {
    if (document.querySelector(".search-modal-blur")) return;
    const overlay = document.createElement("div");
    overlay.className = "search-modal-blur";
    overlay.setAttribute("aria-hidden", "true");
    document.body.appendChild(overlay);
}

// Hide search modal
function hideSearchModal() {
    const modal = document.getElementById("search-modal");
    const body = document.body;

    if (modal) {
        modal.classList.remove("search-modal--active");
        body.classList.remove("search-modal-open");

        body.style.position = "";
        body.style.top = "";
        body.style.left = "";
        body.style.right = "";
        body.style.width = "";
        // Restore the pre-modal scroll position. `scrollTo` instead of
        // assigning `scrollTop` so it works on whichever element ends
        // up being the document scroller across browsers.
        window.scrollTo(0, savedScrollY);

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

    // Index fetch deliberately NOT prefetched at idle. Even after
    // truncating the per-record body via Zola's `truncate_content_length`,
    // the EN search index is a few MB — meaningful network and
    // main-thread cost. Lighthouse's headless browser fires
    // requestIdleCallback within ~1s of paint, so prefetching here
    // destroyed mobile LCP for the (large) majority of visitors who
    // never use search. Index now loads only on real user intent
    // (focus / click / typing / ⌘+/) via initSearch() above. First
    // query waits on the fetch (~1–2s mobile); subsequent are instant.

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
                navbarSearchInput.focus({ preventScroll: true });
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
