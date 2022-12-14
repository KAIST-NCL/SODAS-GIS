const PROTO_PATH = __dirname+'/proto/bootstrap.proto';
const bs = require(__dirname+'/bootstrapServer');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { Worker, workerData, parentPort} = require("worker_threads");
const debug = require('debug')('sodas:bootstrap_server');

/**
 * BootstrapServer
 * @constructor
 */
exports.BootstrapServer = function () {

    // de-coment the below code when you use bare-metal version
    this.bootstrapServerIP = workerData.bsIp + ':' + workerData.bsPortNum;
    const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
    });
    this.protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
    this.BSproto = this.protoDescriptor.bootstrap.BootstrapBroker;
    this.seedNodeList = []

};

/* DHDaemon methods */
/**
 * DIS DHSearch 로부터 SeedNode 리스트 조회 및 SeedNode 정보 삭제 요청에 의해 SeedNode 리스트가 업데이트된 경우,
 * :ref:`gsDaemon` 으로 업데이트된 SeedNode 리스트를 ``UPDATE_SEEDNODE_LIST`` 이벤트 스레드 메시지로 전달함.
 * @method
 * @private
 * @see GSDaemon._bsServerListener
 */
exports.BootstrapServer.prototype._dmUpdateSeedNodeList = function () {
    // [BootstrapServer -> GSDaemon] [UPDATE_SEEDNODE_LIST]
    debug('[TX: UPDATE_SEEDNODE_LIST] to GSDaemon')
    parentPort.postMessage({
        event: "UPDATE_SEEDNODE_LIST",
        data: bsServer.seedNodeList
    });
}

/**
 * BootstrapServer 가 관리하는 SeedNode 리스트에 DIS 노드 정보를 업데이트하고,
 * SeedNode 리스트를 반환하는 gRPC 서비스.
 * @method
 * @private
 * @param call - gRPC client(DIS DHSearch) 가 전송한 메시지
 * @param callback - callback 함수
 */
exports.BootstrapServer.prototype._getSeedNodeList = function (call, callback) {
    debug("[GS] [Bootstrap Server] - GetSeedNodeList");
    var seedNode = call.request;

    if (bsServer.seedNodeList.length > 0) {
        for (var i = 0; i < bsServer.seedNodeList.length; i++) {
            if (bsServer.seedNodeList[i].nodeId === seedNode.nodeId) {
                var target = bsServer.seedNodeList.splice(i, 1);
            }
        }
    }

    callback(null, {nodes: bsServer.seedNodeList});
    bsServer.seedNodeList.unshift(seedNode);
    bsServer._dmUpdateSeedNodeList();
};

/**
 * BootstrapServer 가 관리하는 SeedNode 리스트에 등록되어 있는 특정 SeedNode 정보를 삭제하는 gRPC 서비스.
 * @method
 * @private
 * @param call - gRPC client 가 전송한 메시지
 * @param callback - callback 함수
 */
exports.BootstrapServer.prototype._deleteSeedNode = function (call, callback) {
    debug("[GIS] [Bootstrap Server] - DeleteSeedNode");
    var seedNode = call.request;
    for (var i = 0; i < bsServer.seedNodeList.length; i++) {
        if (bsServer.seedNodeList[i].nodeId === seedNode.nodeId) {
            var target = bsServer.seedNodeList.splice(i, 1);
        }
    }
    debug(bsServer.seedNodeList);
};

/**
 * SODAS+ DIS DHSearch 로부터의 SeedNode 리스트 조회 및 SeedNode 정보 삭제 요청을 처리하는 gRPC 서버를 구동하는 함수로,
 * 해당 기능을 처리하는 내부함수를 gRPC 서비스로 연동함.
 * @method
 * @private
 * @see BootstrapServer._getSeedNodeList
 * @see BootstrapServer._deleteSeedNode
 */
exports.BootstrapServer.prototype._setBootstrapServer = function () {
    this.server = new grpc.Server();
    this.server.addService(this.BSproto.service, {
        GetSeedNodeList: this._getSeedNodeList,
        DeleteSeedNode: this._deleteSeedNode
    });
    return this.server;
};

/**
 * :ref:`gsDaemon` 에 의해 생성된 이후 바로 실행되는 함수로,
 * SODAS+ DIS DHSearch 로부터의 SeedNode 리스트 조회 및 SeedNode 정보 삭제 요청을 처리하는 gRPC 서버를 구동함.
 * @method
 */
exports.BootstrapServer.prototype.run = function () {
    this.bootstrapServer = this._setBootstrapServer();
    this.bootstrapServer.bindAsync('0.0.0.0:'+workerData.bsPortNum,
        grpc.ServerCredentials.createInsecure(), () => {
            debug('gRPC Server running at ' + this.bootstrapServerIP)
            this.bootstrapServer.start();
        });
};

const bsServer = new bs.BootstrapServer();
bsServer.run();
