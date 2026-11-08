const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');

const source = readFileSync(join(__dirname, '../static/sw.js'), 'utf8');

function worker() {
    const handlers = {};
    const cached = new Response('stale cached content');
    let cacheReads = 0;
    runInNewContext(source, {
        self: { addEventListener(name, handler) { handlers[name] = handler; } },
        location: { origin: 'https://www.wheelofheaven.world' },
        URL, Response, console,
        caches: { async match() { cacheReads++; return cached; } },
    });
    return {
        request(path, extra = {}) {
            let response;
            handlers.fetch({
                request: { url: `https://assets.wheelofheaven.world${path}`, method: 'GET', ...extra },
                respondWith(value) { response = value; },
            });
            return response;
        },
        reads() { return cacheReads; },
    };
}

test('audio metadata bypasses stale offline entries, including explicit revalidation', () => {
    const sw = worker();
    for (const file of ['manifest.json', 'c1.timing.json', 'c1.cinematic.json']) {
        assert.equal(sw.request(`/audio/en/book/${file}`, { cache: 'no-cache' }), undefined);
    }
    assert.equal(sw.reads(), 0);
});

test('full and ranged audio requests bypass the offline image cache', () => {
    const sw = worker();
    for (const file of ['c1.mp3?v=new', 'c1.opus?v=new', 'c1.ambient.opus?v=new']) {
        assert.equal(sw.request(`/audio/en/book/${file}`), undefined);
        assert.equal(sw.request(`/audio/en/book/${file}`, { headers: { Range: 'bytes=1000-' } }), undefined);
    }
    assert.equal(sw.reads(), 0);
});

test('CDN images retain offline cache support', async () => {
    const sw = worker();
    const response = await sw.request('/images/wiki/elohim.webp');
    assert.equal(await response.text(), 'stale cached content');
    assert.equal(sw.reads(), 1);
});
