from netfilterqueue import NetfilterQueue
import struct
import array
import socket
import sys
import subprocess
import signal

client = sys.argv[1]

def printhex(d):
    hex = []
    for c in d:
        hex.append('{:02X}'.format(ord(c)))
    print ''.join(hex)

# checksum functions needed for calculation checksum
def checksum(pkt):
    if len(pkt) % 2 == 1:
        pkt += "\0"
    s = sum(array.array("H", pkt))
    s = (s >> 16) + (s & 0xffff)
    s += s >> 16
    s = ~s
    return s & 0xffff

class IPPacket(object):
    IPStruct = struct.Struct('>BBHHHBBH4s4s')

    def __init__(self):
        self.payload = ''

    @classmethod
    def parse(cls, data):
        pkt = cls()
        vhl, pkt.tos, pkt.length, pkt.identification, flagoffset, pkt.ttl, pkt.proto, pkt.checksum, pkt.source, pkt.destination = cls.IPStruct.unpack_from(data, 0)
        pkt.version = vhl >> 4
        pkt.ihl = vhl & 0xF
        pkt.flags = flagoffset >> 13
        pkt.offset = flagoffset & 0x1FFF
        pkt.payload = data[pkt.ihl*4:]       
        return pkt

    def pack(self):
        buffer = ''
        buffer += IPPacket.IPStruct.pack(
            (self.version << 4) | self.ihl,
            self.tos,
            self.length,
            self.identification,
            (self.flags << 13) | (self.offset),
            self.ttl,
            self.proto,
            self.checksum,
            self.source,
            self.destination
        )
        buffer += self.payload
        return buffer

class UDPPacket(object):
    UDPStruct = struct.Struct('>HHHH')

    @classmethod
    def parse(cls, data):
        pkt = cls()
        pkt.src_port, pkt.dst_port, pkt.length, pkt.checksum = cls.UDPStruct.unpack_from(data, 0)
        pkt.payload = data[cls.UDPStruct.size:]
        return pkt

    def pack(self):
        return UDPPacket.UDPStruct.pack(self.src_port, self.dst_port, self.length, self.checksum) + self.payload

class DNSAdditionalRecord(object):
    ARStruct = struct.Struct('>BHHBBHH')

    @classmethod
    def parse(cls, data, offset=0):
        record = cls()
        record.name, record.type, record.payload_size, record.rcode, record.version, record.z, record.data_length = cls.ARStruct.unpack_from(data, offset)
        return record

    def pack(self):
        return DNSAdditionalRecord.ARStruct.pack(self.name, self.type, self.payload_size, self.rcode, self.version, self.z, self.data_length)

class DNSQueryRecord(object):
    QRStruct = struct.Struct('>HH')

    @classmethod
    def parse(cls, data, offset=0):
        def read_label(data, offset):
            label_len = ord(data[offset])
            label = data[offset+1:offset+1+label_len]
            return label

        def read_labels(data, offset=0):
            labels = []

            label = read_label(data, offset)
            while label:
                labels.append(label)
                offset += len(label) + 1
                label = read_label(data, offset)

            return (labels, offset)

        record = cls()
        record.labels, offset = read_labels(data, offset)
        offset += 1
        record.qtype, record.qclass = cls.QRStruct.unpack_from(data, offset)
        return (record, offset+cls.QRStruct.size)

    def pack(self):
        # The query
        buffer = ''
        for label in self.labels:
            buffer += struct.pack('B', len(label))
            buffer += label
        buffer += struct.pack('B', 0) # end of labels

        buffer += DNSQueryRecord.QRStruct.pack(self.qtype, self.qclass)
        return buffer
        
class DNSAnswerRecord(object):
    ARStruct = struct.Struct('>HHIH')

    def __init__(self, labels=[], qtype=0, qclass=0, ttl=0, data_length=0, data=''):
        self.labels = labels
        self.qtype = qtype
        self.qclass = qclass
        self.ttl = ttl
        self.data_length = data_length
        self.data = data

    @classmethod
    def parse(cls, data, offset=0):
        print 'NYI'

    def pack(self):
        buffer = ''
        for label in self.labels:
            buffer += struct.pack('B', len(label))
            buffer += label
        buffer += struct.pack('B', 0) # end of labels

        buffer += DNSAnswerRecord.ARStruct.pack(self.qtype, self.qclass, self.ttl, self.data_length)
        buffer += self.data
        return buffer

class DNSPacket(object):
    DNSStruct = struct.Struct('>HHHHHH')

    def __init__(self):
        self.query_records = []
        self.answer_records = []
        self.authority_records = []
        self.additional_records = []

    @classmethod
    def parse(cls, data):
        pkt = cls()
        pkt.id, flags, pkt.qdcount, pkt.ancount, pkt.nscount, pkt.arcount = cls.DNSStruct.unpack_from(data, 0)
        pkt.qr = flags >> 15
        pkt.opcode = (flags >> 11) & 0xF
        pkt.aa = (flags >> 10) & 1
        pkt.tc = (flags >> 9) & 1
        pkt.rd = (flags >> 8) & 1
        pkt.ra = (flags >> 7) & 1
        pkt.rcode = flags & 0xF
        pkt.payload = data[cls.DNSStruct.size:]

        offset = 0
        for _ in range(pkt.qdcount):
            record, length = DNSQueryRecord.parse(pkt.payload, offset)
            offset += length
            pkt.query_records.append(record)

        if pkt.nscount > 0:
            print 'NYI'  
      
        for _ in range(pkt.arcount):
            pkt.additional_records.append(DNSAdditionalRecord.parse(pkt.payload, offset))
            offset += DNSAdditionalRecord.ARStruct.size

        return pkt

    def pack(self):
        buffer = ''
        buffer += DNSPacket.DNSStruct.pack(
            self.id,
            (self.qr << 15) | (self.opcode << 11) | (self.aa << 10) | (self.tc << 9) | (self.rd << 8) | (self.ra << 7) | self.rcode,
            self.qdcount,
            self.ancount,
            self.nscount,
            self.arcount
        )

        # The query
        for record in self.query_records:
            buffer += record.pack()

        # The answer
        for record in self.answer_records:
            buffer += record.pack()

        # TODO the ns records

        # The additional records
        for record in self.additional_records:
            buffer += record.pack()

        return buffer


sock = socket.socket(socket.AF_INET, socket.SOCK_RAW, socket.IPPROTO_RAW)

blacklist = set({
    'richard.systems',
    'sigcomm.org',
    'www.facebook.com',
    'hackaday.com'
})

# The callback executed on every packet
def callback(pkt):
    print pkt

    ippkt = IPPacket.parse(pkt.get_payload())
    udppkt = UDPPacket.parse(ippkt.payload)
    dnspkt = DNSPacket.parse(udppkt.payload)    

    if dnspkt.qr == 0: # If it's a DNS query
        domain = '.'.join(dnspkt.query_records[0].labels)
        if domain in blacklist:
            print 'domain blocked'
            pkt.drop()

            dnspkt.qr = 1       # packet is a DNS response
            dnspkt.ancount = 1  # 1 answer record
            dnspkt.answer_records.append(DNSAnswerRecord(
                labels=dnspkt.query_records[0].labels,
                qtype=1,
                qclass=1,
                ttl=0,
                data_length=4,
                data=socket.inet_aton('192.168.0.10')
            ))
            dnspkt_data = dnspkt.pack()

            ####
            respip = IPPacket()
            respip.version = 4
            respip.ihl = 5
            respip.tos = 0
            respip.length = 0 # kernel will fill the length
            respip.identification = 0
            respip.flags = 0
            respip.offset = 0
            respip.ttl = 255
            respip.proto = socket.IPPROTO_UDP
            respip.checksum = 0
            respip.source = ippkt.destination
            respip.destination = ippkt.source

            respudp = UDPPacket()
            respudp.src_port = 53
            respudp.dst_port = udppkt.src_port
            respudp.length = len(dnspkt_data) + UDPPacket.UDPStruct.size
            respudp.checksum = 0
            respudp.payload = dnspkt_data

            psh = struct.pack('>4s4sBBH', respip.source, respip.destination, 0, respip.proto, respudp.length)
            psh = psh + respudp.pack()
 
            udp_check = checksum(psh)
            respudp.checksum = udp_check

            respip.payload = respudp.pack()

            sock.sendto(respip.pack(), (socket.inet_ntoa(ippkt.source), 0))
        else:
            pkt.accept()
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
    subprocess.check_output(["iptables", "-C", "INPUT", "-m", "mac", "--mac-source", client, "-j", "NFQUEUE", "-p", "udp", "--destination-port", "53", "--queue-num", str(queue_num)])
except subprocess.CalledProcessError as e:
    if e.returncode != 0:
        print 'adding iptables rule for parental control filter'
        subprocess.Popen("iptables -I INPUT -m mac --mac-source " + client + " -j NFQUEUE -p udp --destination-port 53 --queue-num "+ str(queue_num), shell=True)
        subprocess.Popen("iptables -I INPUT -m mac --mac-source " + client + " -j NFQUEUE -p tcp --destination-port 53 --queue-num "+ str(queue_num), shell=True)

def signal_term_handler(signal, frame):
    print 'sigterm handler activated'
    subprocess.Popen("iptables -D INPUT -m mac --mac-source " + client + " -j NFQUEUE -p udp --destination-port 53 --queue-num "+ str(queue_num), shell=True)
    subprocess.Popen("iptables -D INPUT -m mac --mac-source " + client + " -j NFQUEUE -p tcp --destination-port 53 --queue-num "+ str(queue_num), shell=True)
    sys.exit(0)

signal.signal(signal.SIGTERM, signal_term_handler)

try:
    nfqueue.run()
except KeyboardInterrupt:
    print

