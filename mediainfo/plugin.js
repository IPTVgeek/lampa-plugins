(function () {
    'use strict';
    var VERSION = '1.12';

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
        miLog('=== onenter ===');

        var link = el.Link || el.link || el.url || el.magnet || '';
        miLog('Link(1)=' + link.slice(0, 60));
        if (link.length > 60)  miLog('Link(2)=' + link.slice(60, 120));
        if (link.length > 120) miLog('Link(3)=' + link.slice(120, 180));

        try {
            var ts = Lampa.Storage.get('torrserver_url') || Lampa.Storage.get('torrserver') || '';
            miLog('TorrServer=' + String(ts).slice(0, 60));
        } catch(e) { miLog('TorrServer N/A'); }

        try {
            var server = (Lampa.Torrent && Lampa.Torrent.server) ? Lampa.Torrent.server() : 'N/A';
            miLog('Torrent.server=' + String(server).slice(0, 60));
        } catch(e) { miLog('Torrent.server N/A'); }
    });

    var style=document.createElement('style');
    style.textContent='#mi-log{position:fixed;bottom:0;left:0;right:0;z-index:99999;background:rgba(0,0,0,.92);color:#0f0;font-family:monospace;font-size:10px;line-height:1.35;padding:4px 10px;pointer-events:none;}';
    document.head.appendChild(style);
})();
