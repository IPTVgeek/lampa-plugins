(function () {
    'use strict';

    var VERSION = '1.6';

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
    miLog('proto=' + location.protocol + ' fetch=' + typeof fetch + ' ws=' + typeof WebSocket);
    try { Lampa.Noty.show('MediaInfo v' + VERSION); } catch (e) {}

    /* ── monkey-patch: перехватываем ВСЕ события Lampa ────────── */

    if (Lampa.Listener && typeof Lampa.Listener.send === 'function') {
        var _origSend = Lampa.Listener.send.bind(Lampa.Listener);
        Lampa.Listener.send = function (name, data) {
            miLog('L:' + name);
            return _origSend(name, data);
        };
        miLog('Listener patched');
    } else {
        miLog('Listener.send N/A');
    }

    try {
        if (Lampa.Player && Lampa.Player.listener && typeof Lampa.Player.listener.send === 'function') {
            var _origPSend = Lampa.Player.listener.send.bind(Lampa.Player.listener);
            Lampa.Player.listener.send = function (name, data) {
                miLog('P:' + name);
                return _origPSend(name, data);
            };
            miLog('Player.listener patched');
        } else {
            miLog('Player.listener N/A');
        }
    } catch (e) { miLog('Player patch err:' + e.message); }

    /* ── styles ──────────────────────────────────────────────── */

    var style = document.createElement('style');
    style.textContent =
        '#mi-log{position:fixed;bottom:0;left:0;right:0;z-index:99999;' +
            'background:rgba(0,0,0,.88);color:#0f0;' +
            'font-family:monospace;font-size:12px;line-height:1.5;' +
            'padding:5px 12px;pointer-events:none;}';
    document.head.appendChild(style);

})();
