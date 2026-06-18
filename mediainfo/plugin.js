(function () {
    'use strict';

    var VERSION = '1.10';

    /* ── log ─────────────────────────────────────────────────── */
    var logEl = null, logLines = [], MAX_LOG = 14;
    function initLog() { if(logEl)return; logEl=document.createElement('div'); logEl.id='mi-log'; document.body.appendChild(logEl); }
    function miLog(msg) {
        console.log('[MediaInfo] '+msg);
        try {
            if(!logEl)initLog();
            var ts=new Date().toTimeString().slice(0,8);
            logLines.push(ts+' '+msg);
            if(logLines.length>MAX_LOG)logLines.shift();
            logEl.innerHTML=logLines.map(function(l){return '<div>'+l.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</div>';}).join('');
        }catch(e){}
    }

    miLog('v'+VERSION+' loaded');
    try{Lampa.Noty.show('MediaInfo v'+VERSION);}catch(e){}

    /* ── dump ffprobe structure ─────────────────────────────────── */
    function dumpFfprobe(fp) {
        if (!fp) { miLog('ffprobe=null'); return; }
        var t = typeof fp;
        miLog('ffprobe type=' + t);
        if (Array.isArray(fp)) {
            miLog('ffprobe isArray len=' + fp.length);
            if (fp[0]) miLog('ffprobe[0] keys=' + Object.keys(fp[0]).join(','));
        } else if (t === 'object') {
            var keys = Object.keys(fp);
            miLog('ffprobe keys=[' + keys.join(',') + ']');
            keys.slice(0, 5).forEach(function(k) {
                var v = fp[k];
                if (Array.isArray(v)) {
                    miLog('  fp[' + k + ']=Array(' + v.length + ')');
                    if (v[0]) miLog('    [0].keys=' + Object.keys(v[0]).slice(0,6).join(','));
                } else if (v && typeof v === 'object') {
                    miLog('  fp[' + k + ']=obj keys=' + Object.keys(v).slice(0,6).join(','));
                } else {
                    miLog('  fp[' + k + ']=' + String(v).slice(0,30));
                }
            });
        } else {
            miLog('ffprobe val=' + String(fp).slice(0, 40));
        }
    }

    /* ── hook ─────────────────────────────────────────────────── */
    Lampa.Listener.follow('torrent', function(data) {
        if (data.type !== 'onenter') return;
        var el = data.element;
        if (!el) return;
        miLog('onenter');
        dumpFfprobe(el.ffprobe);
    });

    /* ── styles ──────────────────────────────────────────────── */
    var style=document.createElement('style');
    style.textContent='#mi-log{position:fixed;bottom:0;left:0;right:0;z-index:99999;background:rgba(0,0,0,.9);color:#0f0;font-family:monospace;font-size:11px;line-height:1.4;padding:5px 12px;pointer-events:none;}';
    document.head.appendChild(style);
})();
