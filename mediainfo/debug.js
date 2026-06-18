(function () {
    'use strict';

    /* ───────────────────────────────────────────────────────────
       MEDIAINFO DEBUG v0.6 — добываем btih на Android TV
       nnmclub: MagnetUri нет, только parsemagnet (302).
       Канал 1 (резолв 302) мёртв — натив не отдаёт Location.
       Канал 2 (рабочий): локальный TorrServer 127.0.0.1:8090
       (/echo, /torrents list) → готовый btih. Натив httpReq.
       Без патчей глобальных объектов.
       ─────────────────────────────────────────────────────────── */

    var VERSION = 'v0.6';
    var HOST    = '185.204.0.61:8080';
    var TS_BASES = ['http://127.0.0.1:8090', 'http://localhost:8090', 'http://127.0.0.1:8080', 'http://127.0.0.1:9090'];

    /* ── overlays ────────────────────────────────────────────── */

    var top = mk('mi-top', 'top:0', '16px', '#FFD400');
    var bot = mk('mi-log', 'bottom:0', '11px', '#7CFC00');

    function mk(id, edge, fs, color) {
        var d = document.createElement('div');
        d.id = id;
        d.style.cssText = [
            'position:fixed', 'left:0', 'right:0', edge,
            'max-height:46%', 'z-index:2147483647',
            'background:rgba(0,0,0,.85)', 'color:' + color,
            'font-family:monospace', 'font-size:' + fs, 'line-height:1.3',
            'padding:.4em .7em', 'overflow:hidden',
            'white-space:pre-wrap', 'word-break:break-all', 'pointer-events:none'
        ].join(';');
        return d;
    }

    var blines = [];
    function log(m) {
        var t = new Date().toTimeString().slice(0, 8);
        blines.push(t + ' ' + m);
        if (blines.length > 70) blines = blines.slice(-70);
        try { bot.textContent = blines.join('\n'); } catch (e) {}
        try { console.log('[MIDBG]', m); } catch (e) {}
    }
    function head(m) { try { top.textContent = 'MEDIAINFO ' + VERSION + '\n' + m; } catch (e) {} }

    function guard(label, fn) {
        return function () {
            try { return fn.apply(this, arguments); }
            catch (e) { log('✗ ' + label + ': ' + (e && e.message ? e.message : e)); }
        };
    }
    function run(label, fn) { return guard(label, fn)(); }

    window.addEventListener('error', function (e) {
        if (e.filename || (e.message && !/script error/i.test(e.message)))
            log('!! onerror: ' + (e.message || '') + ' @' + (e.filename || '') + ':' + (e.lineno || ''));
    });

    /* ── helpers ─────────────────────────────────────────────── */

    function extractHash(s) {
        if (!s) return null;
        s = String(s);
        var m = s.match(/urn:btih:([a-fA-F0-9]{40})/i); if (m) return m[1].toLowerCase();
        var b = s.match(/urn:btih:([A-Za-z2-7]{32})/);   if (b) return b[1];
        var h = s.match(/\b([a-fA-F0-9]{40})\b/);         if (h) return h[1].toLowerCase();
        return null;
    }

    function nativeReq(url, dataType, post, ok, err) {
        var n = new Lampa.Reguest();
        n.timeout(12000);
        n.native(url, ok, err, post || false, { dataType: dataType || 'text' });
    }

    var solved = false;
    function solve(hash, where) {
        if (solved) return;
        solved = true;
        log('✔ btih (' + where + ') = ' + hash);
        queryServer(hash);
    }

    /* ── сервер треков ───────────────────────────────────────── */

    function queryServer(hash) {
        var url = 'http://' + HOST + '/api?hash=' + hash + '&index=0';
        log('query → ' + url);
        nativeReq(url, 'json', false,
            guard('srv-ok', function (json) {
                var s = json && json.streams;
                log('server streams = ' + (s ? s.length : 0));
                if (s && s.length) showTracks(s);
                else head('btih=' + hash.slice(0, 12) + '…\nсервер ответил, streams пуст');
            }),
            guard('srv-err', function (jq, ex) {
                log('server ERR: ' + (ex || '') + ' status=' + (jq && jq.status));
                head('btih=' + hash.slice(0, 12) + '…\nсервер треков НЕ ответил (' + (ex || (jq && jq.status)) + ')');
            }));
    }

    function showTracks(streams) {
        var audio = streams.filter(function (s) { return s.codec_type === 'audio'; });
        var subs  = streams.filter(function (s) { return s.codec_type === 'subtitle'; });
        var parts = [];
        audio.forEach(function (a) {
            var p = [];
            if (a.tags && a.tags.language) p.push(a.tags.language.toUpperCase());
            if (a.codec_name) p.push(a.codec_name.toUpperCase());
            if (a.channel_layout) p.push(a.channel_layout.replace('stereo', '2.0').replace('mono', '1.0'));
            parts.push('♪ ' + p.join(' '));
        });
        subs.forEach(function (s) {
            parts.push('T ' + (s.tags && s.tags.language ? s.tags.language.toUpperCase() : (s.codec_name || 'SUB')));
        });
        var txt = parts.length ? parts.join('   ') : 'дорожек нет';
        head('✓ РАБОТАЕТ\n' + txt);
        log('TRACKS: ' + txt);
        try { Lampa.Noty.show(txt); } catch (e) {}
    }

    /* ── канал 1: резолв parsemagnet, печать всего объекта ───── */

    function resolveLink(link) {
        log('resolve → ' + link.slice(0, 70));
        nativeReq(link, 'text', false,
            guard('res-ok', function (resp) {
                var str = typeof resp === 'string' ? resp : JSON.stringify(resp);
                log('res OK[' + (str ? str.length : 0) + ']: ' + (str || '').slice(0, 90));
                var h = extractHash(str);
                if (h) solve(h, 'body'); else log('в теле btih нет');
            }),
            guard('res-err', function (jq, ex) {
                var full;
                try { full = JSON.stringify(jq); } catch (e) { full = String(jq); }
                log('res ERR ex=' + ex + ' full=' + (full || '').slice(0, 200));
                var h = extractHash(full);
                if (h) solve(h, 'err-obj'); else log('в объекте 302 btih нет');
            }));
    }

    /* ── канал 2: локальный TorrServer ───────────────────────── */

    var ts_listed = false;

    function probeTS(movieTitle) {
        TS_BASES.forEach(function (base) {
            nativeReq(base + '/echo', 'text', false,
                guard('ts-echo', function (resp) {
                    log('TS FOUND ' + base + ' /echo: ' + String(resp).slice(0, 30));
                    if (ts_listed) return;
                    ts_listed = true;
                    head('TorrServer найден (' + base.replace('http://', '') + ')\nчитаю список торрентов…');
                    listTS(base, movieTitle, 0);
                }),
                function () { /* нет сервера на этом порту — тихо */ });
        });
    }

    function listTS(base, movieTitle, attempt) {
        log('TS list try#' + attempt + ' @' + base);
        head('TorrServer (' + base.replace('http://', '') + ')\nчитаю список, попытка ' + (attempt + 1) + '…');
        nativeReq(base + '/torrents', 'json', JSON.stringify({ action: 'list' }),
            guard('ts-list', function (arr) {
                log('TS resp type=' + (Array.isArray(arr) ? 'array[' + arr.length + ']' : typeof arr));
                if (arr && !Array.isArray(arr)) {
                    if (Array.isArray(arr.torrents)) arr = arr.torrents;
                    else log('TS resp raw: ' + JSON.stringify(arr).slice(0, 140));
                }
                if (!arr || !arr.length) {
                    if (attempt < 6) return setTimeout(function () { listTS(base, movieTitle, attempt + 1); }, 1500);
                    head('TorrServer вернул пустой список');
                    return log('TS list пуст (' + base + ')');
                }
                log('TS list n=' + arr.length + ' @' + base);
                arr.slice(0, 10).forEach(function (t) {
                    log('  • ' + String(t.title || t.name || '').slice(0, 40) + ' | ' + (t.hash || ''));
                });
                var match = null;
                if (movieTitle) {
                    var mt = movieTitle.toLowerCase();
                    match = arr.find(function (t) {
                        return (t.title || t.name || '').toLowerCase().indexOf(mt) >= 0;
                    });
                }
                if (!match) match = arr[arr.length - 1]; // самый свежий обычно последний
                if (match && match.hash) {
                    head('btih найден в TorrServer:\n' + String(match.title || '').slice(0, 40) + '\n' + match.hash);
                    solve(match.hash, 'TS:' + base.replace('http://', ''));
                } else {
                    head('в списке TorrServer нет hash');
                }
            }),
            function (jq, ex) {
                var info = (ex || '') + ' status=' + (jq && jq.status);
                log('TS list ERR#' + attempt + ' ' + base + ' ' + info);
                if (attempt < 4) setTimeout(function () { listTS(base, movieTitle, attempt + 1); }, 1500);
                else head('TorrServer /torrents ошибка:\n' + info);
            });
    }

    /* ── вход ────────────────────────────────────────────────── */

    var handled = false;

    function onEnter(el) {
        if (handled) return;
        handled = true;
        if (!el) { log('onenter: пусто'); return; }

        log('──── onenter ────');
        log('MagnetUri: ' + (el.MagnetUri || '(нет)'));
        log('Link: ' + (el.Link || '(нет)'));

        var movieTitle = '';
        try { movieTitle = (Lampa.Activity.active().movie || {}).title || ''; } catch (e) {}
        log('movie.title = ' + (movieTitle || '(нет)'));

        var direct = extractHash(el.MagnetUri) || extractHash(el.Link);
        if (direct) { head('C: btih из ссылки\nстучусь на сервер…'); solve(direct, 'link'); }
        else head('btih в ссылке нет → резолв + локальный TorrServer');

        // канал 1
        var link = el.Link || el.link || el.url || el.MagnetUri;
        if (!direct && link) resolveLink(link);

        // канал 2
        if (!direct) probeTS(movieTitle);
    }

    /* ── init ────────────────────────────────────────────────── */

    run('init', function () {
        document.body.appendChild(bot);
        document.body.appendChild(top);
        head('загружен, выбери торрент');
        log(VERSION + ' loaded');
        log('AndroidJS=' + (typeof AndroidJS) + ' httpReq=' + (typeof AndroidJS !== 'undefined' ? typeof AndroidJS.httpReq : '-'));

        if (!(window.Lampa && Lampa.Listener)) { log('Lampa.Listener нет'); return; }

        Lampa.Listener.follow('torrent', guard('ev', function (data) {
            if (data.type === 'onenter') onEnter(data.element);
        }));

        log('жду onenter');
    });

    window.MIDBG = {
        log: log,
        reset: function () { handled = false; solved = false; ts_listed = false; head('сброс, выбери торрент'); },
        ts: function () { probeTS(''); },
        test: function (h) { solved = false; queryServer(h); }
    };

})();
