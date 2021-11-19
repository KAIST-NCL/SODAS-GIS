
const PROTO_PATH = __dirname+'/proto/bootstrap.proto';
const bs = require(__dirname+'/bootstrapServer');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader')

exports.BootstrapServer = function () {

    this.bootstrapServerIP = '127.0.0.1:50051';
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

}

exports.BootstrapServer.prototype._setSeedNode = function (call, callback) {
    console.log("SetSeedNode")
    var seedNode = call.request
    console.log(seedNode)
    bsServer.seedNodeList.unshift(seedNode)
    console.log(bsServer.seedNodeList)
    callback(null, { status: true, message: "Success enroll node info" })
}

exports.BootstrapServer.prototype._getSeedNodeList = function (call, callback) {
    console.log("[RH] [Bootstrap Server] - GetSeedNodeList")
    var seedNode = call.request
    console.log("Access Bootstrap Server from")
    console.log(seedNode)
    callback(null, {nodes: bsServer.seedNodeList})
    bsServer.seedNodeList.unshift(seedNode)
    console.log("SeedNodeList is")
    console.log(bsServer.seedNodeList)
}

exports.BootstrapServer.prototype._setBootstrapServer = function () {
    this.server = new grpc.Server();
    this.server.addService(this.BSproto.service, {
        SetSeedNode: this._setSeedNode,
        GetSeedNodeList: this._getSeedNodeList
    });
    return this.server;
}

exports.BootstrapServer.prototype.run = function () {
    this.bootstrapServer = this._setBootstrapServer();
    this.bootstrapServer.bindAsync(this.bootstrapServerIP,
        grpc.ServerCredentials.createInsecure(), () => {
            console.log('Bootstrap Server gRPC Server running at ' + this.bootstrapServerIP)
            this.bootstrapServer.start();
        });
}

const bsServer = new bs.BootstrapServer()
bsServer.run()
