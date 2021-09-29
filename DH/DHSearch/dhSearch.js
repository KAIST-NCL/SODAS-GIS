const dh = require(__dirname+'/api/dhnode');
const bootstrap = require(__dirname+'/proto/bootstrap');
const knode = require(__dirname+'/kademlia/knode');
const { parentPort, MessagePort, getEnvironmentData } = require('worker_threads');

const bootstrap_server = getEnvironmentData('rh_bs');
const bootstrapServerIP = typeof(bootstrap_server) == 'undefined'? "127.0.0.1:50051": bootstrap_server;
const port = getEnvironmentData('ds_port');
const desc = {
    address: null,
    port: null
};
desc.address = dh.getIpAddress();
desc.port =  typeof (port) == 'undefined'? parseInt(process.argv[2]): parseInt(port);
const seedNode = dh.seedNodeInfo(desc);

// thread setting
const { port1, port2 } = new MessageChannel();
let daemonServeListeningPort  = port1;
let daemonServerPort;

parentPort.postMessage({
    port: port2,
}, [port2]);
parentPort.on('message', value => {
    if (value.port){
        daemonServerPort = value.port;
        daemonServerPort.postMessage({msg: 'i am dhSearch!'});
        console.log('[dhSearch] daemonServer MSG channel setting is complete');
        return;
    }
});
daemonServeListeningPort.on('message', (value) => {
    console.log('[dhSearch: msg-print] '+value.msg);
});


//dhSearch
var node = new knode.KNode(desc);
var seedNodeList;

async function bootstrap_process() {

    let init = await bootstrap.Init(bootstrapServerIP);
    await new Promise((resolve, reject) => setTimeout(resolve, 2000));

    seedNodeList = await bootstrap.GetSeedNodeList(seedNode);
    await new Promise((resolve, reject) => setTimeout(resolve, 2000));

    let close = await bootstrap.Close();
    let DP = discover_process(seedNodeList);

    return null;
}

async function discover_process(seedNodeList) {

    // console.log("self is:");
    // console.log(node.self);
    // console.log(seedNodeList);

    for (const seedNodeIndex of seedNodeList) {
        var connect = await node.connect(seedNodeIndex.address, seedNodeIndex.port);
        await new Promise((resolve, reject) => setTimeout(resolve, 2000));
    }

    return null;
}

bootstrap_process();
