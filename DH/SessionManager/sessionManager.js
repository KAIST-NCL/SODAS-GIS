
const {Worker, parentPort, workerData} = require('worker_threads');
const sm = require(__dirname+'/sessionManager');
const crypto = require('crypto');

const workerName = 'SessionManager';

exports.SessionManager = function() {

    parentPort.on('message', this._dhDaemonListener);
    this.VC = workerData['vc_port'];
    this.VC.on('message', this._vcListener);

    this.datahubInfo = {
        sodasAuthKey: crypto.randomBytes(20).toString('hex'),
        datahubID: crypto.randomBytes(20).toString('hex')
    }
}

exports.SessionManager.prototype.run = function (){

    this.sessionRequester = new Worker(__dirname+'/DHSessionRequester/sessionRequester.js');
    this.sessionListener = new Worker(__dirname+'/DHSessionListener/sessionListener.js')

    this.sessionRequester.on('message', this._sessionRequesterListener);
    this.sessionListener.on('message', this._sessionListenerListener);

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
// [SessionManager -> SessionRequester] [INIT]
exports.SessionManager.prototype._srInit = function () {
    this.sessionRequester.postMessage({
        event: "INIT",
        data: null
    });
}
// [SessionManager -> SessionRequester] [START_SESSION_CONNECTION]
exports.SessionManager.prototype._srStartSessionConnection = function () {
    this.sessionRequester.postMessage({
        event: "START_SESSION_CONNECTION",
        data: this.bucket
    });
}
// [SessionManager -> SessionRequester] [GET_NEW_SESSION_INFO]
exports.SessionManager.prototype._srGetNewSessionInfo = function () {
    this.sessionRequester.postMessage({
        event: "GET_NEW_SESSION_INFO",
        data: this.tempSRSession
    });
}
// [SessionManager -> SessionRequester] [UPDATE_NEGOTIATION_OPTIONS]
exports.SessionManager.prototype._srUpdateNegotiationOptions = function () {
    this.sessionRequester.postMessage({
        event: "UPDATE_NEGOTIATION_OPTIONS",
        data: this.sessionNegotiationOptions
    });
}

/* SessionListener methods */
// [SessionManager -> SessionListener] [INIT]
exports.SessionManager.prototype._slInit = function (gRPC_server_endpoint) {
    this.sessionListener.postMessage({
        event: "INIT",
        data: gRPC_server_endpoint
    });
}
// [SessionManager -> SessionListener] [GET_NEW_SESSION_INFO]
exports.SessionManager.prototype._slGetNewSessionInfo = function () {
    this.sessionListener.postMessage({
        event: "GET_NEW_SESSION_INFO",
        data: this.tempSLSession
    });
}
// [SessionManager -> sessionListener] [UPDATE_NEGOTIATION_OPTIONS]
exports.SessionManager.prototype._slUpdateNegotiationOptions = function () {
    this.sessionListener.postMessage({
        event: "UPDATE_NEGOTIATION_OPTIONS",
        data: sessionManager.sessionNegotiationOptions
    });
}


//// ------- SYNC_ON -> StartSessionConnection ------- ////
exports.SessionManager.prototype._startSessionConnection = function (listenerEndPoint) {
    let session_id = crypto.randomBytes(20).toString('hex');
    // todo: Session 생성 시, random port(중복 체크 필요) 전달해야 됨
    this._createSession(session_id, 9091);

    // [SessionManager -> SessionRequester] [START_SESSION_CONNECTION]
    sessionManager.sessionRequester.worker.postMessage({ event: "START_SESSION_CONNECTION", data: listenerEndPoint });
}

//// ------- CreateSessionForSessionRequester ------- ////
// todo: session worker 를 계속 생성할 때, end-point(port number) 부여 방법
exports.SessionManager.prototype._createSession = function (session_id, port) {
    const sessionWorker = new Worker(__dirname+'/DHSession/session.js');

    // [SessionManager -> S-Worker] [INIT]
    sessionWorker.postMessage({ event: "INIT", data: { session_id: session_id, port: port } });

    sessionManager.tempSessionWorker.requester.session_id = session_id;
    sessionManager.tempSessionWorker.requester.port = port;
    sessionManager.tempSessionWorker.requester.worker = sessionWorker;

    // [SessionManager -> SessionRequester] [GET_NEW_SESSION_WORKER_INFO]
    sessionManager.sessionRequester.worker.postMessage({ event: "GET_NEW_SESSION_WORKER_INFO", data: { session_creator: sessionManager.datahubInfo.datahubID, session_id: sessionManager.tempSessionWorker.requester.session_id } });

    console.log(sessionManager);
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
            this.sessionNegotiationOptions = message.data
            break;
        // 동기화 시작 이벤트로, SessionRequester 에게 Bucket 정보와 함께 START_SESSION_CONNECTION 이벤트 전송
        case 'SYNC_ON':
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
exports.SessionManager.prototype._sessionRequesterListener = function (message){
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
exports.SessionManager.prototype._sessionListenerListener = function (message){
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



const sessionManager = new sm.SessionManager()
sessionManager.VC.postMessage({event: "INIT", data: "test"})

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
