const PROTO_PATH = __dirname+'/proto/bootstrap.proto';
const { parentPort, workerData } = require('worker_threads');
const dh = require(__dirname+'/api/dhnode');
const knode = require(__dirname+'/kademlia/knode');
const dhsearch = require(__dirname+'/dhSearch');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const debug = require('debug')('sodas:dhSearch\t|');

/**
 * DHSearch
 * @constructor
 */
exports.DHSearch = function(){

    self = this;
    parentPort.on('message', function(message) {self._dhDaemonListener(message)});

    this.ip = workerData.disIp;
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

/**
 * :ref:`dhDaemon` 으로부터 ``UPDATE_INTEREST_TOPIC`` 이벤트 수신 후, GIS BootstrapServer 로부터 SeedNode 리스트 조회 및
 * 조회한 SeedNode end point 를 통해, 분산 탐색 네트워크에 연결하는 로직을 수행함.
 * @method
 * @see DHSearch._updateInterestInfo
 * @see DHSearch._bootstrapProcess
 * @see DHSearch._discoverProcess
 */
exports.DHSearch.prototype.run = function(){
    this._bootstrapProcess().then(r => {
        this._discoverProcess();
    });
};

/**
 * :ref:`dhDaemon` 에서 전달되는 스레드 메시지를 수신하는 이벤트 리스너.
 * @method
 * @param message - dictionary(event, message) 구조의 스레드 메시지
 * @param message:event - ``UPDATE_INTEREST_TOPIC``, ``DIS_STOP``
 * @private
 * @see DHDaemon._dhSearchUpdateInterestTopic
 * @see DHSearch._deleteMyInfoFromKademlia
 * @see DHSearch._updateInterestInfo
 * @see KNode.delete
 */
exports.DHSearch.prototype._dhDaemonListener = function(message){
    switch (message.event) {
        case 'UPDATE_INTEREST_TOPIC':
            if (this.metadata) {
                this._deleteMyInfoFromKademlia().then(r => {
                    this._updateInterestInfo(message.data);
                })
            } else {
                this._updateInterestInfo(message.data);
            }
            break;
        case 'DIS_STOP':
            debug('[LOG] DHSearch thread receive [DIS_STOP] event from DISDaemon');
            this.node.delete(this.ip, parseInt(this.dsPortNum), parseInt(this.slPortNum), this.syncInterestList, this.metadata, true);
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

/**
 * 분산 탐색 네트워크에 연결한 뒤 Bucket 정보가 업데이트될 때마다, Bucket 정보를
 * :ref:`dhDaemon` 로 ``UPDATE_BUCKET_LIST`` 스레드 메시지를 전송함.
 * @method
 * @private
 * @see DHDaemon._dhSearchListener
 */
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
/**
 * GIS BootstrapServer 로 SeedNode 리스트를 조회하는 gRPC client.
 * @method
 * @param seedNode - GIS BootstrapServer 의 SeedNode 리스트에 등록할 자신의 노드 정보
 * @returns Promise - GIS BootstrapServer 로부터 조회한 SeedNode 리스트
 * @see DHSearch._bootstrapProcess
 */
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
/**
 * GIS BootstrapServer 로 SeedNode 리스트를 조회한 결과를 내부 변수 ``seedNodeList`` 에 저장함.
 * @method
 * @private
 * @returns Promise - null
 * @see DHSearch.run
 * @see DHSearch.getSeedNode
 */
exports.DHSearch.prototype._bootstrapProcess = async function() {
    await this.getSeedNode(this.seedNode).then((value => {
        dhSearch.seedNodeList = JSON.parse(JSON.stringify( value.nodes ));
        debug('[LOG] DHSearch request seed node list info to bootstrap server')
        debug(value.nodes)
    }));
    return null;
}

/**
 * GIS BootstrapServer 로부터 조회한 SeedNode 리스트의 DataHub end point 를 통해,
 * 분산 탐색 네트워크에 연결하는 :ref:`kademlia` ``KNode.connect`` 함수를 통해 분산 탐색 네트워크 참여함.
 * @method
 * @private
 * @returns Promise - null
 * @see DHSearch.run
 * @see KNode.connect
 */
exports.DHSearch.prototype._discoverProcess = async function() {
    debug('[LOG] Start distributed search')
    for (var seedNodeIndex of this.seedNodeList) {
        var connect = await this.node.connect(seedNodeIndex.address, seedNodeIndex.port, seedNodeIndex.slPortNum, seedNodeIndex.syncInterestList, seedNodeIndex.metadata);
    }
    return null;
}

/**
 * 분산 탐색 네트워크에서 연결을 해제하는 :ref:`kademlia` ``KNode.delete`` 함수를 통해,
 * 분산 탐색 네트워크의 다른 데이터 허브의 Bucket 에서 해당 데이터 허브의 노드 정보를 삭제 요청함.
 * @method
 * @private
 * @returns Promise - null
 * @see DHSearch._dhDaemonListener
 * @see KNode.delete
 */
exports.DHSearch.prototype._deleteMyInfoFromKademlia = function() {
    return Promise.resolve(this.node.delete(this.ip, parseInt(this.dsPortNum), parseInt(this.slPortNum), this.syncInterestList, this.metadata, false))
}

/**
 * ``UPDATE_INTEREST_TOPIC`` 이벤트 스레드 메시지와 함께 전달된 데이터(관심 동기화 수준, DataHub 메타데이터)를
 * 내부 변수에 업데이트한 뒤, ``Bootstrap-DistributeSearch`` 로직을 수행하는 내부 함수 호출함.
 * @method
 * @private
 * @param messageData - ``UPDATE_INTEREST_TOPIC`` 이벤트 스레드 메시지와 함께 전달된 데이터(관심 동기화 수준, DataHub 메타데이터)
 * @returns Promise - null
 * @see DHSearch._dhDaemonListener
 * @see DHSearch.run
 */
exports.DHSearch.prototype._updateInterestInfo = function(messageData) {
    this.syncInterestList = messageData.syncInterestList.interestTopic;
    this.seedNode['syncInterestList'] = messageData.syncInterestList.interestTopic;
    this.node.self.syncInterestList = messageData.syncInterestList.interestTopic;
    this.metadata = messageData.syncInterestList.content;
    this.seedNode['metadata'] = messageData.syncInterestList.content;
    this.node.self.metadata = messageData.syncInterestList.content;
    debug('[LOG] DHSearch thread receive [UPDATE_INTEREST_TOPIC] event from DISDaemon');
    this.run()
    return null;
}

const dhSearch = new dhsearch.DHSearch()
