// Listen-to-this-page feature
//
// Two top-level engines, exposed to the user as a binary toggle:
//   - "system": browser SpeechSynthesis — instant, free, quality varies by OS
//   - "studio": a higher-quality neural TTS, selected per-page-language:
//        en, de, fr, es, ru, ja, ko  → Supertonic 3 (via transformers.js v4)
//        zh, zh-Hant                 → Piper (via @mintplex-labs/piper-tts-web)
//        anything else / load failure → silently falls back to "system"
//
// Engine preference is persisted in localStorage under `woh:listen:engine`.
// All model assets are lazy-fetched from a public CDN on first use; we do not
// self-host model weights.

(function () {
    const trigger = document.getElementById('listenTrigger');
    if (!trigger) return;

    const player = document.getElementById('audioPlayer');
    const playPauseBtn = document.getElementById('audioPlayPause');
    const closeBtn = document.getElementById('audioClose');
    const progressFill = document.getElementById('audioProgressFill');
    const progressHandle = document.getElementById('audioProgressHandle');
    const timeCurrent = document.getElementById('audioTimeCurrent');
    const timeTotal = document.getElementById('audioTimeTotal');
    const titleEl = document.querySelector('.audio-player__title-text');
    const engineToggle = document.getElementById('audioEngineToggle');
    const engineLabel = document.getElementById('audioEngineLabel');
    const loadingEl = document.getElementById('audioLoading');
    const loadingLabel = document.getElementById('audioLoadingLabel');

    const STORAGE_KEY = 'woh:listen:engine';
    const hasWebSpeech = 'speechSynthesis' in window;

    if (!hasWebSpeech && !window.WebAssembly) {
        trigger.style.display = 'none';
        return;
    }

    // --- Language routing ----------------------------------------------------

    // Returns the page's primary language tag as ['family', 'fullTag'].
    // e.g. zh-Hant → ['zh', 'zh-Hant'], en-US → ['en', 'en-US'].
    function detectPageLang() {
        const raw = (document.documentElement.lang || 'en').trim();
        const family = raw.split('-')[0].toLowerCase();
        return { family, tag: raw };
    }

    // Which studio sub-engine handles this language, or null if unsupported.
    function studioEngineFor({ family, tag }) {
        if (['en', 'de', 'fr', 'es', 'ru', 'ja', 'ko'].includes(family)) return 'supertonic';
        if (family === 'zh') return 'piper';
        return null;
    }

    // Default Piper voice ID per language. These follow rhasspy's naming
    // convention; verify with `piper-tts-web` when testing.
    const PIPER_VOICES = {
        'zh-CN': 'zh_CN-huayan-medium',
        'zh-Hant': 'zh_CN-huayan-medium',     // no zh_TW voice in piper-voices as of writing; falls through to Mandarin
        'zh': 'zh_CN-huayan-medium',
    };

    function piperVoiceFor({ family, tag }) {
        return PIPER_VOICES[tag] || PIPER_VOICES[family] || 'zh_CN-huayan-medium';
    }

    // --- State ---------------------------------------------------------------

    let currentEngine = null;
    let engineName = localStorage.getItem(STORAGE_KEY) || 'system';
    let isPlaying = false;
    let isPaused = false;
    let estimatedDuration = 0;
    let startTime = 0;
    let pausedAt = 0;
    let progressInterval = null;

    // --- DOM helpers ---------------------------------------------------------

    function getContentText() {
        const selectors = [
            '.wiki__content',
            '.article__content',
            '.essentials__content',
            '.resources__content',
            '.library-book__content',
            '.library__content',
            'article .content',
            'article',
        ];
        for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (!el) continue;
            const clone = el.cloneNode(true);
            clone
                .querySelectorAll(
                    'script, style, nav, .toc, .breadcrumbs, .listen-trigger, .audio-player, sup, .wiki-cite'
                )
                .forEach((n) => n.remove());
            return (clone.textContent || clone.innerText).replace(/\s+/g, ' ').trim();
        }
        return '';
    }

    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    function updateProgress(elapsed) {
        const percent = estimatedDuration
            ? Math.min((elapsed / estimatedDuration) * 100, 100)
            : 0;
        progressFill.style.width = `${percent}%`;
        progressHandle.style.left = `${percent}%`;
        timeCurrent.textContent = formatTime(elapsed);
    }

    function startProgressTimer() {
        startTime = Date.now() - pausedAt * 1000;
        progressInterval = setInterval(() => {
            if (isPlaying && !isPaused) {
                updateProgress((Date.now() - startTime) / 1000);
            }
        }, 100);
    }

    function stopProgressTimer() {
        if (progressInterval) {
            clearInterval(progressInterval);
            progressInterval = null;
        }
    }

    function showPlayer() {
        player.classList.add('audio-player--visible');
        player.setAttribute('aria-hidden', 'false');
        // `inert` mirrors aria-hidden but also removes the panel from the
        // tab order. Without it, the play/pause/close buttons remain
        // focusable even while the player is visually offscreen.
        player.removeAttribute('inert');
        document.body.classList.add('has-audio-player');
    }

    function hidePlayer() {
        player.classList.remove('audio-player--visible');
        player.setAttribute('aria-hidden', 'true');
        player.setAttribute('inert', '');
        document.body.classList.remove('has-audio-player');
    }

    const labelPlay = player.dataset.labelPlay || 'Play';
    const labelPause = player.dataset.labelPause || 'Pause';
    const labelThisPage = player.dataset.labelThisPage || 'This page';

    function updatePlayState(playing) {
        if (playing) {
            player.classList.add('audio-player--playing');
            player.classList.remove('audio-player--paused');
            playPauseBtn.setAttribute('aria-label', labelPause);
        } else {
            player.classList.remove('audio-player--playing');
            player.classList.add('audio-player--paused');
            playPauseBtn.setAttribute('aria-label', labelPlay);
        }
    }

    function showLoading(message) {
        if (!loadingEl) return;
        loadingLabel.textContent = message;
        loadingEl.classList.add('audio-player__loading--visible');
        player.classList.add('audio-player--loading');
    }

    function hideLoading() {
        if (!loadingEl) return;
        loadingEl.classList.remove('audio-player__loading--visible');
        player.classList.remove('audio-player--loading');
    }

    function setEngineLabel() {
        if (engineLabel) {
            engineLabel.textContent = engineName === 'studio' ? 'Studio voice' : 'System voice';
        }
        if (engineToggle) {
            engineToggle.setAttribute(
                'aria-label',
                engineName === 'studio'
                    ? 'Switch to system voice'
                    : 'Switch to studio voice'
            );
            engineToggle.classList.toggle('audio-player__engine--studio', engineName === 'studio');
        }
    }

    // --- Shared chunker ------------------------------------------------------

    function chunkText(text, maxChars = 480) {
        const sentences = text.match(/[^.!?。！？]+[.!?。！？]+|\s*[^.!?。！？]+$/g) || [text];
        const chunks = [];
        let buf = '';
        for (const s of sentences) {
            const piece = s.trim();
            if (!piece) continue;
            if ((buf + ' ' + piece).trim().length > maxChars && buf) {
                chunks.push(buf.trim());
                buf = piece;
            } else {
                buf = buf ? buf + ' ' + piece : piece;
            }
        }
        if (buf.trim()) chunks.push(buf.trim());
        return chunks;
    }

    // --- Engine: System (Web Speech) -----------------------------------------

    function createSystemEngine() {
        let utterance = null;
        return {
            name: 'system',
            async load() {},
            speak(text, callbacks) {
                window.speechSynthesis.cancel();
                utterance = new SpeechSynthesisUtterance(text);
                const lang = detectPageLang();
                const voices = window.speechSynthesis.getVoices();
                const langMatch = voices.find((v) =>
                    v.lang.toLowerCase().startsWith(lang.family)
                );
                if (langMatch) utterance.voice = langMatch;
                utterance.rate = 1.0;
                utterance.pitch = 1.0;
                utterance.onstart = callbacks.onStart;
                utterance.onpause = callbacks.onPause;
                utterance.onresume = callbacks.onResume;
                utterance.onend = callbacks.onEnd;
                utterance.onerror = (e) => {
                    if (e.error !== 'canceled') console.error('Speech synthesis error:', e);
                    callbacks.onEnd();
                };
                window.speechSynthesis.speak(utterance);
            },
            pause() { window.speechSynthesis.pause(); },
            resume() { window.speechSynthesis.resume(); },
            stop() { window.speechSynthesis.cancel(); },
        };
    }

    // --- Shared chunked-playback runner --------------------------------------
    // Both studio engines share the same "generate next chunk, play, then
    // generate again" loop; only the per-chunk generator differs.

    function createChunkedRunner({ generate, label }) {
        let audioEl = null;
        let queue = [];
        let queueIndex = 0;
        let callbacksRef = null;
        let stopped = false;

        async function playNext() {
            if (stopped) return;
            if (queueIndex >= queue.length) {
                callbacksRef?.onEnd();
                return;
            }
            const chunk = queue[queueIndex++];
            try {
                const blob = await generate(chunk);
                if (stopped) return;
                const url = URL.createObjectURL(blob);
                if (audioEl) {
                    audioEl.pause();
                    try { URL.revokeObjectURL(audioEl.src); } catch (_) {}
                }
                audioEl = new Audio(url);
                audioEl.onended = () => {
                    URL.revokeObjectURL(url);
                    playNext();
                };
                audioEl.onerror = (e) => {
                    console.error(`${label} audio playback error:`, e);
                    callbacksRef?.onEnd();
                };
                if (queueIndex === 1) callbacksRef?.onStart();
                await audioEl.play();
            } catch (err) {
                console.error(`${label} generation error:`, err);
                callbacksRef?.onEnd();
            }
        }

        return {
            start(text, callbacks) {
                callbacksRef = callbacks;
                stopped = false;
                queue = chunkText(text);
                queueIndex = 0;
                return playNext();
            },
            pause() { if (audioEl) audioEl.pause(); },
            resume() { if (audioEl) audioEl.play(); },
            stop() {
                stopped = true;
                if (audioEl) {
                    audioEl.pause();
                    try { URL.revokeObjectURL(audioEl.src); } catch (_) {}
                    audioEl = null;
                }
                queue = [];
                queueIndex = 0;
            },
        };
    }

    // --- Engine: Supertonic (via transformers.js v4) -------------------------

    function createSupertonicEngine() {
        let pipe = null;
        let runner = null;

        async function ensureLoaded() {
            if (pipe) return;
            showLoading('Loading studio voice (Supertonic)…');
            const mod = await import(
                /* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4/+esm'
            );
            const { pipeline } = mod;
            pipe = await pipeline('text-to-speech', 'Supertone/supertonic-3', {
                dtype: 'q8',
                progress_callback: (p) => {
                    if (p && p.status === 'progress' && typeof p.progress === 'number') {
                        showLoading(`Loading studio voice (Supertonic)… ${Math.round(p.progress)}%`);
                    }
                },
            });
            hideLoading();
        }

        async function generate(text) {
            const lang = detectPageLang();
            // Supertonic accepts a language hint; pass the page's family code.
            const out = await pipe(text, { language: lang.family });
            // transformers.js TTS pipelines return { audio: Float32Array, sampling_rate: number }.
            return floatToWavBlob(out.audio, out.sampling_rate);
        }

        return {
            name: 'supertonic',
            async load() { await ensureLoaded(); },
            async speak(text, callbacks) {
                try {
                    await ensureLoaded();
                    runner = createChunkedRunner({ generate, label: 'Supertonic' });
                    await runner.start(text, callbacks);
                } catch (err) {
                    console.error('Supertonic engine failed:', err);
                    hideLoading();
                    callbacks.onEnd();
                    throw err;
                }
            },
            pause() { runner?.pause(); },
            resume() { runner?.resume(); },
            stop() { runner?.stop(); },
        };
    }

    // --- Engine: Piper (via @mintplex-labs/piper-tts-web) --------------------

    function createPiperEngine() {
        let piper = null;
        let runner = null;

        async function ensureLoaded() {
            if (piper) return;
            showLoading('Loading studio voice (Piper)…');
            piper = await import(
                /* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/@mintplex-labs/piper-tts-web/+esm'
            );
            hideLoading();
        }

        async function generate(text) {
            const voiceId = piperVoiceFor(detectPageLang());
            // piper-tts-web exposes predict() which returns a ReadableStream of WAV bytes.
            const stream = await piper.predict({ text, voiceId });
            return await new Response(stream).blob();
        }

        return {
            name: 'piper',
            async load() { await ensureLoaded(); },
            async speak(text, callbacks) {
                try {
                    await ensureLoaded();
                    runner = createChunkedRunner({ generate, label: 'Piper' });
                    await runner.start(text, callbacks);
                } catch (err) {
                    console.error('Piper engine failed:', err);
                    hideLoading();
                    callbacks.onEnd();
                    throw err;
                }
            },
            pause() { runner?.pause(); },
            resume() { runner?.resume(); },
            stop() { runner?.stop(); },
        };
    }

    // --- Engine resolver (studio = supertonic | piper, picked per language) --

    function getEngine() {
        if (currentEngine && currentEngine.name === engineDescriptor()) return currentEngine;
        if (currentEngine) currentEngine.stop();

        if (engineName === 'studio') {
            const sub = studioEngineFor(detectPageLang());
            if (sub === 'supertonic') currentEngine = createSupertonicEngine();
            else if (sub === 'piper') currentEngine = createPiperEngine();
            else currentEngine = createSystemEngine(); // language outside studio coverage
        } else {
            currentEngine = createSystemEngine();
        }
        return currentEngine;
    }

    function engineDescriptor() {
        if (engineName !== 'studio') return 'system';
        return studioEngineFor(detectPageLang()) || 'system';
    }

    // --- Float32 PCM → WAV blob helper (for Supertonic) ----------------------

    function floatToWavBlob(samples, sampleRate) {
        const buffer = new ArrayBuffer(44 + samples.length * 2);
        const view = new DataView(buffer);
        const writeStr = (offset, s) => {
            for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
        };
        writeStr(0, 'RIFF');
        view.setUint32(4, 36 + samples.length * 2, true);
        writeStr(8, 'WAVE');
        writeStr(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeStr(36, 'data');
        view.setUint32(40, samples.length * 2, true);
        let offset = 44;
        for (let i = 0; i < samples.length; i++, offset += 2) {
            const s = Math.max(-1, Math.min(1, samples[i]));
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        }
        return new Blob([buffer], { type: 'audio/wav' });
    }

    // --- Playback control ----------------------------------------------------

    async function speak() {
        const text = getContentText();
        if (!text) return;

        const wordCount = text.split(/\s+/).length;
        estimatedDuration = (wordCount / 150) * 60;
        pausedAt = 0;

        const pageTitle = document.title.split('|')[0].trim() || labelThisPage;
        titleEl.textContent = pageTitle;
        timeTotal.textContent = formatTime(estimatedDuration);

        showPlayer();

        let engine = getEngine();
        try {
            await engine.speak(text, {
                onStart: () => {
                    isPlaying = true;
                    isPaused = false;
                    updatePlayState(true);
                    startProgressTimer();
                },
                onPause: () => {
                    isPaused = true;
                    pausedAt = (Date.now() - startTime) / 1000;
                    stopProgressTimer();
                    updatePlayState(false);
                },
                onResume: () => {
                    isPaused = false;
                    updatePlayState(true);
                    startProgressTimer();
                },
                onEnd: () => {
                    isPlaying = false;
                    isPaused = false;
                    stopProgressTimer();
                    updateProgress(estimatedDuration);
                    updatePlayState(false);
                },
            });
        } catch (_err) {
            // Studio engine failed (CDN block, WASM unsupported, etc.).
            // Fall back to system for this session without flipping the user's preference.
            if (hasWebSpeech && engine.name !== 'system') {
                currentEngine = createSystemEngine();
                await speak();
            }
        }
    }

    function togglePlayPause() {
        if (!isPlaying && !isPaused) {
            speak();
        } else if (isPlaying && !isPaused) {
            getEngine().pause();
            isPaused = true;
            pausedAt = (Date.now() - startTime) / 1000;
            stopProgressTimer();
            updatePlayState(false);
        } else if (isPaused) {
            getEngine().resume();
            isPaused = false;
            isPlaying = true;
            updatePlayState(true);
            startProgressTimer();
        }
    }

    function stop() {
        if (currentEngine) currentEngine.stop();
        isPlaying = false;
        isPaused = false;
        pausedAt = 0;
        stopProgressTimer();
        hidePlayer();
        hideLoading();
        progressFill.style.width = '0%';
        progressHandle.style.left = '0%';
        timeCurrent.textContent = '0:00';
    }

    function toggleEngine() {
        const wasPlaying = isPlaying || isPaused;
        if (wasPlaying) {
            if (currentEngine) currentEngine.stop();
            stopProgressTimer();
            isPlaying = false;
            isPaused = false;
            updatePlayState(false);
        }
        engineName = engineName === 'studio' ? 'system' : 'studio';
        if (engineName === 'studio' && !window.WebAssembly) engineName = 'system';
        localStorage.setItem(STORAGE_KEY, engineName);
        currentEngine = null;
        setEngineLabel();
        if (wasPlaying) speak();
    }

    // --- Wire up -------------------------------------------------------------

    setEngineLabel();

    trigger.addEventListener('click', () => {
        if (!isPlaying && !isPaused) speak();
        else showPlayer();
    });
    playPauseBtn.addEventListener('click', togglePlayPause);
    closeBtn.addEventListener('click', stop);
    if (engineToggle) engineToggle.addEventListener('click', toggleEngine);

    if (hasWebSpeech && speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = () => {};
    }

    window.addEventListener('beforeunload', stop);
})();
