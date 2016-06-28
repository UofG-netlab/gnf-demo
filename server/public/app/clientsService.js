(function() {
    'use strict';

    angular
        .module('app')
        .factory('Clients', factory);

    factory.$inject = ['$resource'];

    /* @ngInject */
    function factory($resource) {
        return $resource('/api/clients/:id', { mac: '@id' })
    }
})();
