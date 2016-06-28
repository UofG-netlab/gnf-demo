(function() {
    'use strict';

    angular
        .module('app')
        .controller('FunctionsController', Controller);

    Controller.$inject = ['stations'];

    /* @ngInject */
    function Controller(stations) {
        var vm = this;

        vm.stations = stations;

        vm.clients = _.transform(vm.stations, function(result, station) {
            _.forEach(station.clients, function(client) {
                result[client.mac] = client;
            });
        }, {});

        vm.connectedCount = _.countBy(vm.clients, 'connected');
        vm.activeCount = _.reduce(vm.clients, function(result, client) {
            if (client.connected) {
                result.active += (client.policies.length || 0);
            } else {
                result.inactive += (client.policies.length || 0);
            }

            return result;
        }, { active: 0, inactive: 0 });

        vm.chartConnected = {
            labels: ['Online', 'Offline'],
            data: [vm.connectedCount.true || 0, vm.connectedCount.false || 0]
        };

        vm.activePolicies = {
            labels: ['Active', 'Inactive'],
            data: [vm.activeCount.active || 0, vm.activeCount.inactive || 0]
        };
    }
})();
