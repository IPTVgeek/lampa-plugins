(function () {
    'use strict';

    console.log('[MediaInfo] Debug started');

    Lampa.Listener.follow('activity', function (e) {
        console.log('[ACTIVITY FULL]', JSON.stringify(e, null, 2));
    });

    Lampa.Listener.follow('full', function (e) {
        console.log('[FULL EVENT]', e);

        if (e.object) {
            console.log('[FULL OBJECT]', e.object);
        }

        if (e.data) {
            console.log('[FULL DATA]', e.data);
        }

        if (e.card) {
            console.log('[FULL CARD]', e.card);
        }
    });

})();
