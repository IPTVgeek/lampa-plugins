(function () {
    'use strict';

    /* ───────────────────────────────────────────────────────────
       MEDIAINFO DEBUG v0.2 — диагностика получения torrent hash
       Виден на экране. Только для личного использования.

       Главное отличие: весь код в локальных try/catch → реальный
       текст ошибки виден (cross-origin маскировка обходится).
       Глобальный «Script error.» сворачивается в счётчик.
       ─────────────────────────────────────────────────────────── */

    var VERSION   = 'v0.2';
    var MAX_LINES = 70;

    /* ── overlay (#mi-log, снизу экрана) ─────────────────────── */

    var box = document.createElement('div');
    box.id = 'mi-log';
    box.style.cssText = [
        'position:fixed', 'left:0', 'right:0', 'bottom:0',
        'max-height:48%', 'z-index:2147483647',
        'background:rgba(0,0,0,.82)', 'color:#7CFC00',
        'font-family:monospace', 'font-size:16px', 'line-height:1.3',
        'padding:.5em .7em', 'border-top:2px solid #7CFC00',
        'overflow:hidden', 'white-space:pre-wrap', 'word-break:break-all',
        'pointer-events:none'
    ].join(';');

    var lines = [];

    function paint() { try { box.textContent = lines.join('\n'); } catch (e) {} }

    function log(msg) {
        var t = new Date().toLocaleTimeString();
        lines.push(t + '  ' + msg);
        if (lines.length > MAX_LINES) lines = lines.slice(-MAX_LINES);
        paint();
        try { console.log('[MIDBG]', msg); } catch (e) {}
    }

    function dump(label, obj) {
        var s;
        try { s = JSON.stringify(obj); } catch (e) { s = String(obj); }
        if (s && s.length > 700) s = s.slice(0, 700) + '…';
        log(label + ': ' + s);
    }

    /* ── ключевое: локальный guard вместо global onerror ─────── */

    function guard(label, fn) {
        return function () {
            try { return fn.apply(this, arguments); }
            catch (e) {
                log('✗ ' + label + ': ' + (e && e.message ? e.message : e));
                if (e && e.stack) log('  stack: ' + String(e.stack).split('\n').slice(0, 3).join(' | '));
            }
        };
    }

    function run(label, fn) { return guard(label, fn)(); }

    /* ── глобальный onerror — только счётчик (детали скрыты) ──── */

    var masked = 0;
    window.addEventListener('error', function (e) {
        // cross-origin → message == "Script error.", без файла/строки
        if (!e.filename && (!e.message || /script error/i.test(e.message))) {
            masked++;
            // не спамим: обновляем одну строку через метку
            log('(cross-origin onerror #' + masked + ' — детали скрыты браузером)');
        } else {
            log('!! onerror: ' + (e.message || '') + ' @' + (e.filename || '') + ':' + (e.lineno || ''));
        }
    });
    window.addEventListener('unhandledrejection', function (e) {
        log('!! reject: ' + ((e.reason && e.reason.message) || e.reason || ''));
    });

    /* ── окружение ───────────────────────────────────────────── */

    function envInfo() {
        function s(fn) { try { var v = fn(); return (v === '' || v == null) ? '(пусто)' : v; } catch (e) { return 'ERR:' + e.message; } }
        log('platform.android: '       + s(function () { return Lampa.Platform.is('android'); }));
        log('internal_torrclient: '    + s(function () { return Lampa.Storage.field('internal_torrclient'); }));
        log('Torserver exists: '       + s(function () { return !!Lampa.Torserver; }));
        log('Torserver.url(): '        + s(function () { return Lampa.Torserver.url(); }));
        log('storage torrserver_url: ' + s(function () { return Lampa.Storage.get('torrserver_url'); }));
        log('storage url_two: '        + s(function () { return Lampa.Storage.get('torrserver_url_two'); }));
        log('UA: ' + navigator.userAgent);
        log('--- жду torrent / torrent_file ---');
    }

    /* ── разбор element ──────────────────────────────────────── */

    function btihFromMagnet(link) {
        if (!link) return null;
        var m = String(link).match(/btih:([a-zA-Z0-9]+)/i);
        return m ? m[1] : null;
    }

    var hash_tried = false;

    function inspect(tag, el) {
        if (!el) { log(tag + ': element пустой'); return; }

        log('──────── ' + tag + ' ────────');
        log('keys: ' + Object.keys(el).join(','));
        log('title: '   + (el.title || el.Title || '?'));
        log('Tracker: ' + (el.Tracker || el.tracker || '?'));
        log('hash(id): ' + el.hash);
        log('MagnetUri: ' + (el.MagnetUri || '(нет)'));
        log('Link: '      + (el.Link || '(нет)'));

        var direct = btihFromMagnet(el.MagnetUri) || btihFromMagnet(el.Link);
        if (direct) log('>> C: btih регуляркой = ' + direct);
        else log('>> C: из ссылки не вытащить (нужен резолв)');

        tryTorserverHash(el);
    }

    function tryTorserverHash(el) {
        if (hash_tried) return;
        var url;
        try { url = Lampa.Torserver.url(); } catch (e) { log('>> A: url() THROW ' + e.message); return; }
        if (!url) { log('>> A: пропуск — Torserver.url() пустой'); return; }

        hash_tried = true;
        log('>> A: Lampa.Torserver.hash() → ' + url);

        run('A:hash-call', function () {
            Lampa.Torserver.hash({
                title: el.title || el.Title || 'debug',
                link: el.MagnetUri || el.Link,
                poster: el.poster || '',
                data: {}
            },
            guard('A:hash-ok', function (json) {
                dump('>> A OK', json);
                if (json && json.hash) log('>> A: ХЭШ = ' + json.hash);
            }),
            guard('A:hash-fail', function (err) {
                log('>> A FAIL: ' + (typeof err === 'string' ? err : JSON.stringify(err)));
            }));
        });
    }

    /* ── подписки ────────────────────────────────────────────── */

    run('init', function () {
        if (!(window.Lampa && Lampa.Listener)) { log('Lampa.Listener не готов'); return; }

        Lampa.Listener.follow('torrent', guard('ev:torrent', function (data) {
            log('event torrent / ' + data.type);
            if (data.type === 'onenter') inspect('torrent:onenter', data.element);
        }));

        Lampa.Listener.follow('torrent_file', guard('ev:torrent_file', function (data) {
            log('event torrent_file / ' + data.type + ' (редкость на TV)');
            if (data.element) dump('tf el', {
                torrent_hash: data.element.torrent_hash,
                id: data.element.id,
                title: data.element.title,
                ffprobe_len: data.element.ffprobe && data.element.ffprobe.length
            });
        }));

        log('подписки установлены');
    });

    /* ── attach + старт ──────────────────────────────────────── */

    (function attach() {
        if (document.body) {
            document.body.appendChild(box);
            log(VERSION + ' loaded');
            run('envInfo', envInfo);
        } else setTimeout(attach, 200);
    })();

    window.MIDBG = { log: log, env: function () { run('env', envInfo); }, clear: function () { lines = []; paint(); } };

})();
