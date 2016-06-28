var net = require('net');
var http = require('http');
var express = require('express');
var bodyParser = require('body-parser');
var path = require('path');
var _ = require('lodash');

var stationConnections = {};
var database = {
    stations: {},
    clients: {},
    history: []
};

function addHistory(type, msg) {
    database.history.push({
        type: type,
        msg: msg,
        time: new Date()
    });
}

var app = express();
app.set('port', process.env.PORT || 8080);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/stations/:id', function(req, res, next) {
    res.send(database.stations[req.params.id]);
});

app.get('/api/stations', function(req, res, next) {
    res.send(database.stations);
});

app.get('/api/clients/:id', function(req, res, next) {
    res.send(database.clients[req.params.id]);
});

app.post('/api/clients/:id/functions', function(req, res, next) {
    var client = database.clients[req.params.id];
    if (!client) {
        return res.status(404).send('Sorry cant find that!');
    }

    //
    stationConnections[client.station].write(JSON.stringify({
        type: 'function_add',
        name: req.body.policy,
        client: req.params.id
    }) + '\n\n');

    client.policies.push(req.body);
    return res.send(client);
});

app.delete('/api/clients/:id/functions/:name', function(req, res, next) {
    var client = database.clients[req.params.id];
    if (!client) {
        return res.status(404).send('Sorry cant find that!');
    }

    //
    stationConnections[client.station].write(JSON.stringify({
        type: 'function_delete',
        name: req.params.name,
        client: req.params.id
    }) + '\n\n');

    client.policies = _.reject(client.policies, { policy: req.params.name });
    return res.send(client);
});

app.get('/api/clients', function(req, res, next) {
    res.send(database.clients);
});

app.get('/api/history', function(req, res, next) {
    res.send(database.history);
});

var httpServer = http.createServer(app);
var tcpServer = net.createServer();

var tcpHandlers = {
    hello: function(conn, msg) {
        conn.station = {
            connected: true,
            statistics: [],
            clients: []
        };

        conn.station.ssid = msg.info.ssid;
        conn.station.bssid = msg.info.bssid;

        database.stations[conn.station.bssid] = conn.station;
        stationConnections[conn.station.bssid] = conn;
    },

    statistics: function(conn, msg) {
        if (!conn.station) {
            return;
        }

        if (conn.station.statistics.length > 50) {
            conn.station.statistics.shift();
        }

        // for all the clients stats we are receiving
        _.forEach(msg.clients, function(value, mac) {
            var client = database.clients[mac];
            if (client && client.station === conn.station.bssid) {
                if (client.statistics.length > 50) {
                    client.statistics.shift();
                }

                value.time = new Date();
                client.statistics.push(value);
            }
        });
        delete msg.clients;

        delete msg.type;
        msg.time = new Date();
        conn.station.statistics.push(msg);
    },

    disconnect: function(conn, msg) {
        if (conn.station) {
            conn.station.connected = false;
        }
    },

    client_connect: function(conn, msg) {
        if (!conn.station) {
            console.log('station associated to this client is unknown');
            return;
        }

        var client = database.clients[msg.client];

        if (!client) {
            client = database.clients[msg.client] = {
                mac: msg.client,
                last_event: new Date(),
                type: 'mobile',
                policies: []
            };
        }

        client.connected = true;
        client.last_event = new Date();
        client.statistics = []; // Clean the previous statistics

        if (client.station) {
            _.remove(database.stations[client.station].clients, _.matches({ mac: client.mac }));
        }

        client.station = conn.station.bssid;
        conn.station.clients.push(client);

        //
        _.forEach(client.policies, function(policy) {
            conn.write(JSON.stringify({
                type: 'function_add',
                name: policy.policy,
                client: client.mac
            }) + '\n\n');
        });
    },

    client_disconnect: function(conn, msg) {
        var client = database.clients[msg.client];

        if (client) {
            //
            _.forEach(client.policies, function(policy) {
                conn.write(JSON.stringify({
                    type: 'function_delete',
                    name: policy.policy,
                    client: client.mac
                }) + '\n\n');
            });

            client.connected = false;
        } else {
            console.log('unknown client');
        }
    }
};

tcpServer.on('connection', function(conn) {
    console.log('new connection');

    var rx_buffer = '';

    conn.on('data', function(buffer) {
        rx_buffer += buffer.toString('utf8');

        var end_idx = rx_buffer.indexOf('\n\n');
        while(end_idx !== -1) {
            packet = rx_buffer.substring(0, end_idx);
            rx_buffer = rx_buffer.substr(end_idx + 2);

            obj = JSON.parse(packet);

            var handler = tcpHandlers[obj.type];
            if (handler) {
                handler(conn, obj);
            }

            end_idx = rx_buffer.indexOf('\n\n');
        }

    });

    conn.on('end', function() {
        tcpHandlers['disconnect'](conn, null);
    });
});

tcpServer.listen(12000, '0.0.0.0', function() {
    console.log('Started TCP on port 12000');
    addHistory('info', 'GNF TCP server has been started');
});

httpServer.listen(app.get('port'), function() {
    console.log('Started HTTP server on port', app.get('port'));
    addHistory('info', 'HTTP server has been started');
});
