(function () {
    'use strict';

    /* ═══════════════════════════════════════════════════════════
       MEDIAINFO для Lampa — дорожки и субтитры раздачи в списке
       Автор: Гик IPTV · https://github.com/IPTVgeek/lampa-plugins

       Слой 1 — мгновенно из названия (4K/1080p, HDR/DV, кодек).
       Слой 2 — обогащение по ffprobe (аудио/субтитры/битрейты).
       Источник ffprobe: локальный TorrServer /ffp → резерв 185.
       v1.1: защита от мусорных/троллинг-ответов сервера.
       ═══════════════════════════════════════════════════════════ */

    var VERSION     = '1.1';
    var DEBUG       = false;
    var HOST185     = '185.204.0.61:8080';
    var TS_BASES    = [];
    var TS_BASE     = null;
    var AUTO_LIMIT  = 8;
    var CONCURRENCY = 3;
    var MAX_AUDIO   = 8;     // сколько аудио-чипов показывать (дальше «+N»)
    var MAX_SUBS    = 10;
    var VIDEO_EXT   = /\.(mkv|mp4|avi|m4v|mov|ts|m2ts|mpg|mpeg|webm|wmv)$/i;
    var CACHE_KEY   = 'mediainfo_cache_v1';

    var ffpAvailable = true;
    var cache = {}, queue = [], running = 0, autoCount = 0;

    function log(m) { if (DEBUG) try { console.log('[MediaInfo] ' + m); } catch (e) {} }
    function guard(label, fn) {
        return function () { try { return fn.apply(this, arguments); } catch (e) { log('err ' + label + ': ' + (e && e.message)); } };
    }

    /* ── постоянный кэш ──────────────────────────────────────── */
    function loadCache() {
        try { var o = Lampa.Storage.get(CACHE_KEY, {}); if (o && typeof o === 'object') for (var k in o) cache[k] = { state: 'done', rows: o[k] }; } catch (e) {}
    }
    var saveTimer = null;
    function saveCache() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(function () {
            try { var o = {}, n = 0; for (var k in cache) if (cache[k] && cache[k].state === 'done') { o[k] = cache[k].rows; if (++n > 800) break; } Lampa.Storage.set(CACHE_KEY, o); } catch (e) {}
        }, 1000);
    }

    /* ── сеть ────────────────────────────────────────────────── */
    function nativeReq(url, dataType, post, ok, err) {
        var n = new Lampa.Reguest();
        n.timeout(15000);
        n.native(url, ok, err, post || false, { dataType: dataType || 'text' });
    }
    function extractHash(s) {
        if (!s) return null;
        s = String(s);
        var m = s.match(/urn:btih:([a-fA-F0-9]{40})/i); if (m) return m[1].toLowerCase();
        var b = s.match(/urn:btih:([A-Za-z2-7]{32})/);   if (b) return b[1];
        var h = s.match(/\b([a-fA-F0-9]{40})\b/);         if (h) return h[1].toLowerCase();
        return null;
    }

    /* ── СЛОЙ 1: разбор названия ──────────────────────────────── */
    function parseTitle(title) {
        var s = ' ' + (title || '').toLowerCase() + ' ';
        var res = /2160|\buhd\b|\b4k\b/.test(s) ? '4K'
                : /1080|fullhd/.test(s) ? '1080p'
                : /720/.test(s) ? '720p'
                : /480/.test(s) ? '480p' : '';
        var codec = /hevc|h\.?265|x265/.test(s) ? 'HEVC'
                  : /av1/.test(s) ? 'AV1'
                  : /h\.?264|x264|\bavc\b/.test(s) ? 'H.264' : '';
        var hdr = /dolby\s*vision|dovi|dvhe|dv\s*p[78]/.test(s) ? 'Dolby Vision'
                : /hdr10\+|hdr10plus|hdr\+/.test(s) ? 'HDR10+'
                : /hdr10/.test(s) ? 'HDR10'
                : /\bhdr\b/.test(s) ? 'HDR'
                : /\bhlg\b/.test(s) ? 'HLG' : '';
        return { res: res, codec: codec, hdr: hdr };
    }
    function titleVideoChip(pt) {
        var vp = [];
        if (pt.res) vp.push(pt.res);
        if (pt.codec) vp.push(pt.codec);
        if (pt.hdr) vp.push(pt.hdr);
        return vp.length ? { c: 'v', t: vp.join(' · ') } : null;
    }
    function titleRows(element) {
        var c = titleVideoChip(parseTitle(element.Title || element.title));
        return c ? [c] : [];
    }

    /* ── СЛОЙ 2: разбор ffprobe (с санитайзом) ───────────────── */
    function bps(s) { var v = s.bit_rate || (s.tags && (s.tags.BPS || s.tags['BPS-eng'] || s.tags['BPS-en'])); v = parseInt(v, 10); return isNaN(v) ? 0 : v; }
    function cleanLang(l) { l = String(l || ''); return /^[A-Za-z]{2,4}$/.test(l) ? l.toUpperCase() : ''; }
    function cleanCodec(c) { c = String(c || ''); return /^[A-Za-z0-9][A-Za-z0-9.+_-]{0,11}$/.test(c) ? c.toUpperCase().replace('H264', 'H.264') : ''; }
    function resLabel(v) {
        var w = v.width || v.coded_width || 0, h = v.height || v.coded_height || 0;
        if (w >= 3000 || h >= 1900) return '4K';
        if (w >= 1800 || h >= 1000) return '1080p';
        if (w >= 1200 || h >= 700)  return '720p';
        if (w >= 900  || h >= 500)  return '480p';
        return w && h ? w + 'x' + h : '';
    }
    function hdrLabel(v) {
        var ct = (v.color_transfer || '').toLowerCase(), cp = (v.color_primaries || '').toLowerCase(), dv = false;
        try { dv = (v.side_data_list || []).some(function (sd) { return /dovi|dolby vision/i.test(JSON.stringify(sd)); }); } catch (e) {}
        if (!dv && /dvhe|dvh1|dav1|dvav/i.test(v.codec_tag_string || '')) dv = true;
        if (dv) return 'Dolby Vision';
        if (ct === 'smpte2084') return 'HDR10';
        if (ct === 'arib-std-b67') return 'HLG';
        if (cp === 'bt2020') return 'HDR';
        return '';
    }
    function isAtmos(a) { return /atmos|joc/i.test(a.profile || '') || /atmos/i.test((a.tags && a.tags.title) || ''); }
    function chTxt(a) {
        if (a.channel_layout && /^[0-9a-z.()+ -]{1,12}$/i.test(a.channel_layout)) return a.channel_layout.replace('stereo', '2.0').replace('mono', '1.0').replace(/\(side\)|\(rear\)/g, '');
        if (a.channels === 8) return '7.1'; if (a.channels === 6) return '5.1';
        if (a.channels === 2) return '2.0'; if (a.channels === 1) return '1.0';
        return (a.channels > 0 && a.channels <= 16) ? a.channels + 'ch' : '';
    }
    function videoOf(streams) { return streams.filter(function (s) { return s.codec_type === 'video' && s.codec_name !== 'mjpeg' && s.codec_name !== 'png'; })[0]; }

    function build(streams) {
        var out = [];
        var v = videoOf(streams);
        if (v) {
            var p = [];
            var r = resLabel(v); if (r) p.push(r);
            var cc = cleanCodec(v.codec_name); if (cc) p.push(cc);
            var hd = hdrLabel(v); if (hd) p.push(hd);
            var vb = bps(v); if (vb > 0 && vb <= 200e6) p.push(Math.round(vb / 1e6) + ' Мб/с');
            if (p.length) out.push({ c: 'v', t: p.join(' · ') });
        }
        var arows = [];
        streams.filter(function (s) { return s.codec_type === 'audio'; }).forEach(function (a) {
            var p = [];
            var lg = cleanLang(a.tags && a.tags.language); if (lg) p.push(lg);
            var cc = cleanCodec(a.codec_name); if (cc) p.push(cc);
            var ch = chTxt(a); if (ch) p.push(ch);
            if (isAtmos(a)) p.push('Atmos');
            var ab = bps(a); if (ab > 0 && ab <= 12e6) p.push(Math.round(ab / 1000) + ' кб/с');
            var nm = a.tags && (a.tags.title || a.tags.handler_name);
            if (nm && !/SoundHandler|AudioHandler/i.test(nm)) { nm = String(nm).replace(/[<>]/g, ''); if (nm.length > 18) nm = nm.slice(0, 18) + '…'; p.push(nm); }
            if (p.length) arows.push({ c: 'a', t: '♪ ' + p.join(' · ') });
        });
        arows.slice(0, MAX_AUDIO).forEach(function (r) { out.push(r); });
        if (arows.length > MAX_AUDIO) out.push({ c: 'a', t: '♪ +' + (arows.length - MAX_AUDIO) });

        var sl = streams.filter(function (s) { return s.codec_type === 'subtitle'; }).map(function (s) {
            var lang = cleanLang(s.tags && s.tags.language);
            var raw = (s.codec_name || '').toUpperCase().replace('SUBRIP', 'SRT').replace('HDMV_PGS_SUBTITLE', 'PGS').replace('MOV_TEXT', 'TX');
            var fmt = /^[A-Z0-9]{1,8}$/.test(raw) ? raw : '';
            return (lang + (fmt ? ' ' + fmt : '')).trim();
        }).filter(function (v, i, a) { return v && a.indexOf(v) === i; }).slice(0, MAX_SUBS);
        if (sl.length) out.push({ c: 's', t: 'T ' + sl.join(' / ') });
        return out;
    }

    function mergeRows(streams, pt) {
        var rows = build(streams);
        var v = rows.filter(function (r) { return r.c === 'v'; })[0];
        if (!v) { var c = titleVideoChip(pt); if (c) rows.unshift(c); }
        else {
            if (pt.res && !/4K|1080p|720p|480p|\d{3,4}x\d{3,4}/.test(v.t)) v.t = pt.res + ' · ' + v.t;
            if (pt.hdr && !/HDR|Dolby|HLG/i.test(v.t)) v.t += ' · ' + pt.hdr;
        }
        return rows;
    }

    /* отсев явного мусора (троллинг-ответ сервера) */
    function safeRows(streams, pt) {
        if (!streams || !streams.length) return null;
        var a = 0, s = 0;
        for (var i = 0; i < streams.length; i++) {
            if (streams[i].codec_type === 'audio') a++;
            else if (streams[i].codec_type === 'subtitle') s++;
        }
        if (a > 12 || s > 24 || streams.length > 48) return null;
        var rows = mergeRows(streams, pt);
        return rows.length ? rows : null;
    }

    function renderRows(item, rows, pending) {
        try {
            item.find('.mi-badge').remove();
            if ((!rows || !rows.length) && !pending) return;
            var html = (rows || []).map(function (r) { return '<span class="mi-' + r.c + '">' + r.t.replace(/</g, '&lt;') + '</span>'; }).join('');
            if (pending) html += '<span class="mi-load">···</span>';
            item.append('<div class="mi-badge">' + html + '</div>');
        } catch (e) {}
    }

    /* ── TorrServer ──────────────────────────────────────────── */
    function tsAdd(link, cb) {
        nativeReq(TS_BASE + '/torrents', 'json', JSON.stringify({ action: 'add', link: link, title: '[mediainfo]', save_to_db: false }),
            guard('add', function (j) { cb((j && (j.hash || (j.torrent && j.torrent.hash))) || null); }), function () { cb(null); });
    }
    function tsDrop(hash) { if (!hash) return; nativeReq(TS_BASE + '/torrents', 'text', JSON.stringify({ action: 'drop', hash: hash }), function () {}, function () {}); }
    function pickIndex(fs) {
        if (!fs || !fs.length) return 0;
        var arr = fs.slice().sort(function (a, b) { return (b.length || 0) - (a.length || 0); });
        var vid = arr.filter(function (f) { return VIDEO_EXT.test(f.path || ''); });
        var pick = (vid[0] || arr[0]);
        return pick.id != null ? pick.id : 0;
    }
    function getIndex(hash, attempt, cb) {
        nativeReq(TS_BASE + '/torrents', 'json', JSON.stringify({ action: 'get', hash: hash }),
            guard('get', function (j) {
                var fs = j && j.file_stats;
                if ((!fs || !fs.length) && attempt < 4) return setTimeout(function () { getIndex(hash, attempt + 1, cb); }, 1500);
                cb(pickIndex(fs));
            }),
            function () { if (attempt < 4) setTimeout(function () { getIndex(hash, attempt + 1, cb); }, 1500); else cb(0); });
    }
    function ffp(hash, idx, attempt, cb) {
        if (!TS_BASE) return cb(null);
        nativeReq(TS_BASE + '/ffp/' + hash + '/' + idx, 'json', false,
            guard('ffp', function (j) { var s = j && j.streams; if (s && s.length) cb(s); else cb(null); }),
            function (jq, ex) {
                var st = jq && jq.status;
                if (st === 400) { ffpAvailable = false; log('ffp 400 → нет ffprobe, далее только 185'); return cb(null); }
                if (attempt < 2) return setTimeout(function () { ffp(hash, idx, attempt + 1, cb); }, 2000);
                cb(null);
            });
    }

    /* ── публичный резерв 185 (Tracks Inspector) ─────────────── */
    function probe185(hash, idx, cb) {
        var got = false; function done(s) { if (got) return; got = true; cb(s); }
        nativeReq('http://' + HOST185 + '/api?hash=' + hash + '&index=' + idx, 'json', false,
            guard('185http', function (j) { if (j && j.streams && j.streams.length) done(j.streams); }), function () {});
        try {
            var ws = new WebSocket('ws://' + HOST185 + '/?' + hash + '&index=' + idx);
            var t = setTimeout(function () { try { ws.close(); } catch (e) {} done(null); }, 22000);
            ws.onmessage = guard('185ws', function (e) { var j; try { j = JSON.parse(String(e.data || '')); } catch (x) { return; } if (j && j.streams && j.streams.length) { clearTimeout(t); try { ws.close(); } catch (e) {} done(j.streams); } });
            ws.onerror = function () {};
        } catch (e) {}
    }

    function fetchByHash(hash, idx, cb) {
        function fb() { probe185(hash, idx, cb); }
        if (!ffpAvailable || !TS_BASE) return fb();
        ffp(hash, idx, 0, function (s) { if (s && s.length) cb(s); else fb(); });
    }

    /* ── очередь (путь torrent, btih ещё нет) ────────────────── */
    function enqueue(element, item, priority) {
        var link = element.Link || element.link || element.MagnetUri || element.url;
        if (!link || !TS_BASE) return;
        if (cache[link]) { if (cache[link].state === 'done') renderRows(item, cache[link].rows); return; }
        for (var i = 0; i < queue.length; i++) { if (queue[i].link === link) { if (priority) queue.unshift(queue.splice(i, 1)[0]); return; } }
        var job = { element: element, item: item, link: link };
        if (priority) queue.unshift(job); else queue.push(job);
        pump();
    }
    function pump() {
        while (running < CONCURRENCY && queue.length) {
            var job = queue.shift();
            if (cache[job.link] && cache[job.link].state === 'done') { renderRows(job.item, cache[job.link].rows); continue; }
            running++; resolveJob(job, function () { running--; pump(); });
        }
    }
    function resolveJob(job, onDone) {
        cache[job.link] = { state: 'pending' };
        var pt = parseTitle(job.element.Title || job.element.title);
        var trows = titleRows(job.element);
        var direct = extractHash(job.element.MagnetUri) || extractHash(job.element.Link);

        function finish(streams) {
            var rows = safeRows(streams, pt);
            if (rows) { cache[job.link] = { state: 'done', rows: rows }; saveCache(); }
            else { rows = trows; cache[job.link] = null; }
            renderRows(job.item, rows, false);
            onDone();
        }
        function go(hash) {
            if (!hash) { finish(null); return; }
            getIndex(hash, 0, function (idx) {
                function fb() { probe185(hash, idx, function (s2) { tsDrop(hash); finish(s2); }); }
                if (!ffpAvailable) return fb();
                ffp(hash, idx, 0, function (streams) { if (streams && streams.length) { tsDrop(hash); finish(streams); } else fb(); });
            });
        }
        if (direct) go(direct); else tsAdd(job.link, go);
    }

    /* ── событие torrent (Android TV: список раздач) ─────────── */
    function onTorrentRender(element, item) {
        if (element.ffprobe && element.ffprobe.length) {
            renderRows(item, safeRows(element.ffprobe, parseTitle(element.Title || element.title)) || titleRows(element));
            return;
        }
        var link = element.Link || element.link || element.MagnetUri || element.url;
        if (link && cache[link] && cache[link].state === 'done') { renderRows(item, cache[link].rows); return; }

        var willEnrich = autoCount < AUTO_LIMIT;
        renderRows(item, titleRows(element), willEnrich);
        if (willEnrich) { autoCount++; enqueue(element, item, false); }

        try {
            item.on('hover:focus', guard('focus', function () {
                if (link && cache[link] && cache[link].state === 'done') return;
                renderRows(item, titleRows(element), true);
                enqueue(element, item, true);
            }));
        } catch (e) {}
    }

    /* ── событие torrent_file (браузер/внутр. плеер: файлы) ──── */
    function onFileRender(element, item) {
        var pt = parseTitle(element.title || element.Title || '');
        if (element.ffprobe && Array.isArray(element.ffprobe) && element.ffprobe.length) {
            renderRows(item, safeRows(element.ffprobe, pt) || titleRows(element)); return;
        }
        var hash = element.torrent_hash || element.info_hash || extractHash(element.hash);
        if (!hash) return;
        var idx = element.id !== undefined ? element.id : (element.file_index !== undefined ? element.file_index : 0);
        var ckey = 'h_' + hash + '_' + idx;
        if (cache[ckey] && cache[ckey].state === 'done') { renderRows(item, cache[ckey].rows); return; }

        renderRows(item, titleRows(element), true);
        fetchByHash(hash, idx, function (streams) {
            var rows = safeRows(streams, pt);
            if (rows) { cache[ckey] = { state: 'done', rows: rows }; saveCache(); renderRows(item, rows, false); }
            else renderRows(item, titleRows(element), false);
        });
    }

    /* ── init ────────────────────────────────────────────────── */
    function buildBases() {
        TS_BASES = [];
        try { var u = Lampa.Torserver.url(); if (u) TS_BASES.push(String(u).replace(/\/+$/, '')); } catch (e) {}
        ['http://127.0.0.1:8090', 'http://localhost:8090', 'http://127.0.0.1:8080'].forEach(function (b) { if (TS_BASES.indexOf(b) < 0) TS_BASES.push(b); });
    }
    function detectTS() {
        TS_BASES.forEach(function (base) {
            nativeReq(base + '/echo', 'text', false,
                guard('echo', function (resp) { if (!TS_BASE) { TS_BASE = base; log('TorrServer: ' + base); pump(); } }), function () {});
        });
    }

    function start() {
        var st = document.createElement('style');
        st.textContent =
            '.mi-badge{display:flex;flex-wrap:wrap;gap:.4em;margin-top:.4em;font-size:.78em;opacity:.95}' +
            '.mi-badge span{border-radius:.3em;padding:.05em .45em;white-space:nowrap;border:1px solid}' +
            '.mi-v{background:rgba(80,160,255,.15);border-color:rgba(80,160,255,.55)}' +
            '.mi-a{background:rgba(124,252,0,.13);border-color:rgba(124,252,0,.5)}' +
            '.mi-s{background:rgba(255,200,0,.13);border-color:rgba(255,200,0,.5)}' +
            '.mi-load{opacity:.4;letter-spacing:.25em;border:0!important;background:none!important}';
        document.head.appendChild(st);

        loadCache();
        buildBases();
        detectTS();

        if (!(window.Lampa && Lampa.Listener)) return;
        Lampa.Listener.follow('torrent', guard('ev', function (data) {
            if (data.type === 'render' && data.element && data.item) onTorrentRender(data.element, data.item);
            if (data.type === 'list_open' || data.type === 'open') autoCount = 0;
        }));
        Lampa.Listener.follow('torrent_file', guard('evf', function (data) {
            if (data.type === 'render' && data.element && data.item) onFileRender(data.element, data.item);
        }));
        log('v' + VERSION + ' loaded');
    }

    if (window.appready) start();
    else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') start(); });

    window.mediainfo = { version: VERSION, clearCache: function () { cache = {}; queue = []; try { Lampa.Storage.set(CACHE_KEY, {}); } catch (e) {} } };

})();
