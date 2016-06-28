(function() {
    'use strict';

    angular
        .module('app')
        .factory('policies', factory);

    factory.$inject = [];

    /* @ngInject */
    function factory() {
        return {
            ratelimiter: {
                repository: 'ratelimiter',
                img: 'images/functions/ratelimiter.png',
                name: 'Rate Limiter',
                description: 'Using the Linux tc utility, this NF limits the download speed for specific clients. By default, it limits to 4Mbit/s.',
                disabled: false
            },

            firewall: {
                repository: 'firewall',
                img: 'images/functions/firewall.png',
                name: 'Firewall',
                description: 'Utilising the famous iptables firewall of the Linux kernel, this NF can filter on specific ports, source and destinations.',
                disabled: true
            },

            http_filter: {
                repository: 'http_filter',
                img: 'images/functions/http_filter.gif',
                name: 'HTTP filter',
                description: 'Using netfilter queues, this NF can inspect and modify HTTP packets.',
                disabled: false
            },

            loadsim: {
                repository: 'loadsim',
                img: 'images/functions/loadsim.jpg',
                name: 'Loadsim',
                description: 'This NF behaves as a wire does, but with additional delay added and load performed for each packet which passes through the device.',
                disabled: true
            },

            loadbalancer: {
                repository: 'loadbalancer',
                img: 'images/functions/loadbalancer.png',
                name: 'Load Balancer',
                description: 'This is a transparent DNS load balancer. It returns configured IP using Round Robin for a selected DNS record.',
                disabled: true
            }
        };
    }
})();
