(function () {
    'use strict';

    if (window.mediainfo_preview_test) return;
    window.mediainfo_preview_test = true;

    console.log('[MediaInfo Preview] started');

    Lampa.Listener.follow('full', function (e) {

        if (e.type !== 'complete') return;

        console.log('[FULL COMPLETE]', e);

        setTimeout(function () {

            $('.mediainfo-preview-test').remove();

            var block = $(
                '<div class="mediainfo-preview-test" style="' +
                'margin-top:1.5em;' +
                'padding:1em;' +
                'background:rgba(255,255,255,0.08);' +
                'border-radius:0.5em;' +
                'font-size:1.1em;' +
                '">' +
                '<b>MediaInfo Preview</b><br>' +
                'TMDB ID: ' + (e.object ? e.object.id : 'unknown') +
                '</div>'
            );

            console.log('DESCRIPTION', $('.full-start__description').length);
            console.log('BODY', $('.full-start').length);

            if ($('.full-start__description').length) {
                $('.full-start__description').after(block);
                console.log('INSERT AFTER DESCRIPTION');
            }
            else if ($('.full-start').length) {
                $('.full-start').append(block);
                console.log('INSERT INTO FULL');
            }
            else {
                $('body').append(block);
                console.log('INSERT INTO BODY');
            }

        }, 1000);
    });

})();
