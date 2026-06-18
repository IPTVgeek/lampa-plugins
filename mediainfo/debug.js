(function () {
    'use strict';

    /* ───────────────────────────────────────────────────────────
       MEDIAINFO DEBUG — диагностика получения torrent hash
       Виден на экране. Только для личного использования.
       ─────────────────────────────────────────────────────────── */

    var VERSION   = 'v0.1';
    var MAX_LINES = 60;

    /* ── overlay (#mi-log, снизу экрана) ─────────────────────── */

    var box = document.createElement('div');
    box.id = 'mi-log';
    box.style.cssText = [
        'position:fixed',
        'left:0',
        'right:0',
        'bottom:0',
        'max-height:46%',
        'z-index:2147483647',
        'background:rgba(0,0,0,.82)',
        'color:#7CFC00',
        'font-family:monospace',
        'font-size:16px',
        'line-height:1.3',
        'padding:.5em .7em',
        'border-top:2px solid #7CFC00',
        'overflow:hidden',
        'white-space:pre-wrap',
        'word-break:break-all',
        'pointer-events:none'
    ].join(';');

    var lines = [];

    function paint() {
        box.textContent = lines.join('\n');
    }

    function log(msg, color) {
        var t = new Date().toLocaleTimeString();
        var line = (color ? '' : '') + t + '  ' + msg;
        lines.push(line);
        if (lines.length > MAX_LINES) lines = lines.slice(-MAX_LINES);
        paint();
        try { console.log('[MIDBG]', msg); } catch (e) {}
    }

    function dump(label, obj) {
        var s;
        try { s = JSON.stringify(obj); } catch (e) { s = String(obj); }
        if (s && s.length > 600) s = s.slice(0, 600) + '…';
        log(label + ': ' + s);
    }

    function attach() {
        if (document.body) {
            document.body.appendChild(box);
            log(VERSION + ' loaded');
            envInfo();
        } else {
            setTimeout(attach, 200);
        }
    }

    /* ── глобальные ошибки (ловим «Script error.») ───────────── */

    window.addEventListener('error', function (e) {
        log('!! window.error: ' + (e.message || '') +
            ' @' + (e.filename || '') + ':' + (e.lineno || ''));
    });
    window.addEventListener('unhandledrejection', function (e) {
        log('!! promise reject: ' + ((e.reason && e.reason.message) || e.reason || ''));
    });

    /* ── окружение ───────────────────────────────────────────── */

    function safe(fn, def) {
        try { return fn(); } catch (e) { return def + ' (err:' + e.message + ')'; }
    }

    function envInfo() {
        log('platform.android: ' + safe(function () { return Lampa.Platform.is('android'); }, '?'));
        log('internal_torrclient: ' + safe(function () { return Lampa.Storage.field('internal_torrclient'); }, '?'));
        log('Torserver.url(): ' + safe(function () { return Lampa.Torserver.url() || '(пусто)'; }, '?'));
        log('storage torrserver_url: ' + safe(function () { return Lampa.Storage.get('torrserver_url') || '(пусто)'; }, '?'));
        log('storage torrserver_url_two: ' + safe(function () { return Lampa.Storage.get('torrserver_url_two') || '(пусто)'; }, '?'));
        log('UA: ' + navigator.userAgent);
        log('--- жду событие torrent / torrent_file ---');
    }

    /* ── разбор element ──────────────────────────────────────── */

    function btihFromMagnet(link) {
        if (!link) return null;
        var m = String(link).match(/btih:([a-zA-Z0-9]+)/i);
        return m ? m[1] : null;
    }

    function inspect(tag, el) {
        if (!el) { log(tag + ': element пустой'); return; }

        log('──────── ' + tag + ' ────────');
        log('keys: ' + Object.keys(el).join(','));
        log('title: ' + (el.title || el.Title || '?'));
        log('Tracker: ' + (el.Tracker || el.tracker || '?'));
        log('hash (lampa id): ' + el.hash);
        log('MagnetUri: ' + (el.MagnetUri || '(нет)'));
        log('Link: ' + (el.Link || '(нет)'));

        var direct = btihFromMagnet(el.MagnetUri) || btihFromMagnet(el.Link);
        if (direct) log('>> C: btih из ссылки регуляркой = ' + direct);
        else log('>> C: btih из ссылки не вытащить (нужен резолв)');

        // A: пробуем Lampa.Torserver.hash()
        tryTorserverHash(el);
    }

    var hash_tried = false;

    function tryTorserverHash(el) {
        if (hash_tried) return;          // один раз за сессию, чтобы не спамить TorrServer
        var url = safe(function () { return Lampa.Torserver.url(); }, '');
        if (!url || String(url).indexOf('err:') === 0) {
            log('>> A: пропуск — Torserver.url() пустой');
            return;
        }
        hash_tried = true;
        log('>> A: вызываю Lampa.Torserver.hash() …');
        try {
            Lampa.Torserver.hash({
                title: el.title || el.Title || 'debug',
                link: el.MagnetUri || el.Link,
                poster: el.poster || '',
                data: {}
            }, function (json) {
                dump('>> A OK json', json);
                if (json && json.hash) log('>> A: ХЭШ ПОЛУЧЕН = ' + json.hash);
            }, function (err) {
                log('>> A FAIL: ' + (typeof err === 'string' ? err : JSON.stringify(err)));
            });
        } catch (e) {
            log('>> A THROW: ' + e.message);
        }
    }

    /* ── подписки на события ─────────────────────────────────── */

    if (window.Lampa && Lampa.Listener) {

        Lampa.Listener.follow('torrent', function (data) {
            log('event torrent / ' + data.type);
            if (data.type === 'onenter') inspect('torrent:onenter', data.element);
            else if (data.type === 'render' && !hash_tried) {
                // только лог, без вызова hash, чтобы render не спамил
                var el = data.element || {};
                // ничего тяжёлого — ждём onenter
            }
        });

        Lampa.Listener.follow('torrent_file', function (data) {
            log('event torrent_file / ' + data.type + ' (РЕДКОСТЬ на TV!)');
            if (data.element) {
                dump('torrent_file el', {
                    torrent_hash: data.element.torrent_hash,
                    id: data.element.id,
                    title: data.element.title,
                    ffprobe_len: data.element.ffprobe && data.element.ffprobe.length
                });
            }
        });

        log('подписки на torrent / torrent_file установлены');
    } else {
        // Lampa ещё не готова — ждём
        var wait = setInterval(function () {
            if (window.Lampa && Lampa.Listener) {
                clearInterval(wait);
                location.reload && null; // no-op
            }
        }, 300);
    }

    attach();

    /* ручной доступ из консоли при отладке */
    window.MIDBG = { log: log, env: envInfo, clear: function () { lines = []; paint(); } };

})();
