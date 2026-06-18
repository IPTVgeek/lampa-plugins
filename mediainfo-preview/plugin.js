(function () {
    'use strict';

    Lampa.Listener.follow('full', function (e) {

        if (e.type !== 'start') return;

        console.log('FULL START', e);

        if (e.data && e.data.movie) {

            var movie = e.data.movie;

            Lampa.Noty.show(
                'TMDB: ' +
                movie.id +
                ' | ' +
                (movie.title || movie.name)
            );

            console.log('MOVIE', movie);
        }
    });

})();
