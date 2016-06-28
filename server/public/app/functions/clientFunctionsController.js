(function() {
    'use strict';

    angular
        .module('app')
        .controller('ClientFunctionsController', Controller);

    Controller.$inject = ['client', 'policies', '$http'];

    /* @ngInject */
    function Controller(client, policies, $http) {
        var vm = this;

        vm.client = client;
        vm.policies = policies;

        vm.alreadyUsed = function(policyname) {
            return _.some(vm.client.policies, { policy: policyname });
        };

        vm.addPolicy = function(name) {
            $http.post('/api/clients/' + vm.client.mac + '/functions', { policy: name, active: true }).then(function(res) {
                vm.client = res.data;

                //
                calcChartEnabled();
            });
        };

        vm.removePolicy = function(name) {
            $http.delete('/api/clients/' + vm.client.mac + '/functions/' + name).then(function(res) {
                vm.client = res.data;

                //
                calcChartEnabled();
            });
        };

        calcChartEnabled();

        function calcChartEnabled() {
            vm.chartEnabled = {
                labels: ['Enabled', 'Unused'],
                data: [vm.client.policies.length, _.size(vm.policies) - vm.client.policies.length]
            };
        }

        var previous;
        var now = new Date();
        vm.charts = _.transform(vm.client.statistics, function(result, statistic) {
            var timed = Math.round((now - Date.parse(statistic.time)) / 1000);

            // Network stats
            if (previous) {
                result.network.labels.push(timed);
                result.network.data[0].push(parseInt(statistic['tx bytes']) - parseInt(previous['tx bytes']));
                result.network.data[1].push(parseInt(statistic['rx bytes']) - parseInt(previous['rx bytes']));
            }

            // Signal strength
            result.signal.labels.push(timed);
            result.signal.data[0].push(parseInt(statistic.signal.split(' ')[0]));

            previous = statistic;
        }, {
            network: { labels: [], data: [[], []], series: ['Network Tx', 'Network Rx'] },
            signal: { labels: [], data: [[]], series: ['DBm'] }
        });
    }
})();
