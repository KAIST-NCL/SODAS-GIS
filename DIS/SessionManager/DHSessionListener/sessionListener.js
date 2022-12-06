
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
/**
 * SessionListener 실행 함수로 다른 데이터 허브의 :ref:`sessionRequester` 로부터의 세션 협상 요청에 응답하는 gRPC 서버를 구동함.
 * @method
 * @private
 */
exports.SessionListener.prototype.run = function () {
    this.sessionListenerServer = this._setListenerServer();
    this.sessionListenerServer.bindAsync(this.slAddr,
        grpc.ServerCredentials.createInsecure(), () => {
            debug('[LOG] Session Listener gRPC Server running at ' + this.slAddr)
            this.sessionListenerServer.start();
        });
}

/* Worker threads Listener */
/**
 * :ref:`sessionManager` 에서 전달되는 스레드 메시지를 수신하는 이벤트 리스너.
 * @method
 * @private
 * @param message - dictionary(event, message) 구조의 스레드 메시지
 * @param message:event - ``INIT``, ``GET_NEW_SESSION_INFO``, ``UPDATE_INTEREST_LIST``, ``UPDATE_NEGOTIATION_OPTIONS``
 * @see SessionManager._slInit
 * @see SessionManager._slGetNewSessionInfo
 * @see SessionManager._slUpdateInterestList
 * @see SessionManager._slUpdateNegotiationOptions
 */
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
/**
 * SessionListener 모듈과 다른 데이터 허브의 :ref:`sessionRequester` 간 세션 협상 체결이 된 경우,
 * :ref:`sessionManager` 로 상대 세션 모듈의 end point 정보와 세션 협상 결과를 ``TRANSMIT_NEGOTIATION_RESULT`` 이벤트 스레드 메시지와 함께 전달함.
 * @method
 * @private
 * @param end_point - 다른 데이터 허브의 세션 모듈의 접속 정보(IP, Port)
 * @param session_desc - 세션 객체의 메타데이터(세션 생성자 정보, 세션 ID)
 * @param sn_result - 세션 협상 결과
 * @see SessionManager._slListener
 */
exports.SessionListener.prototype._smTransmitNegotiationResult = function (end_point, session_desc, sn_result) {
    debug('[TX: TRANSMIT_NEGOTIATION_RESULT] to SessionManager');
    parentPort.postMessage({
        event: "TRANSMIT_NEGOTIATION_RESULT",
        data: { endPoint: end_point, sessionDesc: session_desc, snResult: sn_result }
    });
}

/* gRPC methods */
/**
 * 다른 데이터 허브의 :ref:`sessionRequester` 로부터 세션 협상 요청에 대응하는 gRPC 함수로,
 * 다른 데이터 허브의 관심 동기화 수준 및 세션 협상 옵션을 비교하여, 세션 협상 체결 여부를 결정 및 세션 협상 결과를 :ref:`sessionRequester` 로 전달함.
 * (세션 협상 체결시, 연동할 세션 end point 도 함께 전달함.)
 * @method
 * @private
 * @see SessionRequester._snProcess
 */
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
/**
 * 다른 데이터 허브의 :ref:`sessionRequester` 와의 세션 협상 체결이 결정된 이후,
 * :ref:`sessionRequester` 로부터 다른 데이터 허브의 연동할 세션 end point 를 전달받는 gRPC 함수.
 * @method
 * @private
 * @see SessionRequester._snProcess
 */
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
/**
 * 세션 협상 요청을 응답할 gRPC 서버를 구동하는 함수.
 * @method
 * @private
 */
exports.SessionListener.prototype._setListenerServer = function () {
    this.server = new grpc.Server();
    this.server.addService(this.SNproto.service, {
        RequestSessionNegotiation: this._requestSN,
        AckSessionNegotiation: this._ackSN
    });
    return this.server;
};

const sessionListener = new sl.SessionListener();
