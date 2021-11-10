
const {Worker, parentPort, workerData} = require('worker_threads');
const sm = require(__dirname+'/sessionManager');
const crypto = require('crypto');
const detect = require('detect-port');

const workerName = 'SessionManager';

const MIN_PORT_NUM_OF_SESSION = 55000;
const MAX_PORT_NUM_OF_SESSION = 65535;

exports.SessionManager = function() {

    parentPort.on('message', this._dhDaemonListener);

    // this.VC = workerData['vc_port'];
    // this.VC.on('message', this._vcListener);

    this.dm_ip = workerData.dm_ip;
    this.sl_ip = workerData.dm_ip + ':' + workerData.sl_port;

    this.datahubInfo = {
        sodasAuthKey: crypto.randomBytes(20).toString('hex'),
        datahubID: crypto.randomBytes(20).toString('hex')
    };
    this.sessionNegotiationOptions = {};
    console.log('[SETTING] SessionManager Created');
}

exports.SessionManager.prototype.run = function (){

    // setEnvironmentData
    const srParam = {}
    const slParam = {'sl_ip': this.sl_ip}

    // create SR, SL Thread
    this.sessionRequester = new Worker(__dirname+'/DHSessionRequester/sessionRequester.js', {workerData: srParam});
    this.sessionListener = new Worker(__dirname+'/DHSessionListener/sessionListener.js', {workerData: slParam});

    // setting on function
    this.sessionRequester.on('message', this._srListener);
    this.sessionListener.on('message', this._slListener);

    this._srInit();
    this._slInit();

    this._createSession().then(value => {
        this.slTempSession = value;
        this._sessionInit(this.slTempSession.worker);
        this._slGetNewSessionInfo();
    });

    console.log('[RUNNING] SessionManager is running');
}

/* Worker threads Listener */
exports.SessionManager.prototype._dhDaemonListener = function (message){
    switch (message.event) {
        // SessionManager 초기화
        case 'INIT':
            sessionManager.run();
            break;
        // 세션 협상 정보 업데이트
        case 'UPDATE_NEGOTIATION_OPTIONS':
            sessionManager.sessionNegotiationOptions = message.data
            console.log(sessionManager)
            sessionManager._srUpdateNegotiationOptions()
            break;
        // 동기화 시작 이벤트로, SessionRequester 에게 Bucket 정보와 함께 START_SESSION_CONNECTION 이벤트 전송
        case 'SYNC_ON':
            this._srStartSessionConnection(message.data)
            break;
    }
}
exports.SessionManager.prototype._vcListener = function (message){
    switch (message.event) {
        // ETRI's KAFKA 에서 Asset 데이터맵 변화 이벤트 감지 시, 해당 데이터맵 및 git Commit 정보를 전달받아서
        // sessionList 정보 조회 후, 해당 session 에게 UPDATE_PUB_ASSET 이벤트 전달
        case 'UPDATE_PUB_ASSET':
            console.log('<--------------- [ ' + workerName + ' get message * TRANSMIT_LISTENER_SESSION_ENDPOINT * ] --------------->')
            console.log(message.data)
            break;
    }
}
exports.SessionManager.prototype._srListener = function (message){
    switch (message.event) {
        // SessionRequester 에서 세션 협상 완료된 Event 로, 타 데이터 허브의 Session의 end-point 전송 받음
        case 'TRANSMIT_LISTENER_SESSION_ENDPOINT':
            console.log('<--------------- [ ' + workerName + ' get message * TRANSMIT_LISTENER_SESSION_ENDPOINT * ] --------------->')
            console.log(message.data)

            console.log(sessionManager.tempSessionWorker.requester.session_id)
            console.log(message.data.session_id)
            // [SessionManager -> Session] [GET_OTHER_DATAHUB_SESSION_WORKER_ENDPOINT]
            if (sessionManager.tempSessionWorker.requester.session_id === message.data.session_id) {
                sessionManager.tempSessionWorker.requester.worker.postMessage({ event: "START_GRPC_SERVER", data: null })
                sessionManager.tempSessionWorker.requester.worker.postMessage({ event: "GET_OTHER_DATAHUB_SESSION_WORKER_ENDPOINT", data: message.data.endpoint })
            }
            break;
    }
}
exports.SessionManager.prototype._slListener = function (message){
    switch (message.event) {
        // 데이터 허브 간 세션 협상에 의해 세션 연동이 결정난 경우, 상대방 세션의 endpoint 전달받는 이벤트
        case 'TRANSMIT_REQUESTER_SESSION_ENDPOINT':
            console.log('<--------------- [ ' + workerName + ' get message * TRANSMIT_LISTENER_SESSION_ENDPOINT * ] --------------->')
            console.log(message.data)
            break;
    }
}
exports.SessionManager.prototype._sessionListener = function (message){
    switch (message.event) {
        // 데이터 허브 간 세션 협상에 의해 세션 연동이 결정난 경우, 상대방 세션의 endpoint 전달받는 이벤트
        case 'RECONFIGURATION_NEGOTIATION_OPTIONS':
            break;
    }
}

/* DHDaemon methods */
exports.SessionManager.prototype._dmGetSessionListInfo = function () {
    // [SessionManager -> DHDaemon] [GET_SESSION_LIST_INFO]
    parentPort.postMessage({
        event: "GET_SESSION_LIST_INFO",
        data: this.sessionList
    });
}

/* SessionRequester methods */
exports.SessionManager.prototype._srInit = function () {
    this.sessionRequester.postMessage({
        event: "INIT",
        data: null
    });
}
exports.SessionManager.prototype._srStartSessionConnection = function (bucketList) {
    this.sessionRequester.postMessage({
        event: "START_SESSION_CONNECTION",
        data: bucketList
    });
}
exports.SessionManager.prototype._srGetNewSessionInfo = function () {
    this.sessionRequester.postMessage({
        event: "GET_NEW_SESSION_INFO",
        data: this.tempSRSession
    });
}
exports.SessionManager.prototype._srUpdateNegotiationOptions = function () {
    this.sessionRequester.postMessage({
        event: "UPDATE_NEGOTIATION_OPTIONS",
        data: this.sessionNegotiationOptions
    });
}

/* SessionListener methods */
exports.SessionManager.prototype._slInit = function (gRPC_server_endpoint) {
    this.sessionListener.postMessage({
        event: "INIT",
        data: gRPC_server_endpoint
    });
}
exports.SessionManager.prototype._slGetNewSessionInfo = function () {
    this.sessionListener.postMessage({
        event: "GET_NEW_SESSION_INFO",
        data: {'sess_id': sessionManager.slTempSession.session_id, 'sess_ip': sessionManager.dm_ip, 'sess_portNum': sessionManager.slTempSession.port}
    });
}
exports.SessionManager.prototype._slUpdateNegotiationOptions = function () {
    this.sessionListener.postMessage({
        event: "UPDATE_NEGOTIATION_OPTIONS",
        data: sessionManager.sessionNegotiationOptions
    });
}

/* Session methods */
exports.SessionManager.prototype._sessionInit = function (sessionWorker) {
    sessionWorker.postMessage({
        event: "INIT",
        data: null
    });
}
exports.SessionManager.prototype._sessionGetOtherDatahubSessionEndpoint = function (sessionWorker) {
    sessionWorker.postMessage({
        event: "GET_OTHER_DATAHUB_SESSION_ENDPOINT",
        data: null
    });
}
exports.SessionManager.prototype._sessionGetNegotiationResult = function (sessionWorker) {
    sessionWorker.postMessage({
        event: "GET_NEGOTIATION_RESULT",
        data: null
    });
}
exports.SessionManager.prototype._sessionUpdatePubAsset = function (sessionWorker) {
    sessionWorker.postMessage({
        event: "UPDATE_PUB_ASSET",
        data: null
    });
}

/* sessionManager methods */
exports.SessionManager.prototype._startSessionConnection = function (listenerEndPoint) {
    // [SessionManager -> SessionRequester] [START_SESSION_CONNECTION]
    sessionManager.sessionRequester.worker.postMessage({ event: "START_SESSION_CONNECTION", data: listenerEndPoint });
}
exports.SessionManager.prototype._createSession = async function () {
    var session = {};
    session.session_id = crypto.randomBytes(20).toString('hex');
    await this._setSessionPort().then(value => session.port = value);
    session.worker = await new Worker(__dirname+'/DHSession/session.js', { workerData: {'session_id': session.session_id, 'dm_ip': this.dm_ip, 'sess_portNum': session.port} });
    session.worker.on('message', this._sessionListener);

    return session
}
exports.SessionManager.prototype._setSessionPort = async function () {
    await detect(MIN_PORT_NUM_OF_SESSION)
        .then(_port => {
        })
        .catch(err => {
            console.log(err);
        });
    return detect();
}

const sessionManager = new sm.SessionManager()
// sessionManager.VC.postMessage({event: "INIT", data: "test"})

// // 탐색 모듈과 연동해서, 주기적으로 c-bucket 참조 -> 세션 연동 후보 노드 순차적으로 세션 연동 Request 보내는 로직
//
// async function test() {
//
//     let bootstrap_client = await sessionManager.update_negotiation_options();
//     await new Promise((resolve, reject) => setTimeout(resolve, 2000));
//
//     let get = await sessionManager.start_session_connection('127.0.0.1:50051')
//     await new Promise((resolve, reject) => setTimeout(resolve, 2000));
//
//     return null;
//
// }
//
// test()
