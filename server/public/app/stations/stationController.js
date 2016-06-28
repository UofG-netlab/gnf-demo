(function() {
    'use strict';

    angular
        .module('app')
        .controller('StationController', Controller);

    Controller.$inject = ['station', 'policies', '$stateParams'];

    /* @ngInject */
    function Controller(station, policies, $stateParams) {
        var vm = this;

        vm.station = station;
        vm.policies = policies;

        var previous;
        var now = new Date();
        vm.charts = _.transform(vm.station.statistics, function(result, statistic) {
            var timed = Math.round((now - Date.parse(statistic.time)) / 1000);

            // CPU stats
            if (previous) {
                result.cpu.labels.push(timed);

                var totald = statistic.cpu.total - previous.cpu.total;
                var idled = statistic.cpu.idle - previous.cpu.idle;
                var percentage = (totald - idled)/totald

                result.cpu.data[0].push(percentage);
            }

            // Mem stats
            result.memory.labels.push(timed);
            result.memory.data[0].push((statistic.memory.total - statistic.memory.free)/statistic.memory.total * 100);

            // Network stats
            if (previous) {
                result.network.labels.push(timed);
                result.network.data[0].push(statistic.network.tx - previous.network.tx);
                result.network.data[1].push(statistic.network.rx - previous.network.rx);
            }

            previous = statistic;
        }, {
            cpu: { labels: [], data: [[]], series: ['CPU Utilization'] },
            memory: { labels: [], data: [[]], series: ['Memory Utilization'] },
            network: { labels: [], data: [[], []], series: ['Network Tx', 'Network Rx'] }
        });
    }
})();
