(function () {
    'use strict';

    /* ───────────────────────────────────────────────────────────
       MEDIAINFO DEBUG v0.3 — боевая проверка end-to-end на Android TV
       Канал: Lampa.Reguest().native() → AndroidJS.httpReq
       (нативный HTTP: мимо opaqueredirect / mixed-content / CORS)
       Глобальные объекты НЕ патчатся → «Script error.» невозможен.
       ─────────────────────────────────────────────────────────── */

    var VERSION = 'v0.3';
    var HOST    = '185.204.0.61:8080';

    /* ── overlays ────────────────────────────────────────────── */

    var top = mk('mi-top', 'top:0', '20px', '#FFD400');
    var bot = mk('mi-log', 'bottom:0', '15px', '#7CFC00');

    function mk(id, edge, fs, color) {
        var d = document.createElement('div');
        d.id = id;
        d.style.cssText = [
            'position:fixed', 'left:0', 'right:0', edge,
            'max-height:42%', 'z-index:2147483647',
            'background:rgba(0,0,0,.85)', 'color:' + color,
            'font-family:monospace', 'font-size:' + fs, 'line-height:1.3',
            'padding:.4em .7em', 'overflow:hidden',
            'white-space:pre-wrap', 'word-break:break-all', 'pointer-events:none'
        ].join(';');
        return d;
    }

    var blines = [];
    function paintBot() { try { bot.textContent = blines.join('\n'); } catch (e) {} }
    function log(m) {
        var t = new Date().toTimeString().slice(0, 8);
        blines.push(t + ' ' + m);
        if (blines.length > 60) blines = blines.slice(-60);
        paintBot();
        try { console.log('[MIDBG]', m); } catch (e) {}
    }
    function head(m) { try { top.textContent = 'MEDIAINFO ' + VERSION + '\n' + m; } catch (e) {} }

    function guard(label, fn) {
        return function () {
            try { return fn.apply(this, arguments); }
            catch (e) {
                log('✗ ' + label + ': ' + (e && e.message ? e.message : e));
                if (e && e.stack) log('  ' + String(e.stack).split('\n').slice(0, 2).join(' | '));
            }
        };
    }
    function run(label, fn) { return guard(label, fn)(); }

    /* фоновые cross-origin ошибки — только счётчик */
    var masked = 0;
    window.addEventListener('error', function (e) {
        if (!e.filename && (!e.message || /script error/i.test(e.message))) { masked++; }
        else log('!! onerror: ' + (e.message || '') + ' @' + (e.filename || '') + ':' + (e.lineno || ''));
    });

    /* ── helpers ─────────────────────────────────────────────── */

    function extractHash(s) {
        if (!s) return null;
        s = String(s);
        var m = s.match(/urn:btih:([a-fA-F0-9]{40})/i); if (m) return m[1].toLowerCase();
        var b = s.match(/urn:btih:([A-Za-z2-7]{32})/);   if (b) return b[1];
        var h = s.match(/[?&](?:hash|link)=([a-fA-F0-9]{40})/i); if (h) return h[1].toLowerCase();
        return null;
    }

    function net() { return new Lampa.Reguest(); }

    /* нативный GET (Android) с фолбэком на обычный (браузер) */
    function nativeGet(url, dataType, ok, err) {
        var n = net();
        n.timeout(15000);
        n.native(url, ok, err, false, { dataType: dataType || 'text' });
    }

    /* ── сервер треков ───────────────────────────────────────── */

    function queryServer(hash) {
        var url = 'http://' + HOST + '/api?hash=' + hash + '&index=0';
        log('query → ' + url);
        nativeGet(url, 'json',
            guard('srv-ok', function (json) {
                var s = json && json.streams;
                log('server streams = ' + (s ? s.length : 0));
                if (s && s.length) showTracks(s);
                else head('btih=' + hash.slice(0, 12) + '…\nсервер ответил, но streams пуст');
            }),
            guard('srv-err', function (jq, ex) {
                log('server ERR: ' + (ex || '') + ' status=' + (jq && jq.status));
                head('btih=' + hash.slice(0, 12) + '…\nсервер НЕ ответил (' + (ex || (jq && jq.status)) + ')');
            })
        );
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
            var l = s.tags && s.tags.language ? s.tags.language.toUpperCase() : (s.codec_name || 'SUB');
            parts.push('T ' + l);
        });
        var txt = parts.length ? parts.join('   ') : 'дорожек нет';
        head('✓ РАБОТАЕТ\n' + txt);
        log('TRACKS: ' + txt);
        try { Lampa.Noty.show(txt); } catch (e) {}
    }

    /* ── резолв parsemagnet нативно ──────────────────────────── */

    function resolveLink(link) {
        log('native resolve → ' + link.slice(0, 60));
        nativeGet(link, 'text',
            guard('resolve-ok', function (resp) {
                var str = typeof resp === 'string' ? resp : JSON.stringify(resp);
                log('resolve resp[' + (str ? str.length : 0) + ']: ' + (str || '').slice(0, 80));
                var h = extractHash(str);
                if (h) { log('btih из ответа = ' + h); queryServer(h); }
                else { head('резолв не дал btih\nответ: ' + (str || '').slice(0, 60)); }
            }),
            guard('resolve-err', function (jq, ex) {
                log('resolve ERR: ' + (ex || '') + ' status=' + (jq && jq.status));
                head('native resolve упал: ' + (ex || (jq && jq.status)));
            })
        );
    }

    /* ── главный вход ────────────────────────────────────────── */

    var handled = false;

    function onEnter(el) {
        if (handled) return;
        if (!el) { log('onenter: element пуст'); return; }
        handled = true;

        log('──── onenter ────');
        log('keys: ' + Object.keys(el).join(','));
        log('MagnetUri: ' + (el.MagnetUri || '(нет)'));
        log('Link: ' + (el.Link || el.link || el.url || '(нет)'));

        var direct = extractHash(el.MagnetUri) || extractHash(el.Link);
        var link   = el.Link || el.link || el.url || el.MagnetUri || '';

        if (direct) {
            head('C: btih из ссылки = ' + direct.slice(0, 16) + '…\nстучусь на сервер треков…');
            log('>> C ok btih=' + direct);
            queryServer(direct);
        } else if (link) {
            head('btih в ссылке нет → пробую native resolve');
            log('>> C нет, резолвлю Link нативно');
            resolveLink(link);
        } else {
            head('нет ни MagnetUri, ни Link — тупик');
            log('нет ссылки вообще');
        }
    }

    /* ── окружение + подписки ────────────────────────────────── */

    function envInfo() {
        function s(fn) { try { var v = fn(); return (v === '' || v == null) ? '(пусто)' : v; } catch (e) { return 'ERR'; } }
        log('android=' + s(function () { return Lampa.Platform.is('android'); }) +
            ' internal_torrclient=' + s(function () { return Lampa.Storage.field('internal_torrclient'); }));
        log('Torserver.url()=' + s(function () { return Lampa.Torserver.url(); }));
        log('AndroidJS=' + (typeof AndroidJS) + (typeof AndroidJS !== 'undefined' ? ' httpReq=' + (typeof AndroidJS.httpReq) : ''));
    }

    run('init', function () {
        document.body.appendChild(bot);
        document.body.appendChild(top);
        head('загружен, выбери торрент');
        log(VERSION + ' loaded');
        envInfo();

        if (!(window.Lampa && Lampa.Listener)) { log('Lampa.Listener нет'); return; }

        Lampa.Listener.follow('torrent', guard('ev:torrent', function (data) {
            if (data.type === 'onenter') onEnter(data.element);
        }));

        Lampa.Listener.follow('torrent_file', guard('ev:tf', function (data) {
            if (data.type === 'render' && data.element && data.element.torrent_hash) {
                log('torrent_file render hash=' + String(data.element.torrent_hash).slice(0, 12));
                if (!handled) { handled = true; queryServer(data.element.torrent_hash); }
            }
        }));

        log('подписки установлены, жду onenter');
    });

    window.MIDBG = {
        log: log,
        reset: function () { handled = false; head('сброшено, выбери торрент'); },
        test: function (h) { handled = true; queryServer(h); }
    };

})();
