(function () {
    'use strict';

    var VERSION = '1.9';
    var HOST    = '185.204.0.61:8080';
    var cache   = {};

    /* ── log ─────────────────────────────────────────────────── */

    var logEl    = null;
    var logLines = [];
    var MAX_LOG  = 8;

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

    /* ── helpers ──────────────────────────────────────────────── */

    function esc(s) {
        return String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function fetchTimeout(url, ms) {
        return new Promise(function (resolve, reject) {
            var done  = false;
            var ctrl  = typeof AbortController !== 'undefined' ? new AbortController() : null;
            var timer = setTimeout(function () {
                done = true; if (ctrl) ctrl.abort(); reject(new Error('timeout'));
            }, ms);
            fetch(url, ctrl ? { signal: ctrl.signal } : {})
                .then(function (r) { clearTimeout(timer); if (!done) resolve(r); })
                .catch(function (e) { clearTimeout(timer); if (!done) reject(e); });
        });
    }

    /* ── stream info ─────────────────────────────────────────── */

    function buildLines(streams) {
        var video = streams.filter(function (s) { return s.codec_type === 'video'; });
        var audio = streams.filter(function (s) { return s.codec_type === 'audio'; });
        var subs  = streams.filter(function (s) { return s.codec_type === 'subtitle'; });
        var lines = [];

        video.slice(0, 1).forEach(function (v) {
            var p = [];
            if (v.width && v.height) p.push(v.width + '×' + v.height);
            if (v.codec_name)        p.push(v.codec_name.toUpperCase());
            var bps = v.bit_rate || (v.tags && (v.tags.BPS || v.tags['BPS-eng']));
            if (bps > 0) p.push(Math.round(bps / 1e6) + ' Mb/s');
            if (p.length) lines.push({ type: 'video', text: p.join(' · ') });
        });

        audio.forEach(function (a) {
            var p = [];
            if (a.tags && a.tags.language) p.push(a.tags.language.toUpperCase());
            if (a.codec_name) p.push(a.codec_name.toUpperCase());
            if (a.channel_layout) {
                var ch = a.channel_layout
                    .replace('stereo','2.0').replace('mono','1.0')
                    .replace('5.1(side)','5.1').replace(/\s*\(side\)\s*/,'').trim();
                if (ch) p.push(ch);
            }
            var bps = a.bit_rate || (a.tags && (a.tags.BPS || a.tags['BPS-eng']));
            if (bps > 0) p.push(Math.round(bps / 1000) + ' kb/s');
            var lbl = a.tags && (a.tags.title || a.tags.handler_name);
            if (lbl && lbl !== 'SoundHandler' && lbl !== 'AudioHandler') p.push(lbl);
            lines.push({ type: 'audio', text: p.join(' · ') || '—' });
        });

        subs.forEach(function (s) {
            var p = [];
            if (s.tags && s.tags.language) p.push(s.tags.language.toUpperCase());
            if (s.codec_name) p.push(s.codec_name.toUpperCase()
                .replace('SUBRIP','SRT').replace('HDMV_PGS_SUBTITLE','PGS')
                .replace('MOV_TEXT','MOV').replace('DVB_SUBTITLE','DVB'));
            var lbl = s.tags && (s.tags.title || s.tags.handler_name);
            if (lbl) p.push(lbl);
            lines.push({ type: 'sub', text: p.join(' · ') || '—' });
        });

        return lines;
    }

    function renderInfo(item, streams) {
        item.find('.mi-block').remove();
        var lines = buildLines(streams);
        if (!lines.length) return;
        var html = '<div class="mi-block">';
        lines.forEach(function (l) {
            html += '<div class="mi-line mi-' + l.type + '">' + esc(l.text) + '</div>';
        });
        item.append(html + '</div>');
    }

    function showNoty(streams) {
        try {
            var audio = streams.filter(function (s) { return s.codec_type === 'audio'; });
            var subs  = streams.filter(function (s) { return s.codec_type === 'subtitle'; });
            var parts = [];
            audio.forEach(function (a) {
                var p = [];
                if (a.tags && a.tags.language) p.push(a.tags.language.toUpperCase());
                if (a.codec_name) p.push(a.codec_name.toUpperCase());
                if (a.channel_layout) p.push(a.channel_layout
                    .replace('stereo','2.0').replace('mono','1.0')
                    .replace('5.1(side)','5.1').replace(/\s*\(side\)\s*/,'').trim());
                if (p.length) parts.push('♪ ' + p.join(' '));
            });
            subs.forEach(function (s) {
                var lang = s.tags && s.tags.language ? s.tags.language.toUpperCase() : '';
                if (lang) parts.push('T ' + lang);
            });
            if (parts.length) {
                miLog('Noty: ' + parts.join('|'));
                Lampa.Noty.show(parts.join('  ·  '));
            } else {
                miLog('Noty: no audio/sub');
            }
        } catch (e) { miLog('Noty err: ' + e.message); }
    }

    /* ── нормализация ffprobe ───────────────────────────────────── */

    function extractStreams(ffprobe) {
        if (!ffprobe) return null;
        if (Array.isArray(ffprobe) && ffprobe.length) return ffprobe;
        if (ffprobe.streams && Array.isArray(ffprobe.streams) && ffprobe.streams.length)
            return ffprobe.streams;
        return null;
    }

    /* ── server fallback ───────────────────────────────────────── */

    function fetchFromServer(hash, index, callback) {
        if (!hash) { callback(null); return; }
        var key = hash + '_' + index;
        if (cache[key]) { callback(cache[key]); return; }

        miLog('server hash=' + String(hash).slice(0,10));
        var done = false;
        var timer = setTimeout(function () { if (!done) { done=true; callback(null); } }, 10000);

        function finish(result) {
            if (done) return; done=true;
            clearTimeout(timer);
            cache[key] = result;
            callback(result);
        }

        fetchTimeout('http://' + HOST + '/api?hash=' + hash + '&index=' + index, 5000)
            .then(function(r){ return r.json(); })
            .then(function(j){
                var s = extractStreams(j && (j.streams || j));
                miLog('HTTP n=' + (s ? s.length : 0));
                if (s) finish({ streams: s });
            })
            .catch(function(e){ miLog('HTTP err:' + (e.message||'?')); });

        try {
            var ws = new WebSocket('ws://' + HOST + '/?' + hash + '&index=' + index);
            var wst = setTimeout(function(){ ws.close(); }, 8000);
            ws.onopen = function(){ miLog('WS open'); };
            ws.onmessage = function(e){
                clearTimeout(wst); ws.close();
                try {
                    var j = JSON.parse(e.data);
                    var s = extractStreams(j && (j.streams || j));
                    miLog('WS n=' + (s ? s.length : 0));
                    if (s) finish({ streams: s });
                } catch(ex){ miLog('WS parse err'); }
            };
            ws.onerror = function(){ miLog('WS error'); clearTimeout(wst); };
            ws.onclose = function(){ clearTimeout(wst); };
        } catch(e){ miLog('WS exc:'+e.message); }
    }

    /* ── хук: torrent onenter (Android TV) ─────────────────────── */

    Lampa.Listener.follow('torrent', function (data) {
        if (data.type !== 'onenter') return;
        var el = data.element;
        if (!el) return;

        miLog('onenter ffprobe=' + (el.ffprobe ? 'yes' : 'no'));

        var streams = extractStreams(el.ffprobe);
        if (streams && streams.length) {
            miLog('ffprobe streams=' + streams.length);
            showNoty(streams);
            return;
        }

        // нет ffprobe — пробуем сервер
        var hash = el.torrent_hash || el.magnet;
        if (hash && typeof hash === 'string' && hash.indexOf('magnet:') === 0) {
            var m = hash.match(/urn:btih:([a-fA-F0-9]{40})/i);
            hash = m ? m[1] : null;
        }
        miLog('fallback hash=' + (hash ? String(hash).slice(0,10) : 'none'));
        if (hash) {
            fetchFromServer(hash, 0, function(result) {
                if (result && result.streams) showNoty(result.streams);
            });
        }
    });

    /* ── хук: torrent_file render (браузер) ─────────────────────── */

    Lampa.Listener.follow('torrent_file', function (data) {
        if (data.type !== 'render') return;
        var el = data.element;
        if (!el) return;

        var hash  = el.torrent_hash || el.hash || el.info_hash;
        var index = el.id !== undefined ? el.id : (el.file_index !== undefined ? el.file_index : 0);
        miLog('tf render h=' + (hash ? String(hash).slice(0,8) : 'NONE'));
        if (!hash) return;

        var streams = extractStreams(el.ffprobe);
        var item = data.item;
        item.append('<div class="mi-block mi-loading">···</div>');

        if (streams && streams.length) {
            item.find('.mi-block').remove();
            renderInfo(item, streams);
            showNoty(streams);
            return;
        }

        fetchFromServer(hash, index, function(result) {
            item.find('.mi-block').remove();
            if (!result || !result.streams) return;
            renderInfo(item, result.streams);
            showNoty(result.streams);
        });
    });

    /* ── styles ──────────────────────────────────────────────── */

    var style = document.createElement('style');
    style.textContent =
        '#mi-log{position:fixed;bottom:0;left:0;right:0;z-index:99999;' +
            'background:rgba(0,0,0,.85);color:#0f0;' +
            'font-family:monospace;font-size:12px;line-height:1.5;' +
            'padding:5px 12px;pointer-events:none;}' +
        '.mi-block{margin-top:.55em;display:flex;flex-direction:column;gap:.2em;font-size:.82em;line-height:1.4;opacity:.82}' +
        '.mi-loading{opacity:.35;letter-spacing:.3em}' +
        '.mi-line{display:flex;gap:.45em;align-items:baseline;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
        '.mi-line::before{flex-shrink:0;opacity:.55;width:1.1em;text-align:center}' +
        '.mi-video::before{content:"▶"}' +
        '.mi-audio::before{content:"♪"}' +
        '.mi-sub::before{content:"T"}';
    document.head.appendChild(style);

})();
