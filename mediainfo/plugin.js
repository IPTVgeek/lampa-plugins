(function () {
    'use strict';
    var VERSION = '1.13';

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

    Lampa.Listener.follow('torrent', function(data) {
        if (data.type !== 'onenter') return;
        var el = data.element;
        if (!el) return;

        var link = el.Link || el.link || el.url || '';
        if (!link) { miLog('no Link'); return; }

        miLog('fetching Link...');
        miLog(link.slice(0, 70));

        fetch(link)
            .then(function(r) {
                miLog('fetch status=' + r.status);
                return r.text();
            })
            .then(function(text) {
                miLog('response len=' + text.length);
                miLog('resp(1)=' + text.slice(0, 70));
                if (text.length > 70) miLog('resp(2)=' + text.slice(70, 140));

                var m = text.match(/urn:btih:([a-fA-F0-9]{40})/i);
                if (m) {
                    miLog('HASH=' + m[1]);
                } else {
                    var m2 = text.match(/urn:btih:([A-Z2-7]{32})/i);
                    if (m2) miLog('HASH(b32)=' + m2[1]);
                    else miLog('no hash found in response');
                }
            })
            .catch(function(e) {
                miLog('fetch err=' + (e.message || e));
            });
    });

    var style=document.createElement('style');
    style.textContent='#mi-log{position:fixed;bottom:0;left:0;right:0;z-index:99999;background:rgba(0,0,0,.92);color:#0f0;font-family:monospace;font-size:10px;line-height:1.35;padding:4px 10px;pointer-events:none;}';
    document.head.appendChild(style);
})();
