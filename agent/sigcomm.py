from netfilterqueue import NetfilterQueue
import sys
import signal
import subprocess

client = sys.argv[1]

# The callback executed on every packet
def callback(pkt):
    if 'GET /sigcomm/2016/' in pkt.get_payload():
        print pkt
        pkt.drop()
    else:
        pkt.accept()

nfqueue = NetfilterQueue()

connected = False
queue_num = 1
while not connected:
    try:
        nfqueue.bind(queue_num, callback)
        connected = True
    except OSError:
        queue_num = queue_num + 1

# setting up iptables rule                   
try:                      
    subprocess.check_output(["iptables", "-C", "FORWARD", "-m", "mac", "--mac-source", client, "-j", "NFQUEUE", "-p", "tcp", "--destination-port", "80", "--queue-num", str(queue_num)])
except subprocess.CalledProcessError as e:                                                                                                                                   
    if e.returncode != 0:                
        print 'adding iptables rule for sigcomm http filter'
        subprocess.Popen("iptables -I FORWARD -m mac --mac-source " + client + " -j NFQUEUE -p tcp --destination-port  80 --queue-num "+ str(queue_num), shell=True)
 
def signal_term_handler(signal, frame):
    print 'sigterm handler activated'
    subprocess.Popen("iptables -D FORWARD -m mac --mac-source " + client + " -j NFQUEUE -p tcp --destination-port  80 --queue-num "+ str(queue_num), shell=True)
    sys.exit(0)
 
signal.signal(signal.SIGTERM, signal_term_handler)

try:
    nfqueue.run()
except KeyboardInterrupt:
    print
