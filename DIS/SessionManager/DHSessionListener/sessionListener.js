
const PROTO_PATH = __dirname+'/../proto/sessionNegotiation.proto';
const {parentPort, workerData} = require('worker_threads');
const sl = require(__dirname+'/sessionListener');
const policy = require(__dirname+'/../api/sync_policy');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const debug = require('debug')('sodas:sessionListener\t|');


/**
 * SessionListener
 * @constructor
 */
exports.SessionListener = function () {

    self = this;
    parentPort.on('message', function(message) {self._smListener(message)});

    this.mySessionDesc = {};
    this.myEndPoint = {};
    this.otherSessionDesc = {};
    this.otherEndPoint = {};
    this.sessionResult = {};

    this.mySessionDesc.sessionCreator = workerData.myNodeId;
    this.slAddr = workerData.slAddr;
    this.snOptions = workerData.snOptions;

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

    debug('[SETTING] SessionListener Created');

}
exports.SessionListener.prototype.run = function () {
    this.sessionListenerServer = this._setListenerServer();
    this.sessionListenerServer.bindAsync(this.slAddr,
        grpc.ServerCredentials.createInsecure(), () => {
            debug('[LOG] Session Listener gRPC Server running at ' + this.slAddr)
            this.sessionListenerServer.start();
        });
}

/* Worker threads Listener */
exports.SessionListener.prototype._smListener = function (message) {
    switch (message.event) {
        case 'INIT':
            debug('[RX: INIT] from SessionManager');
            this.run();
            break;
        case 'GET_NEW_SESSION_INFO':
            debug('[RX: GET_NEW_SESSION_INFO] from SessionManager');
            this.mySessionDesc.sessionId = message.data.sessId;
            this.myEndPoint.ip = message.data.sessIp;
            this.myEndPoint.port = message.data.sessPortNum;
            break;
        case 'UPDATE_INTEREST_LIST':
            debug('[RX: UPDATE_INTEREST_LIST] from SessionManager');
            this.snOptions.datamapDesc.syncInterestList = message.data.syncInterestList;
            break;
        case 'UPDATE_NEGOTIATION_OPTIONS':
            debug('[RX: UPDATE_NEGOTIATION_OPTIONS] from SessionManager');
            this.snOptions = message.data
            break;
    }
}

/* SessionManager methods */
exports.SessionListener.prototype._smTransmitNegotiationResult = function (end_point, session_desc, sn_result) {
    debug('[TX: TRANSMIT_NEGOTIATION_RESULT] to SessionManager');
    parentPort.postMessage({
        event: "TRANSMIT_NEGOTIATION_RESULT",
        data: { endPoint: end_point, sessionDesc: session_desc, snResult: sn_result }
    });
}

/* gRPC methods */
exports.SessionListener.prototype._requestSN = function (call, callback) {
    debug("[gRPC Call] RequestSessionNegotiation");
    let result = call.request;
    debug(result);
    // todo: check_negotiation_options 이후, sn_options 정해야됨
    let snResult = policy.checkNegotiationOptions(sessionListener.snOptions, result.snOptions);
    debug('[LOG] Session Negotiation Result');
    debug(snResult);
    if (snResult.status) {
        // todo: session 협상 결과 negotiation_result 값 반환해야함
        sessionListener.sessionResult = snResult.result;
        callback(null, {
            status: true,
            endPoint: sessionListener.myEndPoint,
            sessionDesc: sessionListener.mySessionDesc,
            snOptions: sessionListener.sessionResult
        });
        sessionListener.otherSessionDesc = result.sessionDesc;
    }
};
exports.SessionListener.prototype._ackSN = function (call, callback) {
    let result = call.request;
    debug("[gRPC Call] CheckNegotiation");
    debug(result);
    sessionListener.otherEndPoint = result.endPoint;

    sessionListener._smTransmitNegotiationResult(sessionListener.otherEndPoint, sessionListener.otherSessionDesc, sessionListener.sessionResult);
    sessionListener.mySessionDesc.sessionId = null;
    debug(sessionListener.mySessionDesc.sessionId)
};
/* SessionListener methods */
exports.SessionListener.prototype._setListenerServer = function () {
    this.server = new grpc.Server();
    this.server.addService(this.SNproto.service, {
        RequestSessionNegotiation: this._requestSN,
        AckSessionNegotiation: this._ackSN
    });
    return this.server;
};

const sessionListener = new sl.SessionListener();
