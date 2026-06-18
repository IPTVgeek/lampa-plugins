(function () {
    'use strict';

    setTimeout(function () {

        console.log('BODY CLASSES');
        console.log(document.body.className);

        console.log('TORRENTS');
        console.log($('.torrent').length);

        console.log('TORRENTS ITEMS');
        console.log($('.torren').length);

        console.log('FIRST 20 DIV CLASSES');

        $('div').each(function(i){
            if(i < 20) console.log(i, this.className);
        });

    },3000);

})();
