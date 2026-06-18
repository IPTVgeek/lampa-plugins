(function () {
    'use strict';

    function init() {
        Lampa.Noty.show('MediaInfo Preview Debug загружен');

        console.log('[MediaInfo Preview] plugin started');

        Lampa.Listener.follow('full', function (e) {
            console.log('[FULL EVENT]', e);

            try {
                Lampa.Noty.show('FULL: ' + (e.data?.movie?.title || e.data?.movie?.name || 'unknown'));
            }
            catch (err) {
                console.log(err);
            }
        });

        Lampa.Listener.follow('activity', function (e) {
            console.log('[ACTIVITY EVENT]', e);
        });

        Lampa.Listener.follow('torrent_file', function (e) {
            console.log('[TORRENT FILE EVENT]', e);
        });
    }

    if (window.lampa_started) {
        init();
    }
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') init();
        });
    }

})();
