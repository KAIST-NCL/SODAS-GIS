const RMSESSION_PROTO_PATH = __dirname+'/proto/rmSession.proto';
const RMSESSIONSYNC_PROTO_PATH = __dirname+'/proto/rmSessionSync.proto';
const { parentPort, workerData } = require('worker_threads');
const { subscribeVC } = require('../VersionControl/versionController')
const rm = require(__dirname+'/rmSync');
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const fs = require("fs");
const execSync = require('child_process').execSync;
const crypto = require("crypto");
const diff_parser = require("../Lib/diff_parser");
const debug = require('debug')('sodas:rmSync');


exports.RMSync = function () {

    self = this;
    parentPort.on('message', function(message) {self._dhDaemonListener(message)});

    this.dhIp = workerData.dmIp;
    this.rmPort = workerData.rmPort;
    this.dhRmSyncIp = this.dhIp + ':' + this.rmPort;
    this.rhRmSmIp = workerData.rhIp + ':' + workerData.rhPortNum;
    this.rmsyncRootDir = workerData.rmsyncRootDir;
    !fs.existsSync(this.rmsyncRootDir) && fs.mkdirSync(this.rmsyncRootDir);

    // Settings for GitDB
    this.VC = new subscribeVC(this.rmsyncRootDir+'/gitDB');
    this.VC.init();

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
    this.rmSessionClient = new this.rmSessionproto(this.rhRmSmIp, grpc.credentials.createInsecure());

    // gRPC Server from RH-RMSession
    const rmSessionSyncPackageDefinition = protoLoader.loadSync(
        RMSESSIONSYNC_PROTO_PATH,{
            keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true
        });
    this.rmSessionSyncprotoDescriptor = grpc.loadPackageDefinition(rmSessionSyncPackageDefinition);
    this.rmSessionSyncproto = this.rmSessionSyncprotoDescriptor.RMSessionSyncModule.RMSessionSync;
    debug('[SETTING] RMSync Created')
};
exports.RMSync.prototype.run = function() {
    this.rmSyncServer = this._setRMSyncServer();
    this.rmSyncServer.bindAsync(this.dhRmSyncIp,
        grpc.ServerCredentials.createInsecure(), () => {
            debug('[SETTING] RMSync gRPC Server running at ' + this.dhRmSyncIp)
            this.rmSyncServer.start();
        });
    this.requestRMSession();
};

/* Worker threads Listener */
exports.RMSync.prototype._dhDaemonListener = function(message) {
    switch (message.event) {
        case 'INIT':
            debug('[RX: INIT] from DHDaemon');
            this.run();
            break;
        default:
            debug('[ERROR] DHDaemon Listener Error ! event:', message.event);
            break;
    }
};

/* DHDaemon methods */
exports.RMSync.prototype._dmUpdateReferenceModel = function(path_list) {
    debug('[TX: UPDATE_REFERENCE_MODEL] to DHDaemon')
    parentPort.postMessage({
        event: 'UPDATE_REFERENCE_MODEL',
        data: {path: path_list}
    });
};

/* gRPC methods */
exports.RMSync.prototype.referenceModelSync = function(call, callback) {
    !fs.existsSync(__dirname+'/gitDB/') && fs.mkdirSync(__dirname+'/gitDB/');
    var targetFilePath = __dirname+'/gitDB/' + call.request.id;
    debug("[LOG] Server Side Received:" , call.request.id);
    fs.writeFile(targetFilePath, call.request.file, 'binary', function(err){
        if (err) throw err
        debug('[LOG] write end') });
    callback(null, {result: 'File Name [' + call.request.id + '] is succeed synchronization.'});
    rmSync._dmUpdateReferenceModel(call.request.id, targetFilePath)
}
exports.RMSync.prototype.requestRMSession = function() {
    rmSync.rmSessionClient.RequestRMSession({'dh_id': crypto.randomBytes(20).toString('hex'), dh_ip: rmSync.dhIp, dh_port: rmSync.rmPort}, (error, response) => {
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
    this.server.addService(this.rmSessionSyncproto.service, {
        SessionComm: (call, callback) => {
            self.Subscribe(self, call, callback);
        }
    });
    return this.server;
};

exports.RMSync.prototype.Subscribe = function(self, call, callback) {
    debug('[LOG] Server: RMSync gRPC Received: to ' + call.request.receiver_id);
    debug("[LOG] Git Patch Start");

    // git Patch 적용
    var result = self.gitPatch(call.request.git_patch, self);
    callback(null, {transID: call.request.transID, result: result});

    var filepath_list = diff_parser.parse_git_patch(call.request.git_patch);
    rmSync._dmUpdateReferenceModel(filepath_list)
}

exports.RMSync.prototype.gitPatch = function(git_patch, self) {
    var patch_name = Math.random().toString(10).slice(2,5) + '.patch';
    var temp = self.rmsyncRootDir + "/" + patch_name;
    try {
        fs.writeFileSync(temp, git_patch);
    } catch (err) {
        debug("[ERROR] ", err);
        return 1;
    }
    self.VC.apply("../" + patch_name);
    fs.existsSync(temp) && fs.unlink(temp, function (err) {
        if (err) {
            debug("[ERROR] ", err);
        }
    });
    return 0;
}

const rmSync = new rm.RMSync();
