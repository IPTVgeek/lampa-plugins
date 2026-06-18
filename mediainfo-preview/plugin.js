
(function () {
    'use strict';

    function init() {
        // Выводит всплывающее уведомление на экран в самом интерфейсе Lampa
        Lampa.Noty.show('Плагин MediaInfo Preview успешно загружен!');
        
        // Выводит строку в консоль разработчика (для отладки)
        console.log('[Lampa Plugin] mediainfo-preview: Loaded successfully');
    }

    // Если Lampa уже загружена — запускаем сразу
    if (window.lampa_started) {
        init();
    } else {
        // Если еще нет — ждем события готовности (ready)
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') init();
        });
    }
})();
