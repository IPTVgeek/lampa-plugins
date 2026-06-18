(function () {
    'use strict';

    if (window.mediainfo_preview_test) return;
    window.mediainfo_preview_test = true;

    console.log('[MediaInfo Preview] started');

    setTimeout(function () {

        console.log('full-start', $('.full-start').length);
        console.log('full-start__description', $('.full-start__description').length);

        $('body').append(
            '<div style="' +
            'position:fixed;' +
            'top:100px;' +
            'right:20px;' +
            'z-index:999999;' +
            'background:red;' +
            'padding:20px;' +
            'color:white;' +
            'font-size:20px;' +
            '">MEDIAINFO TEST</div>'
        );

    }, 3000);

})();
