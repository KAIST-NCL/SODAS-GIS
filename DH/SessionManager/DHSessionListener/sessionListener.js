
const PROTO_PATH = __dirname+'/../proto/sessionNegotiation.proto';
const {parentPort, workerData} = require('worker_threads');
const sl = require(__dirname+'/sessionListener');
const policy = require(__dirname+'/../api/sync_policy');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const workerName = 'SessionListener';

exports.SessionListener = function () {

    self = this;
    parentPort.on('message', function(message) {self._smListener(message)});

    this.session_desc = {};
    this.end_point = {};
    this.session_result = {}

    this.session_desc.session_creator = workerData.dh_id;
    this.sl_addr = workerData.sl_addr;
    this.sn_options = workerData.sn_options;

    const packageDefinition = protoLoader.loadSync(
        PROTO_PATH,{
            keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true
        });
    this.protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
    this.SNproto = this.protoDescriptor.sessionNegotiation.SessionNegotiationBroker;

    console.log('[SETTING] SessionListener Created');

}

// gRPC service function
exports.SessionListener.prototype._requestSN = function (call, callback) {
    console.log("[gRPC Call] RequestSessionNegotiation");
    let result = call.request;
    console.log(result);
    console.log(sessionListener);
    // todo: check_negotiation_options 이후, sn_options 정해야됨
    if (policy.check_negotiation_options(sessionListener.sn_options, result.sn_options)) {
        callback(null, {
            status: true,
            end_point: sessionListener.end_point,
            session_desc: sessionListener.session_desc,
            sn_options: sessionListener.sn_options
        })
    }
}
exports.SessionListener.prototype._ackSN = function (call, callback) {
    console.log("[gRPC Call] CheckNegotiation");
    let result = call.request;
    console.log(result);
    // this._smTransmitListenerSessionEndpoint(sessionListener.session_desc.session_id, result.end_point, negotiationResult);
}

exports.SessionListener.prototype._setListenerServer = function () {
    this.server = new grpc.Server();
    this.server.addService(this.SNproto.service, {
        RequestSessionNegotiation: this._requestSN,
        AckSessionNegotiation: this._ackSN
    });
    return this.server;
}

exports.SessionListener.prototype.run = function () {
    this.sessionListenerServer = this._setListenerServer();
    this.sessionListenerServer.bindAsync(this.sl_addr,
        grpc.ServerCredentials.createInsecure(), () => {
            console.log('Session Listener gRPC Server running at ' + this.sl_addr)
            this.sessionListenerServer.start();
        });
}

/* Worker threads Listener */
exports.SessionListener.prototype._smListener = function (message) {
    switch (message.event) {
        case 'INIT':
            console.log('[ ' + workerName + ' get message * INIT * ]');
            this.run();
            break;
        case 'GET_NEW_SESSION_INFO':
            console.log('[ ' + workerName + ' get message * GET_NEW_SESSION_INFO * ]');
            // sessionListener.session_desc.session_id = message.data.sess_id;
            this.end_point.ip = message.data.sess_ip;
            this.end_point.port = message.data.sess_portNum;
            console.log(this.session_desc);
            console.log(this.end_point);
            break;
        case 'UPDATE_NEGOTIATION_OPTIONS':
            console.log('[ ' + workerName + ' get message * UPDATE_NEGOTIATION_OPTIONS * ]');
            this.sn_options = message.data
            break;
    }
}

/* SessionManager methods */
exports.SessionListener.prototype._smTransmitListenerSessionEndpoint = function (sess_id, end_point, negotiation_result) {
    parentPort.postMessage({
        event: "TRANSMIT_LISTENER_SESSION_ENDPOINT",
        data: { sess_id: sess_id, ip: end_point.ip, port: end_point.port, negotiation_result: negotiation_result }
    });
    sessionListener.session_desc.session_id = null;
}

const sessionListener = new sl.SessionListener();


