(function () {
    'use strict';

    var VERSION = '1.7';

    /* ── log ─────────────────────────────────────────────────── */

    var logEl    = null;
    var logLines = [];
    var MAX_LOG  = 12;

    function initLog() {
        if (logEl) return;
        logEl = document.createElement('div');
        logEl.id = 'mi-log';
        document.body.appendChild(logEl);
    }

    function miLog(msg) {
        console.log('[MediaInfo] ' + msg);
        try {
            if (!logEl) initLog();
            var ts = new Date().toTimeString().slice(0, 8);
            logLines.push(ts + ' ' + msg);
            if (logLines.length > MAX_LOG) logLines.shift();
            logEl.innerHTML = logLines.map(function (l) {
                return '<div>' + l.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>';
            }).join('');
        } catch (e) {}
    }

    miLog('v' + VERSION + ' loaded');
    try { Lampa.Noty.show('MediaInfo v' + VERSION); } catch (e) {}

    /* ── helper: вытащить hash из объекта ────────────────── */

    function findHash(obj) {
        if (!obj || typeof obj !== 'object') return null;
        var keys = ['hash', 'torrent_hash', 'info_hash', 'magnet'];
        for (var i = 0; i < keys.length; i++) {
            if (obj[keys[i]]) return keys[i] + '=' + String(obj[keys[i]]).slice(0, 12);
        }
        for (var k in obj) {
            if (obj.hasOwnProperty(k) && obj[k] && typeof obj[k] === 'object') {
                for (var i2 = 0; i2 < keys.length; i2++) {
                    if (obj[k][keys[i2]]) return k + '.' + keys[i2] + '=' + String(obj[k][keys[i2]]).slice(0, 12);
                }
            }
        }
        return null;
    }

    /* ── monkey-patch ───────────────────────────────────────────── */

    if (Lampa.Listener && typeof Lampa.Listener.send === 'function') {
        var _orig = Lampa.Listener.send.bind(Lampa.Listener);
        Lampa.Listener.send = function (name, data) {
            if (name === 'torrent' || name === 'state:changed') {
                var type  = data && data.type ? data.type : '?';
                var hash  = findHash(data) || findHash(data && data.data) || 'no-hash';
                var keys  = data ? Object.keys(data).join(',') : '';
                miLog('L:' + name + ' t=' + type + ' ' + hash);
                miLog('  keys=[' + keys + ']');
                if (data && data.data && typeof data.data === 'object') {
                    var dk = Object.keys(data.data).join(',');
                    miLog('  data.keys=[' + dk + ']');
                }
            } else if (name !== 'line') {
                miLog('L:' + name);
            }
            return _orig(name, data);
        };
        miLog('patched');
    }

    /* ── styles ──────────────────────────────────────────────── */

    var style = document.createElement('style');
    style.textContent =
        '#mi-log{position:fixed;bottom:0;left:0;right:0;z-index:99999;' +
            'background:rgba(0,0,0,.9);color:#0f0;' +
            'font-family:monospace;font-size:11px;line-height:1.45;' +
            'padding:5px 12px;pointer-events:none;}';
    document.head.appendChild(style);

})();
