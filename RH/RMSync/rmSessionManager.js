
const PROTO_PATH = __dirname+'/proto/rmSession.proto';
const {Worker, workerData} = require('worker_threads');
const rmSM = require(__dirname+'/rmSessionManager');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const crypto = require("crypto");

exports.RMSessionManager = function () {

    this.rm_sm_ip = '127.0.0.1:50050';
    const packageDefinition = protoLoader.loadSync(
        PROTO_PATH, {
            keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true
        });
    this.protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
    this.rmSessionproto = this.protoDescriptor.RMSession.RMSessionBroker;
    this.rmSessionDict = {};

}

exports.RMSessionManager.prototype._requestRMSession = function (call, callback) {
    console.log("[RH] [RMSessionManager] - RequestRMSession")
    var dhNode = call.request
    console.log("Request RMSession Connection from DH-RMSync")
    console.log(dhNode)
    rmSessionManager._createNewRMSession(dhNode)
    callback(null, {result: 'OK', rm_session_id: 'fewfewfwe'})
}

exports.RMSessionManager.prototype._setRMSessionManager = function () {
    this.server = new grpc.Server();
    this.server.addService(this.rmSessionproto.service, {
        RequestRMSession: this._requestRMSession
    });
    return this.server;
}

exports.RMSessionManager.prototype.run = function () {
    this.rmSMServer = this._setRMSessionManager();
    this.rmSMServer.bindAsync(this.rm_sm_ip,
        grpc.ServerCredentials.createInsecure(), () => {
            console.log('RMSessionManager gRPC Server running at ' + this.rm_sm_ip)
            this.rmSMServer.start();
        });
}

exports.RMSessionManager.prototype._createNewRMSession = function (dhNode) {
    var session_id = crypto.randomBytes(20).toString('hex')
    var rmSessParam = {
        ip: dhNode.dh_ip,
        port: dhNode.dh_port,
        session_id: session_id
    }
    console.log(rmSessParam)
    var rmSession = new Worker(__dirname+'/RMSession/rmSession.js', {workerData: rmSessParam});
    this.rmSessionDict[dhNode.dh_id] = rmSession;
}

const rmSessionManager = new rmSM.RMSessionManager()
rmSessionManager.run()
