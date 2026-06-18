(function () {
    'use strict';

    /* ───────────────────────────────────────────────────────────
       MEDIAINFO DEBUG v0.10 — бейджи дорожек в списке (TV)
       «Авто видимые + lazy»:
         - element.ffprobe есть → рисуем сразу (бесплатно);
         - первые AUTO_LIMIT строк резолвим автоматически очередью
           (concurrency 2); остальные — по фокусу (прыгают в начало);
         - резолв: add→локальный TorrServer→btih→drop → сервер треков.
       Без патчей глобальных объектов.
       ─────────────────────────────────────────────────────────── */

    var VERSION    = 'v0.10';
    var HOST       = '185.204.0.61:8080';
    var TS_BASES   = ['http://127.0.0.1:8090', 'http://localhost:8090', 'http://127.0.0.1:8080'];
    var TS_BASE    = null;
    var AUTO_LIMIT = 8;     // сколько верхних строк тянуть автоматически
    var CONCURRENCY = 2;

    var cache   = {};       // link -> {state, streams}
    var queue   = [];       // [{element,item,link}]
    var running = 0;
    var autoCount = 0;

    /* ── мини-лог ────────────────────────────────────────────── */

    var bot = document.createElement('div');
    bot.id = 'mi-log';
    bot.style.cssText = 'position:fixed;left:0;right:0;bottom:0;max-height:28%;z-index:2147483647;' +
        'background:rgba(0,0,0,.78);color:#7CFC00;font-family:monospace;font-size:11px;line-height:1.3;' +
        'padding:.3em .6em;overflow:hidden;white-space:pre-wrap;word-break:break-all;pointer-events:none';
    var blines = [];
    function log(m) {
        blines.push(new Date().toTimeString().slice(0, 8) + ' ' + m);
        if (blines.length > 40) blines = blines.slice(-40);
        try { bot.textContent = blines.join('\n'); } catch (e) {}
        try { console.log('[MIDBG]', m); } catch (e) {}
    }
    function guard(label, fn) {
        return function () { try { return fn.apply(this, arguments); } catch (e) { log('✗ ' + label + ': ' + (e && e.message ? e.message : e)); } };
    }

    /* ── сеть ────────────────────────────────────────────────── */

    function nativeReq(url, dataType, post, ok, err) {
        var n = new Lampa.Reguest();
        n.timeout(12000);
        n.native(url, ok, err, post || false, { dataType: dataType || 'text' });
    }
    function extractHash(s) {
        if (!s) return null;
        s = String(s);
        var m = s.match(/urn:btih:([a-fA-F0-9]{40})/i); if (m) return m[1].toLowerCase();
        var b = s.match(/urn:btih:([A-Za-z2-7]{32})/);   if (b) return b[1];
        var h = s.match(/\b([a-fA-F0-9]{40})\b/);         if (h) return h[1].toLowerCase();
        return null;
    }

    /* ── бейдж ───────────────────────────────────────────────── */

    function summarize(streams) {
        var audio = streams.filter(function (s) { return s.codec_type === 'audio'; });
        var subs  = streams.filter(function (s) { return s.codec_type === 'subtitle'; });
        var parts = [];
        audio.forEach(function (a) {
            var p = [];
            if (a.tags && a.tags.language) p.push(a.tags.language.toUpperCase());
            if (a.codec_name) p.push(a.codec_name.toUpperCase());
            if (a.channel_layout) p.push(a.channel_layout.replace('stereo', '2.0').replace('mono', '1.0').replace('(side)', ''));
            parts.push('♪ ' + p.join(' '));
        });
        var sl = [];
        subs.forEach(function (s) { if (s.tags && s.tags.language) sl.push(s.tags.language.toUpperCase()); });
        sl = sl.filter(function (v, i) { return sl.indexOf(v) === i; });
        if (sl.length) parts.push('T ' + sl.join('/'));
        return parts;
    }
    function renderBadge(item, streams) {
        try {
            item.find('.mi-badge').remove();
            var parts = summarize(streams);
            if (!parts.length) return;
            item.append('<div class="mi-badge">' + parts.map(function (p) {
                return '<span>' + p.replace(/</g, '&lt;') + '</span>';
            }).join('') + '</div>');
        } catch (e) {}
    }
    function loading(item, on) {
        try { item.find('.mi-badge').remove(); if (on) item.append('<div class="mi-badge mi-load">···</div>'); } catch (e) {}
    }

    /* ── сервер треков ───────────────────────────────────────── */

    function queryTracks(hash, cb) {
        var got = false;
        function done(s) { if (got) return; got = true; cb(s); }
        nativeReq('http://' + HOST + '/api?hash=' + hash + '&index=0', 'json', false,
            guard('http', function (json) { if (json && json.streams && json.streams.length) done(json.streams); }),
            function () {});
        try {
            var ws = new WebSocket('ws://' + HOST + '/?' + hash + '&index=0');
            var t = setTimeout(function () { try { ws.close(); } catch (e) {} done(null); }, 25000);
            ws.onmessage = guard('ws', function (e) {
                var j; try { j = JSON.parse(String(e.data || '')); } catch (ex) { return; }
                if (j && j.streams && j.streams.length) { clearTimeout(t); try { ws.close(); } catch (e) {} done(j.streams); }
            });
            ws.onerror = function () {};
        } catch (e) {}
    }

    /* ── TorrServer add/drop ─────────────────────────────────── */

    function tsAdd(link, cb) {
        if (!TS_BASE) { cb(null); return; }
        nativeReq(TS_BASE + '/torrents', 'json',
            JSON.stringify({ action: 'add', link: link, title: '[mi-probe]', save_to_db: false }),
            guard('add', function (json) { cb((json && (json.hash || (json.torrent && json.torrent.hash))) || null); }),
            function () { cb(null); });
    }
    function tsDrop(hash) {
        if (!TS_BASE || !hash) return;
        nativeReq(TS_BASE + '/torrents', 'text', JSON.stringify({ action: 'drop', hash: hash }), function () {}, function () {});
    }

    /* ── очередь ─────────────────────────────────────────────── */

    function enqueue(element, item, priority) {
        var link = element.Link || element.link || element.MagnetUri || element.url;
        if (!link) return;
        if (cache[link]) { if (cache[link].state === 'done') renderBadge(item, cache[link].streams); return; }

        // уже в очереди? поднять в начало при priority
        for (var i = 0; i < queue.length; i++) {
            if (queue[i].link === link) {
                if (priority) { var j = queue.splice(i, 1)[0]; queue.unshift(j); }
                return;
            }
        }
        var job = { element: element, item: item, link: link };
        if (priority) queue.unshift(job); else queue.push(job);
        pump();
    }

    function pump() {
        while (running < CONCURRENCY && queue.length) {
            var job = queue.shift();
            if (cache[job.link] && cache[job.link].state === 'done') { renderBadge(job.item, cache[job.link].streams); continue; }
            running++;
            resolveJob(job, function () { running--; pump(); });
        }
    }

    function resolveJob(job, onDone) {
        cache[job.link] = { state: 'pending' };
        loading(job.item, true);
        var direct = extractHash(job.element.MagnetUri) || extractHash(job.element.Link);

        function withHash(hash) {
            if (!hash) { loading(job.item, false); cache[job.link] = null; onDone(); return; }
            queryTracks(hash, function (streams) {
                tsDrop(hash);
                loading(job.item, false);
                if (streams && streams.length) {
                    cache[job.link] = { state: 'done', streams: streams };
                    renderBadge(job.item, streams);
                    log('✓ ' + summarize(streams).join(' '));
                } else { cache[job.link] = null; log('нет дорожек: ' + (job.element.Title || '').slice(0, 24)); }
                onDone();
            });
        }
        if (direct) withHash(direct); else tsAdd(job.link, withHash);
    }

    /* ── render ──────────────────────────────────────────────── */

    function onRender(element, item) {
        if (element.ffprobe && element.ffprobe.length) { renderBadge(item, element.ffprobe); return; }

        if (autoCount < AUTO_LIMIT) { autoCount++; enqueue(element, item, false); }

        try {
            item.on('hover:focus', guard('focus', function () { enqueue(element, item, true); }));
        } catch (e) {}
    }

    /* ── init ────────────────────────────────────────────────── */

    function detectTS() {
        TS_BASES.forEach(function (base) {
            nativeReq(base + '/echo', 'text', false,
                guard('echo', function (resp) { if (!TS_BASE) { TS_BASE = base; log('TorrServer: ' + base + ' (' + String(resp).slice(0, 12) + ')'); pump(); } }),
                function () {});
        });
    }

    guard('init', function () {
        document.body.appendChild(bot);
        log(VERSION + ' loaded');
        var style = document.createElement('style');
        style.textContent =
            '.mi-badge{display:flex;flex-wrap:wrap;gap:.4em;margin-top:.4em;font-size:.78em;opacity:.92}' +
            '.mi-badge span{background:rgba(124,252,0,.15);border:1px solid rgba(124,252,0,.5);' +
            'border-radius:.3em;padding:.05em .4em;white-space:nowrap}' +
            '.mi-load{opacity:.4;letter-spacing:.3em}';
        document.head.appendChild(style);

        detectTS();

        if (!(window.Lampa && Lampa.Listener)) { log('Lampa.Listener нет'); return; }

        Lampa.Listener.follow('torrent', guard('ev', function (data) {
            if (data.type === 'render' && data.element && data.item) onRender(data.element, data.item);
            // новый список — сбрасываем авто-лимит
            if (data.type === 'list_open' || data.type === 'open') autoCount = 0;
        }));

        log('готов, AUTO_LIMIT=' + AUTO_LIMIT + ' conc=' + CONCURRENCY);
    })();

    window.MIDBG = {
        log: log,
        clearCache: function () { cache = {}; queue = []; log('cache/queue cleared'); }
    };

})();
