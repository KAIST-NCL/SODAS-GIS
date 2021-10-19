
const { parentPort, MessagePort, getEnvironmentData, workerData } = require('worker_threads');

const dh = require(__dirname+'/api/dhnode');
const knode = require(__dirname+'/kademlia/knode');
const bootstrap = require(__dirname+'/proto/bootstrap');

exports.DHSearch = function(){

    parentPort.on('message', this.dhDaemonListener)

};

exports.DHSearch.prototype.run = function(){

};

const bootstrapServerIP = workerData.bootstrap_ip + ':' + workerData.bootstrap_portNum;
const desc = {
    address: null,
    port: null
};
desc.address = dh.getIpAddress();
desc.port =  parseInt(workerData.ds_portNum);
const seedNode = dh.seedNodeInfo(desc);

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

// [DHDaemon -> DHSearch]
exports.DHSearch.prototype.dhDaemonListener = function(message){
    switch (message.event) {
        // DHSearch 초기화
        case 'INIT':
            break;

        case 'UPDATE_INTEREST_TOPIC':
            break;
    }
};
