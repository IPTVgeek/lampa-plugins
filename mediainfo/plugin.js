(function () {
    'use strict';
    var VERSION = '1.14';
    var HOST = '185.204.0.61:8080';
    var cache = {};

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

    function extractHash(s) {
        if (!s) return null;
        var m = s.match(/urn:btih:([a-fA-F0-9]{40})/i);
        if (m) return m[1].toLowerCase();
        var m2 = s.match(/urn:btih:([A-Za-z2-7]{32})/);
        if (m2) return m2[1];
        var m3 = s.match(/[?&]hash=([a-fA-F0-9]{40})/i);
        if (m3) return m3[1].toLowerCase();
        return null;
    }

    function getHashFromLink(link, callback) {
        miLog('fetch manual: ' + link.slice(0,50));
        fetch(link, { redirect: 'manual' })
            .then(function(r) {
                miLog('r.type=' + r.type + ' status=' + r.status);
                miLog('r.url=' + r.url.slice(0,60));
                var loc = null;
                try { loc = r.headers.get('location'); } catch(e){}
                miLog('Location=' + (loc ? loc.slice(0,60) : 'null'));
                var hash = extractHash(loc) || extractHash(r.url);
                if (hash) { callback(hash); return; }
                return r.text().then(function(t) {
                    miLog('body=' + t.slice(0,60));
                    var h = extractHash(t);
                    miLog('hash=' + (h || 'none'));
                    callback(h);
                });
            })
            .catch(function(e) {
                miLog('fetch err=' + (e.message||'?'));
                callback(null);
            });
    }

    function showNoty(streams) {
        try {
            var audio = streams.filter(function(s){return s.codec_type==='audio';});
            var subs  = streams.filter(function(s){return s.codec_type==='subtitle';});
            var parts = [];
            audio.forEach(function(a){
                var p = [];
                if(a.tags&&a.tags.language) p.push(a.tags.language.toUpperCase());
                if(a.codec_name) p.push(a.codec_name.toUpperCase());
                if(a.channel_layout) p.push(a.channel_layout.replace('stereo','2.0').replace('mono','1.0').replace('5.1(side)','5.1').replace(/\s*\(side\)\s*/,'').trim());
                if(p.length) parts.push('♪ '+p.join(' '));
            });
            subs.forEach(function(s){
                var lang=s.tags&&s.tags.language?s.tags.language.toUpperCase():'';
                if(lang) parts.push('T '+lang);
            });
            if(parts.length){
                miLog('Noty: '+parts.join('|'));
                Lampa.Noty.show(parts.join('  ·  '));
            } else { miLog('Noty: no tracks'); }
        } catch(e){ miLog('Noty err:'+e.message); }
    }

    function queryServer(hash, callback) {
        var key = hash+'_0';
        if(cache[key]){ callback(cache[key]); return; }
        miLog('query hash='+hash.slice(0,10));
        var done=false;
        var timer=setTimeout(function(){if(!done){done=true;callback(null);}},10000);
        function finish(r){ if(done)return; done=true; clearTimeout(timer); cache[key]=r; callback(r); }

        fetch('http://'+HOST+'/api?hash='+hash+'&index=0')
            .then(function(r){return r.json();})
            .then(function(j){
                var s=j&&j.streams;
                miLog('HTTP n='+(s?s.length:0));
                if(s&&s.length) finish({streams:s});
            })
            .catch(function(e){miLog('HTTP err:'+e.message);});

        try {
            var ws=new WebSocket('ws://'+HOST+'/?'+hash+'&index=0');
            var wt=setTimeout(function(){ws.close();},8000);
            ws.onopen=function(){miLog('WS open');};
            ws.onmessage=function(e){
                clearTimeout(wt);ws.close();
                try{var j=JSON.parse(e.data);var s=j&&j.streams;miLog('WS n='+(s?s.length:0));if(s&&s.length)finish({streams:s});}
                catch(ex){miLog('WS parse err');}
            };
            ws.onerror=function(){miLog('WS error');clearTimeout(wt);};
            ws.onclose=function(){clearTimeout(wt);};
        }catch(e){miLog('WS exc:'+e.message);}
    }

    Lampa.Listener.follow('torrent', function(data) {
        if (data.type !== 'onenter') return;
        var el = data.element;
        if (!el) return;
        miLog('onenter');
        var link = el.Link || el.link || el.url || '';
        if (!link) { miLog('no Link'); return; }
        getHashFromLink(link, function(hash) {
            if (!hash) { miLog('no hash'); return; }
            miLog('got hash='+hash.slice(0,12));
            queryServer(hash, function(result) {
                if (result && result.streams) showNoty(result.streams);
            });
        });
    });

    Lampa.Listener.follow('state:changed', function(data) {
        var target = data && data.target ? String(data.target).slice(0,80) : 'none';
        miLog('state:changed target='+target);
        var hash = extractHash(data && data.target);
        if (hash) {
            miLog('state hash='+hash.slice(0,12));
            queryServer(hash, function(result) {
                if (result && result.streams) showNoty(result.streams);
            });
        }
    });

    Lampa.Listener.follow('torrent_file', function(data) {
        if (data.type !== 'render') return;
        var el = data.element;
        if (!el) return;
        var hash = el.torrent_hash || el.hash || el.info_hash;
        var index = el.id !== undefined ? el.id : (el.file_index !== undefined ? el.file_index : 0);
        if (!hash) return;
        var streams = (el.ffprobe && Array.isArray(el.ffprobe) && el.ffprobe.length) ? el.ffprobe :
                      (el.ffprobe && el.ffprobe.streams) ? el.ffprobe.streams : null;
        var item = data.item;
        item.append('<div class="mi-block mi-loading">···</div>');
        function render(s) {
            item.find('.mi-block').remove();
            if (!s || !s.length) return;
            var lines = buildLines(s);
            if (!lines.length) return;
            var h = '<div class="mi-block">';
            lines.forEach(function(l){h+='<div class="mi-line mi-'+l.type+'">'+ esc(l.text) +'</div>';});
            item.append(h+'</div>');
            showNoty(s);
        }
        if (streams && streams.length) { render(streams); return; }
        queryServer(hash, function(result){ render(result && result.streams); });
    });

    function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

    function buildLines(streams){
        var video=streams.filter(function(s){return s.codec_type==='video';});
        var audio=streams.filter(function(s){return s.codec_type==='audio';});
        var subs=streams.filter(function(s){return s.codec_type==='subtitle';});
        var lines=[];
        video.slice(0,1).forEach(function(v){var p=[];if(v.width&&v.height)p.push(v.width+'×'+v.height);if(v.codec_name)p.push(v.codec_name.toUpperCase());if(p.length)lines.push({type:'video',text:p.join(' · ')});});
        audio.forEach(function(a){var p=[];if(a.tags&&a.tags.language)p.push(a.tags.language.toUpperCase());if(a.codec_name)p.push(a.codec_name.toUpperCase());if(a.channel_layout)p.push(a.channel_layout.replace('stereo','2.0').replace('mono','1.0').replace('5.1(side)','5.1').replace(/\s*\(side\)\s*/,'').trim());lines.push({type:'audio',text:p.join(' · ')||'—'});});
        subs.forEach(function(s){var p=[];if(s.tags&&s.tags.language)p.push(s.tags.language.toUpperCase());if(s.codec_name)p.push(s.codec_name.toUpperCase().replace('SUBRIP','SRT').replace('HDMV_PGS_SUBTITLE','PGS'));lines.push({type:'sub',text:p.join(' · ')||'—'});});
        return lines;
    }

    var style=document.createElement('style');
    style.textContent='#mi-log{position:fixed;bottom:0;left:0;right:0;z-index:99999;background:rgba(0,0,0,.9);color:#0f0;font-family:monospace;font-size:11px;line-height:1.4;padding:5px 12px;pointer-events:none;}'+
        '.mi-block{margin-top:.55em;display:flex;flex-direction:column;gap:.2em;font-size:.82em;line-height:1.4;opacity:.82}'+
        '.mi-loading{opacity:.35;letter-spacing:.3em}'+
        '.mi-line{display:flex;gap:.45em;align-items:baseline;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
        '.mi-line::before{flex-shrink:0;opacity:.55;width:1.1em;text-align:center}'+
        '.mi-video::before{content:"▶"}.mi-audio::before{content:"♪"}.mi-sub::before{content:"T"}';
    document.head.appendChild(style);
})();
