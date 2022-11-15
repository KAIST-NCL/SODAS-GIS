
const {Worker, parentPort, workerData} = require('worker_threads');
const sm = require(__dirname+'/sessionManager');
const crypto = require('crypto');
const detect = require('detect-port');

const MIN_PORT_NUM_OF_SESSION = 55000;
const MAX_PORT_NUM_OF_SESSION = 65535;
const debug = require('debug')('sodas:sessionManager');

exports.SessionManager = function() {

    self = this;
    parentPort.on('message', function(message) {self._dhDaemonListener(message)});

    this.VC = workerData.vcPort;
    this.VC.on('message', this._vcListener);

    this.dhId = workerData.dhId;
    this.dmIp = workerData.dmIp;
    this.kafka = workerData.kafka;
    this.slAddr = workerData.dmIp + ':' + workerData.slPortNum;
    this.snOptions = workerData.snOptions;
    this.pubvcRoot = workerData.pubvcRoot;
    this.subvcRoot = workerData.subvcRoot;
    this.mutexFlag = workerData.mutexFlag;
    this.sessionList = {};
    this.dhListWithSession = [];
    this.sessionListToDaemon = [];
    this.srTempSession = {};
    this.slTempSession = {};

    debug('[SETTING] SessionManager Created');
};
exports.SessionManager.prototype.run = function (){

    const srParam = {'snOptions': this.snOptions, 'dhId': this.dhId}
    const slParam = {'snOptions': this.snOptions, 'dhId': this.dhId, 'slAddr': this.slAddr}

    this.sessionRequester = new Worker(__dirname+'/DHSessionRequester/sessionRequester.js', {workerData: srParam});
    this.sessionListener = new Worker(__dirname+'/DHSessionListener/sessionListener.js', {workerData: slParam});

    this.sessionRequester.on('message', this._srListener);
    this.sessionListener.on('message', this._slListener);

    this._srInit();
    this._slInit();

    this._createSession().then(value => {
        this.slTempSession = value;
        this._sessionInit(this.slTempSession.worker);
        this._slGetNewSessionInfo();
    });

    debug('[RUNNING] SessionManager is running');
}

/* Worker threads Listener */
exports.SessionManager.prototype._dhDaemonListener = function (message){
    switch (message.event) {
        // interest_list 정보 업데이트
        case 'UPDATE_INTEREST_TOPIC':
            debug('[RX: UPDATE_INTEREST_TOPIC] from DHDaemon');
            this.snOptions.datamapDesc.syncInterestList = message.data.syncInterestList;
            debug('[TX: UPDATE_INTEREST_TOPIC] to SessionRequester');
            this._srUpdateInterestList();
            debug('[TX: UPDATE_INTEREST_TOPIC] to SessionListener');
            this._slUpdateInterestList();
            break;
        // 세션 협상 정보 업데이트
        case 'UPDATE_NEGOTIATION_OPTIONS':
            debug('[RX: UPDATE_NEGOTIATION_OPTIONS] from DHDaemon');
            this.snOptions = message.data;
            debug('[TX: UPDATE_NEGOTIATION_OPTIONS] to SessionRequester');
            this._srUpdateNegotiationOptions();
            debug('[TX: UPDATE_NEGOTIATION_OPTIONS] to SessionListener');
            this._slUpdateNegotiationOptions();
            break;
        // 동기화 시작 이벤트로, SessionRequester 에게 Bucket 정보와 함께 START_SESSION_CONNECTION 이벤트 전송
        case 'SYNC_ON':
            debug('[RX: SYNC_ON] from DHDaemon');
            debug('[TX: START_SESSION_CONNECTION] to SessionRequester');

            // DH 간 중복 세션 협상 및 연동 방지를 위한 DH 리스트 체크
            for (let key in message.data) {
                for (let i = 0; i < message.data[key]._contacts.length; i++) {
                    if (this.dhListWithSession.includes(message.data[key]._contacts[i].nodeID)) {
                        message.data[key]._contacts.splice(i, 1);
                    }
                }
            }

            this._srStartSessionConnection(message.data);
            if (this._isEmptyObj(this.srTempSession)){
                this._createSession().then(value => {
                    this.srTempSession = value;
                    this._sessionInit(this.srTempSession.worker);
                    this._srGetNewSessionInfo();
                });
            }
            break;
    }
}
exports.SessionManager.prototype._vcListener = function (message){
    switch (message.event) {
        // ETRI's KAFKA 에서 Asset 데이터맵 변화 이벤트 감지 시, 해당 데이터맵 및 git Commit 정보를 전달받아서
        // sessionList 정보 조회 후, 해당 session 에게 UPDATE_PUB_ASSET 이벤트 전달
        case 'UPDATE_PUB_ASSET':
            debug('[RX: UPDATE_PUB_ASSET] from VersionControl');
            debug(message.data);

            for (let t = 0; t < message.data.filepath.length; t++) {
                for (let key in sessionManager.sessionList) {
                    if (message.data.filepath[t].includes(sessionManager.sessionList[key])) {
                        for (let u = 0; u < sessionManager.sessionList[key].length; u++) {
                            sessionManager._sessionUpdatePubAsset(sessionManager.sessionList[key][u].worker, message.data.commitNumber)
                        }
                    }
                }
            }
            //
            // let sync_list = [];
            // for (let t = 0; t < message.data.filepath.length; t++) {
            //     let sync_element = message.data.filepath[t].split("/").slice(0,-1);
            //     sync_list = sync_list.concat(sync_element)
            //     const uniqueArr = sync_list.filter((element, index) => {
            //         return sync_list.indexOf(element) === index
            //     });
            //     if ((t+1) === message.data.filepath.length) {
            //         for (let i = 0; i < uniqueArr.length; i++) {
            //             let sync_target = uniqueArr[i]
            //             debug(sync_target)
            //             if (sessionManager.sessionList[sync_target]) {
            //                 for (let j = 0; j < sessionManager.sessionList[sync_target].length; j++) {
            //                     sessionManager._sessionUpdatePubAsset(sessionManager.sessionList[sync_target][j].worker, message.data.commitNumber)
            //                 }
            //             }
            //         }
            //     }
            // }
            break;
    }
}
exports.SessionManager.prototype._srListener = function (message){
    switch (message.event) {
        // SessionRequester 에서 세션 협상 완료된 Event 로, 타 데이터 허브의 Session의 end-point 전송 받음
        case 'TRANSMIT_NEGOTIATION_RESULT':
            debug('[RX: TRANSMIT_NEGOTIATION_RESULT] from SessionRequester');
            sessionManager.srTempSession.snResult = message.data.snResult;
            sessionManager.srTempSession.otherIp = message.data.endPoint.ip;
            sessionManager.srTempSession.otherPort = message.data.endPoint.port;

            // todo: daemon 에 GET_SESSION_LIST_INFO
            sessionManager.sessionListToDaemon.push(sessionManager._refactoringSessionInfo(sessionManager.srTempSession));
            sessionManager._dmGetSessionListInfo();

            // todo: srTempSession 에 TRANSMIT_NEGOTIATION_RESULT 전송
            debug('[TX: TRANSMIT_NEGOTIATION_RESULT] to Session(SR)')
            sessionManager._sessionTransmitNegotiationResult(sessionManager.srTempSession.worker, message.data.endPoint, message.data.sessionDesc, message.data.snResult);

            // todo: sessionList 관리
            for (let i = 0; i < message.data.snResult.datamapDesc.syncInterestList.length; i++) {
                if (message.data.snResult.datamapDesc.syncInterestList[i] in sessionManager.sessionList) {
                    sessionManager.sessionList[message.data.snResult.datamapDesc.syncInterestList[i]].push(sessionManager.srTempSession)
                } else {
                    sessionManager.sessionList[message.data.snResult.datamapDesc.syncInterestList[i]] = [];
                    sessionManager.sessionList[message.data.snResult.datamapDesc.syncInterestList[i]].push(sessionManager.srTempSession)
                }
            }

            // todo: dhList with session 관리
            sessionManager.dhListWithSession.push(message.data.sessionDesc.sessionCreator);

            // todo: srTempSession 초기화
            sessionManager.srTempSession = {};
            sessionManager._createSession().then(value => {
                sessionManager.srTempSession = value;
                sessionManager._sessionInit(sessionManager.srTempSession.worker);
                sessionManager._srGetNewSessionInfo();
                debug('[LOG] Session List: ', sessionManager.sessionList)
            });

            break;
    }
}
exports.SessionManager.prototype._slListener = function (message){
    switch (message.event) {
        // 데이터 허브 간 세션 협상에 의해 세션 연동이 결정난 경우, 상대방 세션의 endpoint 전달받는 이벤트
        case 'TRANSMIT_NEGOTIATION_RESULT':
            debug('[RX: TRANSMIT_NEGOTIATION_RESULT] from SessionListener');
            sessionManager.slTempSession.snResult = message.data.snResult;
            sessionManager.slTempSession.otherIp = message.data.endPoint.ip;
            sessionManager.slTempSession.otherPort = message.data.endPoint.port;

            sessionManager.sessionListToDaemon.push(sessionManager._refactoringSessionInfo(sessionManager.slTempSession));
            sessionManager._dmGetSessionListInfo();

            // todo: slTempSession 에 TRANSMIT_NEGOTIATION_RESULT 전송
            debug('[TX: TRANSMIT_NEGOTIATION_RESULT] to Session(SL)')
            sessionManager._sessionTransmitNegotiationResult(sessionManager.slTempSession.worker, message.data.endPoint, message.data.sessionDesc, message.data.snResult);

            // todo: sessionList 관리
            for (let i = 0; i < message.data.snResult.datamapDesc.syncInterestList.length; i++) {
                if (message.data.snResult.datamapDesc.syncInterestList[i] in sessionManager.sessionList) {
                    sessionManager.sessionList[message.data.snResult.datamapDesc.syncInterestList[i]].push(sessionManager.slTempSession)
                } else {
                    sessionManager.sessionList[message.data.snResult.datamapDesc.syncInterestList[i]] = [];
                    sessionManager.sessionList[message.data.snResult.datamapDesc.syncInterestList[i]].push(sessionManager.slTempSession)
                }
            }

            // todo: dhList with session 관리
            sessionManager.dhListWithSession.push(message.data.sessionDesc.sessionCreator);

            // todo: slTempSession 초기화
            sessionManager.slTempSession = {};
            sessionManager._createSession().then(value => {
                sessionManager.slTempSession = value;
                sessionManager._sessionInit(sessionManager.slTempSession.worker);
                sessionManager._slGetNewSessionInfo();
                debug('[LOG] Session List: ',sessionManager.sessionList)
            });

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
    debug('[TX: GET_SESSION_LIST_INFO] to DHDaemon')
    debug('[LOG]', sessionManager.sessionListToDaemon);
    parentPort.postMessage({
        event: "GET_SESSION_LIST_INFO",
        data: sessionManager.sessionListToDaemon
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
        data: {'sessId': sessionManager.srTempSession.sessionId, 'sessIp': sessionManager.srTempSession.myIp, 'sessPortNum': sessionManager.srTempSession.myPort}
    });
}
exports.SessionManager.prototype._srUpdateInterestList = function () {
    this.sessionRequester.postMessage({
        event: "UPDATE_INTEREST_LIST",
        data: {'syncInterestList': sessionManager.snOptions.datamapDesc.syncInterestList}
    });
}
exports.SessionManager.prototype._srUpdateNegotiationOptions = function () {
    this.sessionRequester.postMessage({
        event: "UPDATE_NEGOTIATION_OPTIONS",
        data: sessionManager.snOptions
    });
}

/* SessionListener methods */
exports.SessionManager.prototype._slInit = function () {
    this.sessionListener.postMessage({
        event: "INIT",
        data: null
    });
}
exports.SessionManager.prototype._slGetNewSessionInfo = function () {
    this.sessionListener.postMessage({
        event: "GET_NEW_SESSION_INFO",
        data: {'sessId': sessionManager.slTempSession.sessionId, 'sessIp': sessionManager.slTempSession.myIp, 'sessPortNum': sessionManager.slTempSession.myPort}
    });
}
exports.SessionManager.prototype._slUpdateInterestList = function () {
    this.sessionListener.postMessage({
        event: "UPDATE_INTEREST_LIST",
        data: {'syncInterestList': sessionManager.snOptions.datamapDesc.syncInterestList}
    });
}
exports.SessionManager.prototype._slUpdateNegotiationOptions = function () {
    this.sessionListener.postMessage({
        event: "UPDATE_NEGOTIATION_OPTIONS",
        data: sessionManager.snOptions
    });
}

/* Session methods */
exports.SessionManager.prototype._sessionInit = function (sessionWorker) {
    sessionWorker.postMessage({
        event: "INIT",
        data: null
    });
}
exports.SessionManager.prototype._sessionTransmitNegotiationResult = function (sessionWorker, end_point, session_desc, sn_options) {
    sessionWorker.postMessage({
        event: "TRANSMIT_NEGOTIATION_RESULT",
        data: { endPoint: end_point, sessionDesc: session_desc, snOptions: sn_options }
    });
}
exports.SessionManager.prototype._sessionUpdatePubAsset = function (sessionWorker, commit_number) {
    sessionWorker.postMessage({
        event: "UPDATE_PUB_ASSET",
        data: { commitNumber: commit_number }
    });
}

/* sessionManager methods */
exports.SessionManager.prototype._createSession = async function () {
    var session = {};
    session.sessionId = crypto.randomBytes(20).toString('hex');
    session.myIp = this.dmIp
    await this._setSessionPort().then(value => session.myPort = value);
    session.worker = await new Worker(__dirname+'/DHSession/session.js', { workerData: {'mySessionId': session.sessionId, 'myIp': session.myIp, 'myPortNum': session.myPort, 'kafka': sessionManager.kafka, 'pubvcRoot': sessionManager.pubvcRoot, 'subvcRoot': sessionManager.subvcRoot, 'mutexFlag': sessionManager.mutexFlag} });
    session.worker.on('message', this._sessionListener);

    return session
}

exports.SessionManager.prototype._setSessionPort = async function () {
    await detect(MIN_PORT_NUM_OF_SESSION)
        .then(_port => {
        })
        .catch(err => {
            debug('[ERROR]', err);
        });
    return detect();
}

exports.SessionManager.prototype._refactoringSessionInfo = function (tempSession) {
    let append_session = {};

    append_session.sessionId = tempSession.sessionId;
    append_session.myIp = tempSession.myIp;
    append_session.myPort = tempSession.myPort;
    append_session.otherIp = tempSession.otherIp;
    append_session.otherPort = tempSession.otherPort;
    append_session.snResult = tempSession.snResult;

    return append_session
}

exports.SessionManager.prototype._isEmptyObj = function (obj) {
    if (obj.constructor === Object && Object.keys(obj).length === 0) {
        return true;
    }

    return false;
}

const sessionManager = new sm.SessionManager()
sessionManager.run();
