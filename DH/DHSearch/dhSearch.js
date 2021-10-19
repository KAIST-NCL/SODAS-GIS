
const { parentPort, workerData } = require('worker_threads');

const dh = require(__dirname+'/api/dhnode');
const knode = require(__dirname+'/kademlia/knode');
const bootstrap = require(__dirname+'/proto/bootstrap');
const dhsearch = require(__dirname+'/dhSearch');


//DHSearch
exports.DHSearch = function(){

    parentPort.on('message', this.dhDaemonListener);

    this.ds_portNum = workerData.ds_portNum;
    this.bootstrapServerIP = workerData.bootstrap_ip + ':' + workerData.bootstrap_portNum;

    this.seedNode = dh.seedNodeInfo({address: dh.getIpAddress(), port: parseInt(workerData.ds_portNum)});
    this.node = new knode.KNode({address: dh.getIpAddress(), port: parseInt(workerData.ds_portNum)});
    this.seedNodeList = [];
    console.log('[SETTING] DHSearch is running with %s:%s', dh.getIpAddress(), this.ds_portNum);

};

exports.DHSearch.prototype.run = function(){
    this.bootstrapProcess().then(r => console.log("Bootstrap process is done!"))
};

// [DHDaemon -> DHSearch]
exports.DHSearch.prototype.dhDaemonListener = function(message){
    switch (message.event) {
        // DHSearch 초기화
        case 'INIT':
            break;
        case 'UPDATE_INTEREST_TOPIC':
            break;
        default:
            console.log('[ERROR] DH Daemon Listener Error ! event:', message.event);
            break;
    }
};

exports.DHSearch.prototype.bootstrapProcess = async function() {
    let init = await bootstrap.Init(this.bootstrapServerIP);
    await new Promise((resolve, reject) => setTimeout(resolve, 2000));
    this.seedNodeList = await bootstrap.GetSeedNodeList(this.seedNode);
    await new Promise((resolve, reject) => setTimeout(resolve, 2000));
    console.log(dhSearch)
    let close = await bootstrap.Close();
    return null;
}

exports.DHSearch.prototype.discoverProcess = async function() {
    for (var seedNodeIndex of this.seedNodeList) {
        var connect = await node.connect(seedNodeIndex.address, seedNodeIndex.port);
        await new Promise((resolve, reject) => setTimeout(resolve, 2000));
    }
    return null;
}

const dhSearch = new dhsearch.DHSearch()
dhSearch.run()
