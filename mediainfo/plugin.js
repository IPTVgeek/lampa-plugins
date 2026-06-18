(function () {
    'use strict';

    var HOST  = '185.204.0.61:8080';
    var cache = {};

    /* ── helpers ──────────────────────────────────────────────── */

    function esc(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function fetchTimeout(url, ms) {
        return new Promise(function (resolve, reject) {
            var done  = false;
            var ctrl  = typeof AbortController !== 'undefined' ? new AbortController() : null;
            var timer = setTimeout(function () {
                done = true;
                if (ctrl) ctrl.abort();
                reject(new Error('timeout'));
            }, ms);
            fetch(url, ctrl ? { signal: ctrl.signal } : {})
                .then(function (r) { clearTimeout(timer); if (!done) resolve(r); })
                .catch(function (e) { clearTimeout(timer); if (!done) reject(e); });
        });
    }

    /* ── data fetching ───────────────────────────────────────── */

    function getInfo(el, callback) {
        var hash  = el.torrent_hash;
        var index = el.id !== undefined ? el.id : 0;
        var key   = hash + '_' + index;

        // cache hit
        if (cache.hasOwnProperty(key)) {
            setTimeout(function () { callback(cache[key]); }, 0);
            return;
        }

        // fast path — Lampa already has ffprobe data
        if (el.ffprobe && Array.isArray(el.ffprobe) && el.ffprobe.length) {
            var hit = { streams: el.ffprobe };
            cache[key] = hit;
            callback(hit);
            return;
        }

        var finished = false;

        function done(result) {
            if (finished) return;
            finished = true;
            cache[key] = result;
            callback(result);
        }

        // overall timeout
        var globalTimer = setTimeout(function () { done(null); }, 10000);

        function finish(result) {
            clearTimeout(globalTimer);
            done(result);
        }

        // source A — HTTP REST (fast if server supports it)
        fetchTimeout('http://' + HOST + '/api?hash=' + hash + '&index=' + index, 5000)
            .then(function (r) { return r.json(); })
            .then(function (json) {
                if (json && json.streams && json.streams.length) finish(json);
            })
            .catch(function () { /* silent, WS may still win */ });

        // source B — WebSocket (original method)
        try {
            var ws    = new WebSocket('ws://' + HOST + '/?' + hash + '&index=' + index);
            var wsTimer = setTimeout(function () { ws.close(); }, 8000);

            ws.onmessage = function (e) {
                clearTimeout(wsTimer);
                ws.close();
                try {
                    var json = JSON.parse(e.data);
                    if (json && json.streams && json.streams.length) finish(json);
                } catch (ex) { /* ignore */ }
            };

            ws.onerror = function () { clearTimeout(wsTimer); };
            ws.onclose = function () { clearTimeout(wsTimer); };
        } catch (e) { /* WebSocket not available */ }
    }

    /* ── stream formatting ───────────────────────────────────── */

    function buildLines(streams) {
        var video = streams.filter(function (s) { return s.codec_type === 'video'; });
        var audio = streams.filter(function (s) { return s.codec_type === 'audio'; });
        var subs  = streams.filter(function (s) { return s.codec_type === 'subtitle'; });
        var lines = [];

        // video — one line
        video.slice(0, 1).forEach(function (v) {
            var p = [];
            if (v.width && v.height)  p.push(v.width + '×' + v.height);
            if (v.codec_name)         p.push(v.codec_name.toUpperCase());
            var bps = v.bit_rate || (v.tags && (v.tags.BPS || v.tags['BPS-eng']));
            if (bps && bps > 0)       p.push(Math.round(bps / 1e6) + ' Mb/s');
            if (p.length) lines.push({ type: 'video', text: p.join(' · ') });
        });

        // audio tracks
        audio.forEach(function (a) {
            var p = [];
            if (a.tags && a.tags.language) p.push(a.tags.language.toUpperCase());
            if (a.codec_name)              p.push(a.codec_name.toUpperCase());
            if (a.channel_layout) {
                var ch = a.channel_layout
                    .replace('stereo', '2.0')
                    .replace('mono',   '1.0')
                    .replace('5.1(side)', '5.1')
                    .replace(/\s*\(side\)\s*/, '')
                    .trim();
                if (ch) p.push(ch);
            }
            var bps = a.bit_rate || (a.tags && (a.tags.BPS || a.tags['BPS-eng']));
            if (bps && bps > 0) p.push(Math.round(bps / 1000) + ' kb/s');
            var lbl = a.tags && (a.tags.title || a.tags.handler_name);
            if (lbl && lbl !== 'SoundHandler' && lbl !== 'AudioHandler') p.push(lbl);
            lines.push({ type: 'audio', text: p.join(' · ') || '—' });
        });

        // subtitle tracks
        subs.forEach(function (s) {
            var p = [];
            if (s.tags && s.tags.language) p.push(s.tags.language.toUpperCase());
            if (s.codec_name) {
                p.push(s.codec_name.toUpperCase()
                    .replace('SUBRIP',            'SRT')
                    .replace('HDMV_PGS_SUBTITLE', 'PGS')
                    .replace('MOV_TEXT',          'MOV')
                    .replace('DVB_SUBTITLE',      'DVB'));
            }
            var lbl = s.tags && (s.tags.title || s.tags.handler_name);
            if (lbl) p.push(lbl);
            lines.push({ type: 'sub', text: p.join(' · ') || '—' });
        });

        return lines;
    }

    /* ── DOM rendering ───────────────────────────────────────── */

    function renderInfo(item, streams) {
        item.find('.mi-block').remove();
        var lines = buildLines(streams);
        if (!lines.length) return;

        var html = '<div class="mi-block">';
        lines.forEach(function (l) {
            html += '<div class="mi-line mi-' + l.type + '">' + esc(l.text) + '</div>';
        });
        html += '</div>';
        item.append(html);
    }

    /* ── Lampa integration ───────────────────────────────────── */

    Lampa.Listener.follow('torrent_file', function (data) {
        if (data.type !== 'render') return;

        var el = data.element;
        if (!el || !el.torrent_hash) return;

        var item    = data.item;
        var fetched = false;

        item.on('hover:focus', function () {
            if (fetched) return;
            fetched = true;

            item.append('<div class="mi-block mi-loading">···</div>');

            getInfo(el, function (result) {
                item.find('.mi-block').remove();
                if (result && result.streams && result.streams.length) {
                    renderInfo(item, result.streams);
                }
            });
        });
    });

    /* ── styles ──────────────────────────────────────────────── */

    $('<style>\
.mi-block{margin-top:.55em;display:flex;flex-direction:column;gap:.2em;font-size:.82em;line-height:1.4;opacity:.82}\
.mi-loading{opacity:.35;letter-spacing:.3em}\
.mi-line{display:flex;gap:.45em;align-items:baseline;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
.mi-line::before{flex-shrink:0;opacity:.55;width:1.1em;text-align:center}\
.mi-video::before{content:"▶"}\
.mi-audio::before{content:"♪"}\
.mi-sub::before{content:"T"}\
</style>').appendTo('body');

})();
