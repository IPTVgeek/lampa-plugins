(function () {
    'use strict';

    /* ───────────────────────────────────────────────────────────
       MEDIAINFO DEBUG v0.9 — бейджи дорожек в списке торрентов (TV)
       Источник btih на строку:
         1) element.ffprobe (если парсер уже дал) — бесплатно;
         2) по фокусу строки: add→локальный TorrServer→btih→drop,
            затем сервер треков 185.204.0.61 (HTTP кэш + WS анализ).
       Плеер в списке не запущен → таймеры не мёрзнут.
       Без патчей глобальных объектов.
       ─────────────────────────────────────────────────────────── */

    var VERSION = 'v0.9';
    var HOST    = '185.204.0.61:8080';
    var TS_BASES = ['http://127.0.0.1:8090', 'http://localhost:8090', 'http://127.0.0.1:8080'];
    var TS_BASE = null;

    var cache = {};       // link -> {state:'pending'|'done', streams}
    var focusTimer = null;

    /* ── мини-лог ────────────────────────────────────────────── */

    var bot = document.createElement('div');
    bot.id = 'mi-log';
    bot.style.cssText = 'position:fixed;left:0;right:0;bottom:0;max-height:32%;z-index:2147483647;' +
        'background:rgba(0,0,0,.8);color:#7CFC00;font-family:monospace;font-size:11px;line-height:1.3;' +
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

    /* ── сеть (нативный httpReq на Android) ──────────────────── */

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

    /* ── формат бейджа ───────────────────────────────────────── */

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
            var html = '<div class="mi-badge">' + parts.map(function (p) {
                return '<span>' + p.replace(/</g, '&lt;') + '</span>';
            }).join('') + '</div>';
            item.append(html);
        } catch (e) { log('badge err: ' + e.message); }
    }

    function loading(item, on) {
        try {
            item.find('.mi-badge').remove();
            if (on) item.append('<div class="mi-badge mi-load">···</div>');
        } catch (e) {}
    }

    /* ── сервер треков ───────────────────────────────────────── */

    function queryTracks(hash, cb) {
        var got = false;
        function done(streams) { if (got) return; got = true; cb(streams); }

        nativeReq('http://' + HOST + '/api?hash=' + hash + '&index=0', 'json', false,
            guard('http-ok', function (json) {
                if (json && json.streams && json.streams.length) { log('HTTP кэш hit'); done(json.streams); }
            }),
            function () {});

        try {
            var ws = new WebSocket('ws://' + HOST + '/?' + hash + '&index=0');
            var t = setTimeout(function () { try { ws.close(); } catch (e) {} if (!got) done(null); }, 25000);
            ws.onmessage = guard('ws', function (e) {
                var j; try { j = JSON.parse(String(e.data || '')); } catch (ex) { return; }
                if (j && j.streams && j.streams.length) { clearTimeout(t); try { ws.close(); } catch (e) {} log('WS анализ ok'); done(j.streams); }
            });
            ws.onerror = function () { log('WS error proto=' + location.protocol); };
        } catch (e) { log('WS throw ' + e.message); }
    }

    /* ── локальный TorrServer: add → hash → drop ─────────────── */

    function tsAdd(link, cb) {
        if (!TS_BASE) { cb(null); return; }
        nativeReq(TS_BASE + '/torrents', 'json',
            JSON.stringify({ action: 'add', link: link, title: '[mi-probe]', save_to_db: false }),
            guard('ts-add', function (json) {
                var h = json && (json.hash || (json.torrent && json.torrent.hash));
                log('TS add → ' + (h ? h.slice(0, 12) : 'нет hash'));
                cb(h || null);
            }),
            function (jq, ex) { log('TS add ERR ' + (ex || (jq && jq.status))); cb(null); });
    }

    function tsDrop(hash) {
        if (!TS_BASE || !hash) return;
        nativeReq(TS_BASE + '/torrents', 'text', JSON.stringify({ action: 'drop', hash: hash }), function () {}, function () {});
    }

    /* ── резолв одной строки ─────────────────────────────────── */

    function resolveRow(element, item) {
        var link = element.Link || element.link || element.MagnetUri || element.url;
        if (!link) return;

        if (cache[link]) {
            if (cache[link].state === 'done') renderBadge(item, cache[link].streams);
            return;
        }
        cache[link] = { state: 'pending' };
        loading(item, true);
        log('резолв: ' + (element.Title || element.title || '').slice(0, 30));

        var direct = extractHash(element.MagnetUri) || extractHash(element.Link);
        function withHash(hash) {
            if (!hash) { loading(item, false); cache[link] = null; return; }
            queryTracks(hash, function (streams) {
                tsDrop(hash);
                loading(item, false);
                if (streams && streams.length) {
                    cache[link] = { state: 'done', streams: streams };
                    renderBadge(item, streams);
                    log('бейдж готов: ' + summarize(streams).join(' '));
                } else {
                    cache[link] = null;
                    log('сервер треков не дал дорожек');
                }
            });
        }

        if (direct) withHash(direct);
        else tsAdd(link, withHash);
    }

    /* ── подписки ────────────────────────────────────────────── */

    function onRender(element, item) {
        // 1) бесплатно из парсера
        if (element.ffprobe && element.ffprobe.length) {
            renderBadge(item, element.ffprobe);
            return;
        }
        // 2) по фокусу — резолв через TorrServer + сервер треков
        try {
            item.on('hover:focus', guard('focus', function () {
                clearTimeout(focusTimer);
                focusTimer = setTimeout(function () { resolveRow(element, item); }, 450);
            }));
        } catch (e) { log('bind focus err: ' + e.message); }
    }

    /* ── init ────────────────────────────────────────────────── */

    function detectTS(done) {
        var left = TS_BASES.length;
        TS_BASES.forEach(function (base) {
            nativeReq(base + '/echo', 'text', false,
                guard('echo', function (resp) {
                    if (!TS_BASE) { TS_BASE = base; log('TorrServer: ' + base + ' (' + String(resp).slice(0, 12) + ')'); done && done(); done = null; }
                }),
                function () { if (--left === 0 && !TS_BASE) { log('TorrServer не найден'); done && done(); } });
        });
    }

    guard('init', function () {
        document.body.appendChild(bot);
        log(VERSION + ' loaded; AndroidJS=' + (typeof AndroidJS));
        var style = document.createElement('style');
        style.textContent =
            '.mi-badge{display:flex;flex-wrap:wrap;gap:.4em;margin-top:.4em;font-size:.78em;opacity:.9}' +
            '.mi-badge span{background:rgba(124,252,0,.15);border:1px solid rgba(124,252,0,.5);' +
            'border-radius:.3em;padding:.05em .4em;white-space:nowrap}' +
            '.mi-load{opacity:.4;letter-spacing:.3em}';
        document.head.appendChild(style);

        detectTS();

        if (!(window.Lampa && Lampa.Listener)) { log('Lampa.Listener нет'); return; }

        Lampa.Listener.follow('torrent', guard('ev', function (data) {
            if (data.type === 'render' && data.element && data.item) onRender(data.element, data.item);
        }));

        log('подписка на torrent/render установлена');
    })();

    window.MIDBG = { log: log, clearCache: function () { cache = {}; log('cache cleared'); } };

})();
