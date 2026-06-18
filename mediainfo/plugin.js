(function () {
    'use strict';
    var VERSION = '1.11';

    var logEl=null, logLines=[], MAX_LOG=16;
    function initLog(){if(logEl)return;logEl=document.createElement('div');logEl.id='mi-log';document.body.appendChild(logEl);}
    function miLog(msg){
        console.log('[MediaInfo] '+msg);
        try{
            if(!logEl)initLog();
            var ts=new Date().toTimeString().slice(0,8);
            logLines.push(ts+' '+msg);
            if(logLines.length>MAX_LOG)logLines.shift();
            logEl.innerHTML=logLines.map(function(l){return '<div>'+l.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</div>';}).join('');
        }catch(e){}
    }

    miLog('v'+VERSION+' loaded');
    try{Lampa.Noty.show('MediaInfo v'+VERSION);}catch(e){}

    function dumpObj(prefix, obj, depth) {
        if (!obj || typeof obj !== 'object') return;
        Object.keys(obj).forEach(function(k) {
            var v = obj[k];
            if (v === null || v === undefined) return;
            var path = prefix + '.' + k;
            if (typeof v === 'string') {
                if (v.length > 15) miLog(path + '=' + v.slice(0, 50));
            } else if (typeof v === 'number') {
                // skip numbers
            } else if (Array.isArray(v)) {
                miLog(path + '=Array(' + v.length + ')');
            } else if (typeof v === 'object' && depth > 0) {
                miLog(path + '=obj{' + Object.keys(v).join(',') + '}');
                dumpObj(path, v, depth - 1);
            }
        });
    }

    Lampa.Listener.follow('torrent', function(data) {
        if (data.type !== 'onenter') return;
        var el = data.element;
        if (!el) return;
        miLog('=== onenter dump ===');
        dumpObj('el', el, 2);
    });

    var style=document.createElement('style');
    style.textContent='#mi-log{position:fixed;bottom:0;left:0;right:0;z-index:99999;background:rgba(0,0,0,.92);color:#0f0;font-family:monospace;font-size:10px;line-height:1.35;padding:4px 10px;pointer-events:none;}';
    document.head.appendChild(style);
})();
