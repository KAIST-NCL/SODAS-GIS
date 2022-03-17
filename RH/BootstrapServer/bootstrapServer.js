const PROTO_PATH = __dirname+'/proto/bootstrap.proto';
const bs = require(__dirname+'/bootstrapServer');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const debug = require('debug')('sodas:bootstrap_server');

exports.BootstrapServer = function () {

    this.bootstrapServerIP = 'sodas.bootstrap:50051';
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
    callback(null, {nodes: bsServer.seedNodeList});
    bsServer.seedNodeList.unshift(seedNode);
    debug("SeedNodeList is");
    debug(bsServer.seedNodeList);
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
    this.bootstrapServer.bindAsync(this.bootstrapServerIP,
        grpc.ServerCredentials.createInsecure(), () => {
            debug('Bootstrap Server gRPC Server running at ' + this.bootstrapServerIP)
            this.bootstrapServer.start();
        });
};

const bsServer = new bs.BootstrapServer();
bsServer.run();
