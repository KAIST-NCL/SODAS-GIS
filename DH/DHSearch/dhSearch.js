
const PROTO_PATH = __dirname+'/proto/bootstrap.proto';
const { parentPort, workerData } = require('worker_threads');
const dh = require(__dirname+'/api/dhnode');
const knode = require(__dirname+'/kademlia/knode');
const dhsearch = require(__dirname+'/dhSearch');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const debug = require('debug')('sodas:dhSearch');

exports.DHSearch = function(){

    self = this;
    parentPort.on('message', function(message) {self._dhDaemonListener(message)});

    this.ip = workerData.dm_ip;
    this.dsPortNum = workerData.dsPortNum;
    this.slPortNum = workerData.slPortNum;
    this.bootstrapServerIp = workerData.bootstrapIp + ':' + workerData.bootstrapPortNum;

    this.seedNode = dh.seedNodeInfo({address: this.ip, port: parseInt(workerData.dsPortNum), sl_portNum: parseInt(workerData.slPortNum)});
    this.node = new knode.KNode({address: this.ip, port: parseInt(workerData.dsPortNum), sl_portNum: parseInt(workerData.slPortNum), sync_interest_list: []});
    this.node._updateContactEvent.on('update_contact', () => {
        this._dmUpdateBucketList()
    });
    this.seedNodeList = [];
    this.oldBucketList = [];

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
    this.bootstrapClient = new this.BSproto(this.bootstrapServerIp, grpc.credentials.createInsecure());
    debug('[SETTING] DHSearch is running with %s:%s', this.ip, this.dsPortNum);

};
exports.DHSearch.prototype.run = function(){
    this._bootstrapProcess().then(r => {
        this._discoverProcess();
    });
};

/* Worker threads Listener */
exports.DHSearch.prototype._dhDaemonListener = function(message){
    switch (message.event) {
        case 'UPDATE_INTEREST_TOPIC':
            this.seedNode['sync_interest_list'] = message.data.syncInterestList;
            this.node.self.syncInterestList = message.data.syncInterestList;
            debug('[LOG] DHSearch thread receive [UPDATE_INTEREST_TOPIC] event from DHDaemon');
            this.run()
            break;
        default:
            debug('[ERROR] DHDaemon Listener Error ! event:', message.event);
            break;
    }
};

/* DHDaemon methods */
exports.DHSearch.prototype._dmUpdateBucketList = function(){
    if (this.old_bucket_list !== JSON.stringify(this.node._buckets)) {
        parentPort.postMessage({
            event: 'UPDATE_BUCKET_LIST',
            data: this.node._buckets
        });
        this.oldBucketList = JSON.parse(JSON.stringify(this.node._buckets));
    }
};

/* gRPC methods */
exports.DHSearch.prototype.getSeedNode = function(seedNode) {
    var promise = new Promise((resolve, reject) => dhSearch.bootstrapClient.GetSeedNodeList(seedNode, function(err, response) {
        if(err) {
            return reject(err)
        }
        resolve(response)
    }))
    return promise
}

/* DHSearch methods */
exports.DHSearch.prototype._bootstrapProcess = async function() {
    await this.getSeedNode(this.seedNode).then((value => {
        dhSearch.seedNodeList = JSON.parse(JSON.stringify( value.nodes ));
        debug('[LOG] DHSearch request seed node list info to bootstrap server')
        debug(value.nodes)
    }));
    return null;
}
exports.DHSearch.prototype._discoverProcess = async function() {
    debug('[LOG] Start distributed search')
    for (var seedNodeIndex of this.seedNodeList) {
        var connect = await this.node.connect(seedNodeIndex.address, seedNodeIndex.port, seedNodeIndex.slPortNum, seedNodeIndex.syncInterestList);
    }
    return null;
}
exports.DHSearch.prototype._setInterestTopic = function() {
    // todo: InterestTopic 정보 받아와서 노드 ID 반영 및 kademlia set/get 수행 로직
}

const dhSearch = new dhsearch.DHSearch()
