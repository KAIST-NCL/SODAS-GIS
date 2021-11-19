
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

    this.my_session_desc = {};
    this.my_end_point = {};
    this.other_session_desc = {};
    this.other_end_point = {};
    this.session_result = {};

    this.my_session_desc.session_creator = workerData.dh_id;
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
            this.my_session_desc.session_id = message.data.sess_id;
            this.my_end_point.ip = message.data.sess_ip;
            this.my_end_point.port = message.data.sess_portNum;
            break;
        case 'UPDATE_NEGOTIATION_OPTIONS':
            console.log('[ ' + workerName + ' get message * UPDATE_NEGOTIATION_OPTIONS * ]');
            this.sn_options = message.data
            break;
    }
}

/* SessionManager methods */
exports.SessionListener.prototype._smTransmitNegotiationResult = function (end_point, session_desc, sn_result) {
    parentPort.postMessage({
        event: "TRANSMIT_NEGOTIATION_RESULT",
        data: { end_point: end_point, session_desc: session_desc, sn_result: sn_result }
    });
}

/* gRPC methods */
exports.SessionListener.prototype._requestSN = function (call, callback) {
    console.log("[gRPC Call] RequestSessionNegotiation");
    let result = call.request;
    console.log(result);
    // todo: check_negotiation_options 이후, sn_options 정해야됨
    let sn_result = policy.checkNegotiationOptions(sessionListener.sn_options, result.sn_options);
    console.log('세션 협상 결과는????')
    console.log(sn_result)
    console.log(sn_result.result.datamap_desc)
    console.log(sn_result.result.sync_desc)
    if (sn_result.status) {
        // todo: session 협상 결과 negotiation_result 값 반환해야함
        sessionListener.session_result = sn_result.result;
        callback(null, {
            status: true,
            end_point: sessionListener.my_end_point,
            session_desc: sessionListener.my_session_desc,
            sn_options: sessionListener.session_result
        })
        sessionListener.other_session_desc = result.session_desc;
    }
}
exports.SessionListener.prototype._ackSN = function (call, callback) {
    console.log("[gRPC Call] CheckNegotiation");
    let result = call.request;
    console.log(result);
    sessionListener.other_end_point = result.end_point;

    sessionListener._smTransmitNegotiationResult(sessionListener.other_end_point, sessionListener.other_session_desc, sessionListener.session_result);
    sessionListener.my_session_desc.session_id = null;
    console.log(sessionListener.my_session_desc.session_id)
}

/* SessionListener methods */
exports.SessionListener.prototype._setListenerServer = function () {
    this.server = new grpc.Server();
    this.server.addService(this.SNproto.service, {
        RequestSessionNegotiation: this._requestSN,
        AckSessionNegotiation: this._ackSN
    });
    return this.server;
}

const sessionListener = new sl.SessionListener();


