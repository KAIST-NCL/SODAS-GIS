
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

    this.ip = workerData.dmIp;
    this.dsPortNum = workerData.dsPortNum;
    this.slPortNum = workerData.slPortNum;
    this.bootstrapServerIp = workerData.bootstrapIp + ':' + workerData.bootstrapPortNum;

    this.seedNode = dh.seedNodeInfo({address: this.ip, port: parseInt(workerData.dsPortNum), slPortNum: parseInt(workerData.slPortNum)});
    this.node = new knode.KNode({address: this.ip, port: parseInt(workerData.dsPortNum), slPortNum: parseInt(workerData.slPortNum), syncInterestList: [], metadata: null});
    this.node._updateContactEvent.on('update_contact', () => {
        this._dmUpdateBucketList()
    });
    this.seedNodeList = [];
    this.oldBucketList = [];
    this.syncInterestList = [];
    this.metadata = null;

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
            this.syncInterestList = message.data.syncInterestList.interestTopic;
            this.seedNode['syncInterestList'] = message.data.syncInterestList.interestTopic;
            this.node.self.syncInterestList = message.data.syncInterestList.interestTopic;
            this.metadata = message.data.syncInterestList.content;
            this.seedNode['metadata'] = message.data.syncInterestList.content;
            this.node.self.metadata = message.data.syncInterestList.content;
            debug('[LOG] DHSearch thread receive [UPDATE_INTEREST_TOPIC] event from DISDaemon');
            this.run()
            break;
        case 'DIS_STOP':
            debug('[LOG] DHSearch thread receive [DIS_STOP] event from DISDaemon');
            this.node.delete(this.ip, parseInt(this.dsPortNum), parseInt(this.slPortNum), this.syncInterestList, this.metadata);
            dhSearch.bootstrapClient.DeleteSeedNode(this.seedNode, function(err, response) {
                if (!err) {
                    debug(response);
                } else {
                    debug('[ERROR]', err);
                }
            })
            break;
        default:
            debug('[ERROR] DISDaemon Listener Error ! event:', message.event);
            break;
    }
};

/* DHDaemon methods */
exports.DHSearch.prototype._dmUpdateBucketList = function(){
    if (this.oldBucketList !== JSON.stringify(this.node._buckets)) {
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
        var connect = await this.node.connect(seedNodeIndex.address, seedNodeIndex.port, seedNodeIndex.slPortNum, seedNodeIndex.syncInterestList, seedNodeIndex.metadata);
    }
    return null;
}
exports.DHSearch.prototype._setInterestTopic = function() {
    // todo: InterestTopic 정보 받아와서 노드 ID 반영 및 kademlia set/get 수행 로직
}

const dhSearch = new dhsearch.DHSearch()
