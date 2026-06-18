(function () {
    'use strict';

    console.log('[MediaInfo] Plugin loaded');

    Lampa.Listener.follow('full', function (e) {
        console.log('[FULL]', e);
    });

    Lampa.Listener.follow('activity', function (e) {
        console.log('[ACTIVITY]', e);
    });

    Lampa.Listener.follow('torrent_file', function (e) {
        console.log('[TORRENT_FILE]', e);
    });

})();
