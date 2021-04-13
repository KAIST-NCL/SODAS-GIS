
const KBucket = require('k-bucket')
const JSONSocket = require('udp-json');
const dgram = require('dgram');
const enc = new TextDecoder("utf-8");
const func = require('./kBucketFunc.js')

const SERVER_NAME = process.argv[2];
const SERVER_PORT = process.argv[3];
const SERVER_HOST = '127.0.0.1';

const kBucket = new KBucket({
    localNodeId: Buffer.from(SERVER_NAME) // default: random data
})

const contact = {
    id: Buffer.from(SERVER_NAME),
    workerNodes: {
    }
};

kBucket.add(contact);
const serverContact = kBucket.get(Buffer.from(SERVER_NAME))

// Listener socket
const socket = dgram.createSocket('udp4');
socket.bind(SERVER_PORT, SERVER_HOST);
console.log("New Data Hub", SERVER_NAME, "On (", SERVER_HOST, ":", SERVER_PORT, ")");
func.contactToString(serverContact);
const jsonSocket = new JSONSocket(socket);

jsonSocket.on('message-complete', (msg, rinfo) => {
    if (msg.request === "ping"){
        console.log('============================== Request Ping ===============================');
        console.log("Ping Test from Bootstrap");
        jsonSocket.send({ request: "ping", uid: SERVER_NAME }, rinfo.port, rinfo.address, (e) => {
            if (e) {
                console.log('error', e);
                return;
            }
        });
        console.log('===========================================================================');
    }
    else if (msg.request === "contact"){
        console.log('============================= Update Contact ==============================');
        console.log('[Node Info]', rinfo);
        const arr = new Uint8Array(msg.contact.id.data);
        console.log('[Node Name]', enc.decode(arr));
        console.log('[Bucket List]');
        console.log(msg.contact.workerNodes);
        func.arbiter(serverContact, msg.contact);
        console.log("[UPDATE KNOWN HOST LIST]");
        func.contactToString(serverContact);
        console.log('===========================================================================');
    }
    else if (msg.request === "delete"){
        console.log('======================== Connect Fail Node Delete =========================');
        delete serverContact.workerNodes[msg.uid]
        console.log("[DELETE KNOWN HOST] ", msg.uid)
        func.contactToString(serverContact);
        console.log('===========================================================================');
    }
});

jsonSocket.on('message-error', (e) => {
    console.log('Error', e);
});

jsonSocket.on('message-timeout', (e) => {
    console.log('Error', e);
});
//
// const clientSocket = dgram.createSocket('udp4');
// const clientJsonSocket = new JSONSocket(clientSocket, {maxPayload: 496, timeout: 1000});

jsonSocket.send({ request: "join", uid: SERVER_NAME }, 56554, '127.0.0.1', (e) => {
    if (e) {
        console.log('error', e);
        return;
    }
    console.log('[CONNECT TO BOOTSTRAP SERVER & RECEIVE KNOWN HOST LIST]');
});
