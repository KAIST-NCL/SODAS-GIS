const PROTO_PATH = __dirname+'/proto/rmSession.proto';
const { Worker, workerData, parentPort } = require('worker_threads');
const rmSM = require(__dirname+'/rmSessionManager');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const crypto = require("crypto");
const debug = require('debug')('sodas:rmSessionManager');

exports.RMSessionManager = function () {

    self = this;

    this.VC = workerData.vc_port;
    this.VC.on('message', this._vcListener);

    this.rm_sm_addr = workerData.dm_ip + ':' + workerData.sm_portNum;
    this.pubvc_root = workerData.pubvc_root;
    this.mutex_flag = workerData.mutex_flag;

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
    this.rmSession_list_to_daemon = [];
    debug('RMSessionManager thread is running')
};

/* Worker threads Listener */
exports.RMSessionManager.prototype._vcListener = function (message){
    switch (message.event) {
        case 'UPDATE_REFERENCE_MODEL':
            debug('[RX: UPDATE_REFERENCE_MODEL] from VersionControl');
            debug(message.data);

            for (var key in rmSessionManager.rmSessionDict) {
                rmSessionManager._rmSessionUpdateReferenceModel(rmSessionManager.rmSessionDict[key], message.data.commit_number)
            }
            break;
    }
}

exports.RMSessionManager.prototype._rmSessionUpdateReferenceModel = function (rmSessionWorker, commit_number) {
    rmSessionWorker.postMessage({
        event: "UPDATE_REFERENCE_MODEL",
        data: { commit_number: commit_number }
    });
}

exports.RMSessionManager.prototype._requestRMSession = function (call, callback) {
    debug("[RH] [RMSessionManager] - RequestRMSession");
    var dhNode = call.request
    debug("Request RMSession Connection from DH-RMSync");
    debug(dhNode);
    rmSessionManager._createNewRMSession(dhNode);
    callback(null, {result: 'OK', rm_session_id: rmSessionManager.rmSession_list_to_daemon[0].session_id})
};

exports.RMSessionManager.prototype._setRMSessionManager = function () {
    this.server = new grpc.Server();
    this.server.addService(this.rmSessionproto.service, {
        RequestRMSession: this._requestRMSession
    });
    return this.server;
}

exports.RMSessionManager.prototype.run = function () {
    this.rmSMServer = this._setRMSessionManager();
    this.rmSMServer.bindAsync(this.rm_sm_addr,
        grpc.ServerCredentials.createInsecure(), () => {
            debug('gRPC Server running at ' + this.rm_sm_addr);
            this.rmSMServer.start();
        });
}

exports.RMSessionManager.prototype._createNewRMSession = function (dhNode) {
    dhNode['session_id'] = crypto.randomBytes(20).toString('hex')
    var rmSessParam = {
        session_id: dhNode.session_id,
        dh_id: dhNode.dh_id,
        dh_ip: dhNode.dh_ip,
        dh_port: dhNode.dh_port,
        pubvc_root: this.pubvc_root,
        mutex_flag: this.mutex_flag
    };
    debug('Create New RMSession');
    debug(rmSessParam);
    var rmSession = new Worker(__dirname+'/RMSession/rmSession.js', {workerData: rmSessParam});
    rmSessionManager.rmSession_list_to_daemon.push(dhNode);
    rmSessionManager.rmSessionDict[dhNode.session_id] = rmSession;
};

const rmSessionManager = new rmSM.RMSessionManager();
rmSessionManager.run();
