(function() {
    'use strict';

    angular
        .module('app')
        .controller('OverviewController', Controller);

    Controller.$inject = ['VisDataSet', 'stations', 'policies', 'macvendorFilter'];

    /* @ngInject */
    function Controller(VisDataSet, stations, policies, macvendorFilter) {
        var vm = this;

        vm.stations = stations.toJSON();
        vm.policies = policies;

        vm.stationsCount = _.size(vm.stations);
        vm.clientsCount = _(vm.stations).map(function(s) { return s.clients.length }).sum();
        vm.policiesCount = _.size(vm.policies);

        vm.activeCount = _.transform(vm.stations, function(result, station) {
            _.forEach(station.clients, function(client) {
                if (client.connected) {
                    result.active += (client.policies.length || 0);
                } else {
                    result.inactive += (client.policies.length || 0);
                }
            });
        }, { active: 0, inactive: 0 });

        var nodes = [
            {id: 1, shape: 'image', image: 'images/cloud.png', size: 40}
        ];

        var edges = [];

        //
        _.forEach(vm.stations, function(station) {
            nodes.push({
                id: station.bssid,
                label: station.ssid,
                shape: 'image',
                image: 'images/tplink.png'
            });

            edges.push({
                from: 1,
                to: station.bssid,
                length: 150
            });

            _.forEach(station.clients, function(client) {
                var node = {
                    id: client.mac,
                    label: client.mac + '\n' + macvendorFilter(client.mac),
                    shape: 'image'
                };

                if (client.type == 'mobile') {
                    node.image = 'images/pda.png';
                } else if (client.type == 'computer') {
                    node.image = 'images/computer.png';
                }

                nodes.push(node);

                edges.push({
                    from: station.bssid,
                    to: client.mac,
                    length: 90
                });
            })
        });

        vm.options = {
            autoResize: true,
            height: '100%',
            width: '100%'
        };

        vm.data = {
            nodes: VisDataSet(nodes),
            edges: VisDataSet(edges)
        };
    }
})();
