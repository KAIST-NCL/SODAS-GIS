const PROTO_PATH = __dirname+'/proto/bootstrap.proto';
const bs = require(__dirname+'/bootstrapServer');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { Worker, workerData, parentPort} = require("worker_threads");
const debug = require('debug')('sodas:bootstrap_server');

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
exports.BootstrapServer.prototype._dmUpdateSeedNodeList = function () {
    // [BootstrapServer -> RHDaemon] [UPDATE_SEEDNODE_LIST]
    debug('[TX: UPDATE_SEEDNODE_LIST] to RHDaemon')
    parentPort.postMessage({
        event: "UPDATE_SEEDNODE_LIST",
        data: bsServer.seedNodeList
    });
}

exports.BootstrapServer.prototype._setSeedNode = function (call, callback) {
    debug("SetSeedNode");
    var seedNode = call.request;
    debug(seedNode);
    bsServer.seedNodeList.unshift(seedNode);
    debug(bsServer.seedNodeList);
    callback(null, { status: true, message: "Success enroll node info" })
};

exports.BootstrapServer.prototype._getSeedNodeList = function (call, callback) {
    debug("[RH] [Bootstrap Server] - GetSeedNodeList");
    var seedNode = call.request;
    debug("Access Bootstrap Server from");
    debug(seedNode);

    if (bsServer.seedNodeList.length > 0) {
        for (var i = 0; i < bsServer.seedNodeList.length; i++) {
            if (bsServer.seedNodeList[i].node_id === seedNode.nodeId) {
                var target = bsServer.seedNodeList.splice(i, 1);
            }
        }
    }

    callback(null, {nodes: bsServer.seedNodeList});
    bsServer.seedNodeList.unshift(seedNode);
    debug(bsServer.seedNodeList);
    bsServer._dmUpdateSeedNodeList();
};

exports.BootstrapServer.prototype._setBootstrapServer = function () {
    this.server = new grpc.Server();
    this.server.addService(this.BSproto.service, {
        SetSeedNode: this._setSeedNode,
        GetSeedNodeList: this._getSeedNodeList
    });
    return this.server;
};

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
