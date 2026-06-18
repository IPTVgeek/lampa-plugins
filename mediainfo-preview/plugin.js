(function () {
    'use strict';

    Lampa.Listener.follow('full', function (e) {

        if (e.type !== 'complete') return;

        console.log('[FULL COMPLETE]', e);

        setTimeout(function(){

            console.log(
                'DESCRIPTION:',
                $('.full-start__description').length
            );

            console.log(
                'BODY:',
                $('.full-start').length
            );

        },1000);
    });

})();
