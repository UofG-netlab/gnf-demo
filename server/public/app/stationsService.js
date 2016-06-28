(function() {
    'use strict';

    angular
        .module('app')
        .factory('Stations', factory);

    factory.$inject = ['$resource'];

    /* @ngInject */
    function factory($resource) {
        return $resource('/api/stations/:id', { bssid: '@id' }, {
            clients: { method: 'GET', url: '/api/stations/:id/clients', isArray: true }
        });
    }
})();
