(function() {
    'use strict';

    angular
        .module('app')
        .controller('StationsController', Controller);

    Controller.$inject = ['stations'];

    /* @ngInject */
    function Controller(stations) {
        var vm = this;

        vm.stations = stations.toJSON();

        vm.countAssociatedPolicies = function(station) {
            return _(station.clients).map(_.property('policies.length')).sum();
        };

        vm.stationsStatus = {
            labels: ['Online', 'Offline'],
            data: [0, 0]
        };

        vm.clientsStatus = {
            labels: ['Online', 'Offline'],
            data: [0, 0]
        };

        // Bucket the statistics
        var buckets = [];
        var maxvalues = { network: { tx: -Infinity, rx: -Infinity } };
        var now = new Date();
        _.forEach(vm.stations, function(station) {

            var previous;
            _.forEach(station.statistics, function(statistic) {
                var timed = Math.round((now - Date.parse(statistic.time)) / 1000);
                var result = { timed: timed, cpu: 0, network: { tx: 0, rx: 0 }, memory: 0};

                // CPU stats
                if (previous) {
                    var totald = statistic.cpu.total - previous.cpu.total;
                    var idled = statistic.cpu.idle - previous.cpu.idle;
                    var percentage = (totald - idled)/totald

                    result.cpu = percentage;
                }

                // Mem stats
                result.memory = (statistic.memory.total - statistic.memory.free)/statistic.memory.total * 100;

                // Network stats
                if (previous) {
                    result.network.tx = statistic.network.tx - previous.network.tx;
                    result.network.rx = statistic.network.rx - previous.network.rx;

                    maxvalues.network.tx = Math.max(maxvalues.network.tx, result.network.tx);
                    maxvalues.network.rx = Math.max(maxvalues.network.rx, result.network.rx);
                }

                previous = statistic;

                var bucketidx = Math.round(timed/10);

                if (!buckets[bucketidx]) {
                    buckets[bucketidx] = [];
                }

                buckets[bucketidx].push(result);
            });

            buckets = _.takeRight(buckets, 50);

            //
            vm.stationsStatus.data[station.connected ? 0 : 1]++;

            var clientsStatusCount = _.countBy(station.clients, 'connected');
            vm.clientsStatus.data[0] += clientsStatusCount.true || 0;
            vm.clientsStatus.data[1] += clientsStatusCount.false || 0;
        });

        vm.utilization = _.reduceRight(buckets, function(result, bucket, bucketidx) {
            result.labels.push(bucketidx * 10);

            result.data[0].push(_.meanBy(bucket, 'cpu') || 0);
            result.data[1].push(_.meanBy(bucket, 'memory') || 0);

            var txmean = _(bucket).map(function(s) {
                return s.network.tx / maxvalues.network.tx * 100;
            }).mean() || 0;

            var rxmean = _(bucket).map(function(s) {
                return s.network.rx / maxvalues.network.rx * 100;
            }).mean() || 0;

            result.data[2].push(txmean);
            result.data[3].push(rxmean);

            return result;
        }, {
            labels: [],
            data: [[], [], [], []],
            series: ['CPU Utilization', 'RAM Utilization', 'Network Tx', 'Network Rx']
        });
    }
})();
