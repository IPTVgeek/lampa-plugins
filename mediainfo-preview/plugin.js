(function () {
    'use strict';

    console.log('[MediaInfo] Debug started');

    Lampa.Listener.follow('activity', function (e) {
        console.log('[ACTIVITY]', e);
    });

    Lampa.Listener.follow('full', function (e) {
        console.log('[FULL]', e);
    });

})();
