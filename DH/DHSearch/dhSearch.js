
const PROTO_PATH = __dirname+'/proto/bootstrap.proto';
const { parentPort, workerData } = require('worker_threads');
const dh = require(__dirname+'/api/dhnode');
const knode = require(__dirname+'/kademlia/knode');
const dhsearch = require(__dirname+'/dhSearch');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

exports.DHSearch = function(){

    self = this;
    parentPort.on('message', function(message) {self._dhDaemonListener(message)});

    this.ip = workerData.dm_ip;
    this.ds_portNum = workerData.ds_portNum;
    this.sl_portNum = workerData.sl_portNum;
    this.bootstrap_server_ip = workerData.bootstrap_ip + ':' + workerData.bootstrap_portNum;

    this.seedNode = dh.seedNodeInfo({address: this.ip, port: parseInt(workerData.ds_portNum)});
    this.node = new knode.KNode({address: this.ip, port: parseInt(workerData.ds_portNum)});
    this.node._updateContactEvent.on('update_contact', () => {
        this._dmUpdateBucketList()
    });
    this.seedNodeList = [];

    const packageDefinition = protoLoader.loadSync(
        PROTO_PATH,{
            keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true
        });
    this.protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
    this.BSproto = this.protoDescriptor.bootstrap.BootstrapBroker;
    this.bootstrapClient = new this.BSproto(this.bootstrap_server_ip, grpc.credentials.createInsecure());
    console.log('[SETTING] DHSearch is running with %s:%s', dh.getIpAddress(), this.ds_portNum);

};
exports.DHSearch.prototype.run = function(){
    this._bootstrapProcess().then(r => {
        this._closeConnection();
        this._discoverProcess();
    });
};

/* Worker threads Listener */
exports.DHSearch.prototype._dhDaemonListener = function(message){
    switch (message.event) {
        case 'UPDATE_INTEREST_TOPIC':
            this.run()
            this.sync_interest_list = message.data.sync_interest_list;
            console.log(this.sync_interest_list);
            // this._setInterestTopic()
            break;
        default:
            console.log('[ERROR] DH Daemon Listener Error ! event:', message.event);
            break;
    }
};

/* DHDaemon methods */
exports.DHSearch.prototype._dmUpdateBucketList = function(){
    parentPort.postMessage({
        event: 'UPDATE_BUCKET_LIST',
        data: this.node._buckets
    });
};

/* gRPC methods */
exports.DHSearch.prototype._setSeedNode = function(seedNode) {
    dhSearch.bootstrapClient.SetSeedNode(seedNode, (error, response) => {
        if (!error) {
            console.log('Send node info to bootstrap server');
            console.log(seedNode);
            console.log(response.message);
        } else {
            console.error(error);
        }
    });
}
exports.DHSearch.prototype._getSeedNode = function(seedNode) {
    var promise = new Promise((resolve, reject) => dhSearch.bootstrapClient.GetSeedNodeList(seedNode, function(err, response) {
        if(err) {
            return reject(err)
        }
        resolve(response)
    }))
    return promise
}
exports.DHSearch.prototype._closeConnection = function() {
    grpc.closeClient(this.bootstrapClient);
    console.log('gRPC session closed with bootstrap server');
}

/* DHSearch methods */
exports.DHSearch.prototype._bootstrapProcess = async function() {
    await this._getSeedNode(this.seedNode).then((value => {
        dhSearch.seedNodeList = JSON.parse(JSON.stringify( value.nodes ));
    }));
    return null;
}
exports.DHSearch.prototype._discoverProcess = async function() {
    for (var seedNodeIndex of this.seedNodeList) {
        var connect = await this.node.connect(seedNodeIndex.address, seedNodeIndex.port);
        // await new Promise((resolve, reject) => setTimeout(resolve, 2000));
    }
    await this._dmUpdateBucketList();
    return null;
}
exports.DHSearch.prototype._setInterestTopic = function() {
    // todo: InterestTopic 정보 받아와서 노드 ID 반영 및 kademlia set/get 수행 로직
}

const dhSearch = new dhsearch.DHSearch()
