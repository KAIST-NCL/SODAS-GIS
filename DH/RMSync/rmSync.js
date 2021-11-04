
const RMSESSION_PROTO_PATH = __dirname+'/proto/rmSession.proto';
const RMSYNC_PROTO_PATH = __dirname+'/proto/rmSync.proto';
const { parentPort, workerData } = require('worker_threads');
const rm = require(__dirname+'/rmSync');
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const fs = require("fs");
const execSync = require('child_process').execSync;

exports.RMSync = function () {

    parentPort.on('message', this._dhDaemonListener);

    this.dh_ip = workerData.dm_ip;
    this.rm_port = workerData.rm_port;
    this.dh_rm_sync_ip = this.dh_ip + ':' + this.rm_port;
    this.rh_rm_sm_ip = workerData.rh_ip + ':' + workerData.rh_portNum;

    // gRPC Client to RH-RMSessionManager
    const rmSessionPackageDefinition = protoLoader.loadSync(
        RMSESSION_PROTO_PATH,{
            keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true
        });
    this.rmSessionprotoDescriptor = grpc.loadPackageDefinition(rmSessionPackageDefinition);
    this.rmSessionproto = this.rmSessionprotoDescriptor.RMSession.RMSessionBroker;
    this.rmSessionClient = new this.rmSessionproto(this.rh_rm_sm_ip, grpc.credentials.createInsecure());

    // gRPC Server from RH-RMSession
    const rmSyncPackageDefinition = protoLoader.loadSync(
        RMSYNC_PROTO_PATH,{
            keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true
        });
    this.rmSyncprotoDescriptor = grpc.loadPackageDefinition(rmSyncPackageDefinition);
    this.rmSyncproto = this.rmSyncprotoDescriptor.RMSync.RMSyncBroker;
};

// gRPC server service function
exports.RMSync.prototype._referenceModelSync = function(call, callback) {
    !fs.existsSync(__dirname+'/gitDB/') && fs.mkdirSync(__dirname+'/gitDB/');
    var targetFilePath = __dirname+'/gitDB/' + call.request.commit_number;
    console.log("Server Side Received:" , call.request.commit_number);
    fs.writeFile(targetFilePath, call.request.file, 'binary', function(err){
        if (err) throw err
        console.log('write end') });
    callback(null, {result: call.request.commit_number + 'Success'});
    rmSync._dmUpdateReferenceModel(targetFilePath)
}

exports.RMSync.prototype._setRMSyncServer = function() {
    this.server = new grpc.Server();
    this.server.addService(this.rmSyncproto.service, {
        ReferenceModelSync: this._referenceModelSync
    });
    return this.server;
};

exports.RMSync.prototype.run = function() {
    this.rmSyncServer = this._setRMSyncServer();
    this.rmSyncServer.bindAsync(this.dh_rm_sync_ip,
        grpc.ServerCredentials.createInsecure(), () => {
            console.log('RMSync gRPC Server running at ' + this.dh_rm_sync_ip)
            this.rmSyncServer.start();
        });
    this._requestRMSession();
};

// gRPC client service function
exports.RMSync.prototype._requestRMSession = function() {
    rmSync.rmSessionClient.RequestRMSession({'dh_id': 'fdfds', dh_ip: rmSync.dh_ip, dh_port: rmSync.rm_port}, (error, response) => {
        if (!error) {
            console.log('Request RMSession Connection to RH-RMSessionManager');
            console.log(response);
        } else {
            console.error(error);
        }
    });
};

/* Worker threads Listener */
exports.RMSync.prototype._dhDaemonListener = function(message) {
    switch (message.event) {
        case 'INIT':
            rmSync.run();
            break;
        default:
            console.log('[ERROR] DH Daemon Listener Error ! event:', message.event);
            break;
    }
};

/* DHDaemon methods */
exports.RMSync.prototype._dmUpdateReferenceModel = function(path) {
    parentPort.postMessage({
        event: 'UPDATE_REFERENCE_MODEL',
        data: path
    });
};

const rmSync = new rm.RMSync();
