angular.module('app', [
    'ngResource',
    'ui.bootstrap',
    'ui.router',
    'chart.js',
    'ngVis'
]).config(['$stateProvider', '$urlRouterProvider', function($stateProvider, $urlRouterProvider) {
    $stateProvider
        .state('overview', {
            url: '/',
            templateUrl: 'app/overview/overview.html',
            controller: 'OverviewController',
            controllerAs: 'vm',
            fullscreen: true,
            resolve: {
                stations: ['Stations', function(Stations) {
                    return Stations.get().$promise;
                }]
            }
        })
        .state('functions', {
            abstract: true,
            template: '<div ui-view></div>'
        })
        .state('functions.home', {
            url: '/functions',
            templateUrl: 'app/functions/functions.html',
            controller: 'FunctionsController',
            controllerAs: 'vm',
            resolve: {
                stations: ['Stations', function(Stations) {
                    return Stations.get().$promise;
                }]
            }
        })
        .state('functions.client', {
            url: '/functions/:mac',
            templateUrl: 'app/functions/client.html',
            controller: 'ClientFunctionsController',
            controllerAs: 'vm',
            resolve: {
                client: ['Clients', '$stateParams', function(Clients, $stateParams) {
                    return Clients.get({id: $stateParams.mac}).$promise;
                }]
            }
        })
        .state('stations', {
            abstract: true,
            template: '<div ui-view></div>'
        })
        .state('stations.home', {
            url: '/stations',
            templateUrl: 'app/stations/stations.html',
            controller: 'StationsController',
            controllerAs: 'vm',
            resolve: {
                stations: ['Stations', function(Stations) {
                    return Stations.get().$promise;
                }]
            }
        })
        .state('stations.device', {
            url: '/stations/:bssid',
            templateUrl: 'app/stations/station.html',
            controller: 'StationController',
            controllerAs: 'vm',
            resolve: {
                station: ['Stations', '$stateParams', function(Stations, $stateParams) {
                    return Stations.get({id: $stateParams.bssid}).$promise;
                }]
            }
        });

        $urlRouterProvider.otherwise('/');
}])
.run(['$rootScope', function($rootScope) {
    $rootScope.$on('$stateChangeStart', function(event, toState, toParams, fromState, fromParams, options) {
        $rootScope.fullscreen = !!toState.fullscreen;
        // transitionTo() promise will be rejected with
        // a 'transition prevented' error
    });
}]);
