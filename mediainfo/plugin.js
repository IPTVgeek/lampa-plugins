(function () {
    'use strict';

    var VERSION = '1.8';

    /* ── log ─────────────────────────────────────────────────── */

    var logEl    = null;
    var logLines = [];
    var MAX_LOG  = 14;

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

    /* ── monkey-patch ───────────────────────────────────────────── */

    if (Lampa.Listener && typeof Lampa.Listener.send === 'function') {
        var _orig = Lampa.Listener.send.bind(Lampa.Listener);
        Lampa.Listener.send = function (name, data) {
            if (name === 'torrent' && data && data.type === 'onenter') {
                miLog('>>> torrent onenter <<<');
                var el = data.element;
                if (el) {
                    Object.keys(el).forEach(function (k) {
                        var v = el[k];
                        if (v === null || v === undefined) return;
                        var s = (typeof v === 'object') ? '[obj]' : String(v).slice(0, 40);
                        miLog('  el.' + k + '=' + s);
                    });
                } else {
                    miLog('  element=null');
                }
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
            'font-family:monospace;font-size:11px;line-height:1.4;' +
            'padding:5px 12px;pointer-events:none;}';
    document.head.appendChild(style);

})();
