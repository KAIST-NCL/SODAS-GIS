
const KBucket = require('k-bucket')
const JSONSocket = require('udp-json');
const dgram = require('dgram');
const enc = new TextDecoder("utf-8");
const func = require('./kBucketFunc.js')

const SERVER_NAME = 'BOOTSTRAP#1'
const SERVER_PORT = 56554;
const SERVER_HOST = '127.0.0.1';

const pingServer = [];

const kBucket = new KBucket({
    localNodeId: Buffer.from(SERVER_NAME) // default: random data
})

const contact = {
    id: Buffer.from(SERVER_NAME),
    workerNodes: {
        'SODAS#1': { host: '127.0.0.1', port: 55555 },
        'SODAS#2': { host: '127.0.0.1', port: 55556 }
    }
};

kBucket.add(contact)
const serverContact = kBucket.get(Buffer.from(SERVER_NAME))

// Listener socket%
const socket = dgram.createSocket('udp4');
socket.bind(SERVER_PORT, SERVER_HOST);
console.log("[SERVER ON] Bootstrap Server", SERVER_NAME, "On (", SERVER_HOST, ":", SERVER_PORT, ")");
const jsonSocket = new JSONSocket(socket);

jsonSocket.on('message-complete', (msg, rinfo) => {
    if (msg.request === "ping"){
        console.log("[PING CHECK] Ping Test from", msg.uid, "OK!");
        for(let i = 0; i < pingServer.length; i++) {
            if(pingServer[i] === msg.uid)  {
                pingServer.splice(i, 1);
                i--;
            }
        }
    }
    else if (msg.request === "join"){
        console.log('============================== Request Join ===============================');

        console.log("[NEW DATA HUB JOIN] ", msg, " Join");
        console.log("[UPDATE KNOWN HOST LIST]");
        serverContact.workerNodes[msg.uid] = { host: rinfo.address, port: rinfo.port };
        func.contactToString(serverContact);

        for (var key in serverContact.workerNodes){
            const clientSocket = dgram.createSocket('udp4');
            const clientJsonSocket = new JSONSocket(clientSocket, {maxPayload: 496, timeout: 1000});
            clientJsonSocket.send({ request: "contact", contact: serverContact },
                serverContact.workerNodes[key].port,
                serverContact.workerNodes[key].host, (e) => {
                if (e) {
                    console.log('error', e);
                    return;
                }
                clientSocket.close();
            });
        }
        console.log('===========================================================================');
    }
});

jsonSocket.on('message-error', (e) => {
    console.log('Error', e);
});

jsonSocket.on('message-timeout', (e) => {
    console.log('Error', e);
});

setInterval(function() {

    for(let i = 0; i < pingServer.length; i++) {
        console.log('========================= Connect Fail Node Delete ==========================');
        delete serverContact.workerNodes[pingServer[i]]
        console.log("[DELETE KNOWN HOST] ", pingServer[i])
        for (var key in serverContact.workerNodes) {
            jsonSocket.send({ request: "delete", uid: pingServer[i] },
                serverContact.workerNodes[key].port, serverContact.workerNodes[key].host, (e) => {
                if (e) {
                    console.log('error', e);
                    return;
                }
            });
        }
        console.log('=============================================================================');
    }
    pingServer.length = 0
    func.contactToString(serverContact);
    console.log("[PING CHECK START]")
    for (var key in serverContact.workerNodes) {
        pingServer.push(key)
        jsonSocket.send({ request: "ping" }, serverContact.workerNodes[key].port,
            serverContact.workerNodes[key].host, (e) => {
            if (e) {
                console.log('error', e);
                return;
            }
        });
    }
    console.log("[PING TEST COMPLETE KNOWN HOST LIST] ", pingServer)
}, 5000)