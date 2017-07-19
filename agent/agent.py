#!/usr/bin/env python
import re
import json
import time
import threading
import asyncore, socket
import subprocess
import wpactrl
import docker

SERVER_IP='192.168.0.10'
SERVER_PORT=12000

def get_cpu_stats():
    with open('/proc/stat', 'r') as f:
        line = f.readline()
        user, nice, system, idle, iowait, irq, softirq, steal, guest, guest_nice = map(int, line.split()[1:])
        usertime = user - guest
        nicetime = nice - guest_nice
        idlealltime = idle + iowait
        systemalltime = system + irq + softirq
        virtalltime = guest + guest_nice
        totaltime = usertime + nicetime + systemalltime + idlealltime + steal + virtalltime

        return {
            'idle': idlealltime,
            'total': totaltime
        }

def get_mem_stats():
    stats = {}
    units = {
        'kB': 1024,
        'MB': 1024**2
    }

    with open('/proc/meminfo', 'r') as f:
        for line in f:
            key, value, unit = line.split()
            stats[key[:-1]] = int(value) * units[unit]

    return {
        'free': stats['MemFree'],
        'total': stats['MemTotal']
    }

def get_net_stats():
    with open('/sys/class/net/wlan0/statistics/rx_bytes') as f:
        rx_bytes = int(f.read())
    with open('/sys/class/net/wlan0/statistics/tx_bytes') as f:
        tx_bytes = int(f.read())

    return {
        'tx': tx_bytes,
        'rx': rx_bytes
    }

def get_wireless_info():
    ssid = subprocess.check_output(['uci', 'get', 'wireless.@wifi-iface[0].ssid'], stderr=subprocess.STDOUT).strip()
    with open('/sys/class/net/wlan0/address', 'r') as f:
        bssid = f.read().strip()

    return {
        'ssid': ssid,
        'bssid': bssid
    }

def get_clients_info():
    result = {}

    clients = subprocess.check_output(['iw', 'dev', 'wlan0', 'station', 'dump'], stderr=subprocess.STDOUT).strip()
    for client in clients.split('Station')[1:]:
        lines = client.split('\n')
        mac = lines[0].strip().split()[0]
        result[mac] = {}
        for line in lines[1:]:
            if line:
                key, value = line.split(':')
                result[mac][key.strip()] = value.strip()

    return result

class Client(asyncore.dispatcher):
    def __init__(self):
        asyncore.dispatcher.__init__(self)
        self.init_connection()
        self.sched_statistics()

        self.wpa_ctrl_thread = threading.Thread(target=self.wpa_ctrl)
        self.wpa_ctrl_thread.daemon = True
        self.wpa_ctrl_thread.start()

        self.docker_client = docker.from_env()

    def init_connection(self):
        self.create_socket(socket.AF_INET, socket.SOCK_STREAM)
        self.connect((SERVER_IP,SERVER_PORT))
        self.write_buffer = ''
        self.recv_buffer = ''

    def send_msg(self, msg):
        self.write_buffer += json.dumps(msg) + '\n\n'

    def client_connect(self, mac):
        print 'connect', mac
        obj = {
            'type': 'client_connect',
            'client': mac
        }

        self.send_msg(obj)

    def client_disconnect(self, mac):
        print 'disconnect', mac
        obj = {
            'type': 'client_disconnect',
            'client': mac
        }

        self.send_msg(obj)

    def wpa_ctrl(self):
        wpa = wpactrl.WPACtrl('/var/run/hostapd/wlan0')
        wpa.attach()
        while True:
            evt = wpa.recv()
            if not evt:
                print 'breaking no events'
                break

            args = evt.split()
            event_name = args[0][3:]

            {
                'AP-STA-CONNECTED': self.client_connect,
                'AP-STA-DISCONNECTED': self.client_disconnect
            }[event_name](*args[1:])

        wpa.detach()

    def sched_statistics(self):
        t = threading.Timer(10.0, self.send_statistics)
        t.daemon = True
        t.start()


    def send_statistics(self):
        self.sched_statistics()

        obj = {
            'type': 'statistics',
            'cpu': get_cpu_stats(),
            'memory': get_mem_stats(),
            'network': get_net_stats(),
            'clients': get_clients_info()
        }
	self.send_msg(obj)

    def handle_connect(self):
        obj = {
            'type': 'hello',
            'info': get_wireless_info()
        }

        print 'sending hello'
        self.send_msg(obj)

    def handle_close(self):
        self.close()

    def is_running(self, process_name):
        ps = subprocess.Popen("ps", shell=True, stdout=subprocess.PIPE)
        for x in ps.stdout:
            if re.search(process_name, x):
                 return True
        return False

    def is_cont_running(self, cont_name):
        try:
            self.docker_client.containers.get(cont_name)
            return True
        except docker.errors.NotFound:
            return False

    def parental_control(self, start, client):
        if start :
            # Ensure parentalcontrol.py is running in an other process
            if not self.is_running('parentalcontrol.py '+client):
                print 'starting parentalcontrol.py '+ client
                subprocess.Popen(['python', '/root/parentalcontrol.py', client])
        else:
            if self.is_running('parentalcontrol.py ' + client):
                p = subprocess.Popen(['pgrep', '-f', client], stdout=subprocess.PIPE)
                out, err = p.communicate()
                print 'killing process '+ out
                subprocess.Popen("kill "+out, shell=True, stdout=subprocess.PIPE)

    def http_filter(self, start, client):
        cont_name = "http_filter_" + client
        if start :
            if not self.is_cont_running(cont_name):
                subprocess.Popen(['docker', 'run', '-itd', '--cap-add=NET_ADMIN',
                    '--env="LOAD_FACTOR=8.0"', '--env="DELAY=2ms"', '--name',
                    'cont_1', 'glanf/http_filter'])
        else:
            if self.is_cont_running(cont_name):
                docker_client.containers.remove(cont_name)
                print 'killing container '+ cont_name

    def rate_limiter(self, start, client):
        cont_name = "rate_limiter_" + client

        if start :
            if not self.is_cont_running(cont_name):
                subprocess.Popen(['docker', 'run', '-itd', '--cap-add=NET_ADMIN',
                    '--env="LOAD_FACTOR=8.0"', '--env="DELAY=2ms"', '--name',
                    'cont_1', 'glanf/rate_limiter'])
        else:
            if self.is_cont_running(cont_name):
                docker_client.containers.remove(cont_name)
                print 'killing container '+ cont_name


    def start_function(self, msg):
        { 'ratelimiter': self.rate_limiter,
          'http_filter': self.http_filter,
          'parental_control': self.parental_control,
        }[msg['name']](True, msg['client'])

    def stop_function(self, msg):
        { 'ratelimiter': self.rate_limiter,
          'http_filter': self.http_filter,
          'parental_control': self.parental_control,
        }[msg['name']](False, msg['client'])

    def handle_read(self):
        self.recv_buffer += self.recv(8192)

        packets = self.recv_buffer.split('\n\n')
        for packet in packets:
            if packet:
                msg = json.loads(packet)
                {
                    'function_add': self.start_function,
                    'function_delete': self.stop_function
                }[msg['type']](msg)
                print msg

        self.recv_buffer = ''

    def writable(self):
        if not self.connected:  # Hack otherwise asyncore doesn't work
            return True

        return (len(self.write_buffer) > 0)

    def handle_write(self):
        sent = self.send(self.write_buffer)
        print 'sent bytes', sent
        self.write_buffer = self.write_buffer[sent:]

    def handle_error(self):
        print 'Handling connection error, reconnecting ...'
        self.init_connection()

    def handle_close(self):
        print 'Handling connection disconnect, reconnecting ...'
        self.close()
        self.init_connection()

client = Client()
asyncore.loop(timeout=1)
