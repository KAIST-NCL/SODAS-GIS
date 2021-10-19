
const { parentPort, workerData } = require('worker_threads');

const dh = require('./api/dhnode');
const knode = require('./kademlia/knode');
const bootstrap = require(__dirname+'/proto/bootstrap');

exports.DHSearch = function(){

    parentPort.on('message', this.dhDaemonListener)

};

exports.DHSearch.prototype.run = function(){

};

const bootstrapServerIP = '127.0.0.1:50051';
const desc = {
    address: null,
    port: null
};
desc.address = dh.getIpAddress();
desc.port = parseInt(process.argv[2]);
const seedNode = dh.seedNodeInfo(desc);

var node = new knode.KNode(desc);
var seedNodeList;

async function bootstrap_process() {

    let init = await bootstrap.Init(bootstrapServerIP);
    await new Promise((resolve, reject) => setTimeout(resolve, 2000));

    seedNodeList = await bootstrap.GetSeedNodeList(seedNode);
    await new Promise((resolve, reject) => setTimeout(resolve, 2000));

    let close = await bootstrap.Close()

    let DP = discover_process(seedNodeList)

    return null;
}

async function discover_process(seedNodeList) {

    console.log("self is:")
    console.log(node.self)
    console.log(seedNodeList)

    for (const seedNodeIndex of seedNodeList) {
        var connect = await node.connect(seedNodeIndex.address, seedNodeIndex.port)
        await new Promise((resolve, reject) => setTimeout(resolve, 2000));
    }


    // let set = await node.set("10.0.1.141:55555", "55555")
    // await new Promise((resolve, reject) => setTimeout(resolve, 2000));

    // let get = await node.get('10.0.1.141:9000', function(err, data) {
    //     console.log("Retrieved", data, "from DHT");
    //     console.log(data == '9000');
    // });

    return null;

}

bootstrap_process()

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
