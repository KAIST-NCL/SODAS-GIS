const RMSESSION_PROTO_PATH = __dirname+'/proto/rmSession.proto';
const RMSYNC_PROTO_PATH = __dirname+'/proto/rmSync.proto';
const { parentPort, workerData } = require('worker_threads');
const rm = require(__dirname+'/rmSync');
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const fs = require("fs");
const execSync = require('child_process').execSync;
const crypto = require("crypto");
const debug = require('debug')('sodas:rmSync');


exports.RMSync = function () {

    self = this;
    parentPort.on('message', function(message) {self._dhDaemonListener(message)});

    this.dh_ip = workerData.dm_ip;
    this.rm_port = workerData.rm_port;
    this.dh_rm_sync_ip = this.dh_ip + ':' + this.rm_port;
    this.rh_rm_sm_ip = workerData.rh_ip + ':' + workerData.rh_portNum;
    this.rmsync_root_dir = workerData.rmsync_root_dir;

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
    debug('[SETTING] RMSync thread creating')
};
exports.RMSync.prototype.run = function() {
    this.rmSyncServer = this._setRMSyncServer();
    this.rmSyncServer.bindAsync(this.dh_rm_sync_ip,
        grpc.ServerCredentials.createInsecure(), () => {
            debug('[SETTING] RMSync gRPC Server running at ' + this.dh_rm_sync_ip)
            this.rmSyncServer.start();
        });
    this.requestRMSession();
};

/* Worker threads Listener */
exports.RMSync.prototype._dhDaemonListener = function(message) {
    switch (message.event) {
        case 'INIT':
            debug('[SETTING] RMSync thread receive [INIT] event from DHDaemon');
            this.run();
            break;
        default:
            debug('[ERROR] DH Daemon Listener Error ! event:', message.event);
            break;
    }
};

/* DHDaemon methods */
exports.RMSync.prototype._dmUpdateReferenceModel = function(id, path) {
    parentPort.postMessage({
        event: 'UPDATE_REFERENCE_MODEL',
        data: {path: path}
    });
};

/* gRPC methods */
exports.RMSync.prototype.referenceModelSync = function(call, callback) {
    !fs.existsSync(__dirname+'/gitDB/') && fs.mkdirSync(__dirname+'/gitDB/');
    var targetFilePath = __dirname+'/gitDB/' + call.request.id;
    debug("[LOG] Server Side Received:" , call.request.id);
    debug('[LOG] RMSync thread send [UPDATE_REFERENCE_MODEL] event to DHDaemon')
    fs.writeFile(targetFilePath, call.request.file, 'binary', function(err){
        if (err) throw err
        debug('[LOG] write end') });
    callback(null, {result: 'File Name [' + call.request.id + '] is succeed synchronization.'});
    rmSync._dmUpdateReferenceModel(call.request.id, targetFilePath)
}
exports.RMSync.prototype.requestRMSession = function() {
    rmSync.rmSessionClient.RequestRMSession({'dh_id': crypto.randomBytes(20).toString('hex'), dh_ip: rmSync.dh_ip, dh_port: rmSync.rm_port}, (error, response) => {
        if (!error) {
            debug('[LOG] Request RMSession Connection to RH-RMSessionManager');
            debug('[LOG] Get response from RH-RMSessionManager');
            debug(response);
        } else {
            debug('[ERROR]', error);
        }
    });
};

/* RMSync methods */
exports.RMSync.prototype._setRMSyncServer = function() {
    this.server = new grpc.Server();
    this.server.addService(this.rmSyncproto.service, {
        ReferenceModelSync: this.referenceModelSync
    });
    return this.server;
};

const rmSync = new rm.RMSync();
