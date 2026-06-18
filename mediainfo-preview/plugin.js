(function () {
    'use strict';

    if (window.MediaInfoPreviewPlugin) return;
    window.MediaInfoPreviewPlugin = true;

    Lampa.Manifest = Lampa.Manifest || {};
    Lampa.Manifest.plugins = Lampa.Manifest.plugins || {};

    console.log('MediaInfo Preview loaded');

    Lampa.Noty.show('MediaInfo Preview загружен');
})();
