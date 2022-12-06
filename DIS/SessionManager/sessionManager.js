
const {Worker, parentPort, workerData} = require('worker_threads');
const sm = require(__dirname+'/sessionManager');
const crypto = require('crypto');
const detect = require('detect-port');

const MIN_PORT_NUM_OF_SESSION = 55000;
const MAX_PORT_NUM_OF_SESSION = 65535;
const debug = require('debug')('sodas:sessionManager\t|');


/**
 * SessionManager
 * @constructor
 */
exports.SessionManager = function() {

    self = this;
    parentPort.on('message', function(message) {self._dhDaemonListener(message)});

    this.VC = workerData.vcPort;
    this.VC.on('message', this._vcListener);

    this.myNodeId = workerData.myNodeId;
    this.disIp = workerData.disIp;
    this.kafka = workerData.kafka;
    this.slAddr = workerData.disIp + ':' + workerData.slPortNum;
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

/**
 * SessionManager 실행 함수로 :ref:`sessionRequester`, :ref:`sessionListener` 모듈들을 worker thread 로 실행하고,
 * 각 모듈들의 초기화 실행을 위해 ``INIT`` 메시지를 전달함.
 * @method
 * @see sessionRequester
 * @see sessionListener
 */
exports.SessionManager.prototype.run = function (){

    const srParam = {'snOptions': this.snOptions, 'myNodeId': this.myNodeId}
    const slParam = {'snOptions': this.snOptions, 'myNodeId': this.myNodeId, 'slAddr': this.slAddr}

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
/**
 * :ref:`dhDaemon` 에서 전달되는 스레드 메시지를 수신하는 이벤트 리스너.
 * @method
 * @private
 * @param message - dictionary(event, message) 구조의 스레드 메시지
 * @param message:event - ``UPDATE_INTEREST_TOPIC``, ``UPDATE_NEGOTIATION_OPTIONS``, ``SYNC_ON``
 * @see DHDaemon._smInit
 * @see DHDaemon._smUpdateInterestTopic
 * @see DHDaemon._smUpdateNegotiation
 * @see DHDaemon._smSyncOn
 */
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
/**
 * :ref:`versionControl` 에서 전달되는 스레드 메시지를 수신하는 이벤트 리스너.
 * @method
 * @private
 * @param message - dictionary(event, message) 구조의 스레드 메시지
 * @param message:event - ``UPDATE_PUB_ASSET``
 */
exports.SessionManager.prototype._vcListener = function (message){
    switch (message.event) {
        // ETRI's KAFKA 에서 Asset 데이터맵 변화 이벤트 감지 시, 해당 데이터맵 및 git Commit 정보를 전달받아서
        // sessionList 정보 조회 후, 해당 session 에게 UPDATE_PUB_ASSET 이벤트 전달
        case 'UPDATE_PUB_ASSET':
            debug('[RX: UPDATE_PUB_ASSET] from VersionControl');
            debug(message.data);
            for (let t = 0; t < message.data.filepath.length; t++) {
                for (let key in sessionManager.sessionList) {
                    if (message.data.filepath[t].includes(key)) {
                        for (let u = 0; u < sessionManager.sessionList[key].length; u++) {
                            sessionManager._sessionUpdatePubAsset(sessionManager.sessionList[key][u].worker, message.data.commitNumber)
                        }
                    }
                }
            }
            break;
    }
}
/**
 * :ref:`sessionRequester` 에서 전달되는 스레드 메시지를 수신하는 이벤트 리스너.
 * @method
 * @private
 * @param message - dictionary(event, message) 구조의 스레드 메시지
 * @param message:event - ``TRANSMIT_NEGOTIATION_RESULT``
 * @see SessionRequester._smTransmitNegotiationResult
 */
exports.SessionManager.prototype._srListener = function (message){
    switch (message.event) {
        // SessionRequester 에서 세션 협상 완료된 Event 로, 타 데이터 허브의 Session의 end-point 전송 받음
        case 'TRANSMIT_NEGOTIATION_RESULT':
            debug('[RX: TRANSMIT_NEGOTIATION_RESULT] from SessionRequester');
            sessionManager.srTempSession.snResult = message.data.snResult;
            sessionManager.srTempSession.otherIp = message.data.endPoint.ip;
            sessionManager.srTempSession.otherPort = message.data.endPoint.port;

            // todo: daemon 에 GET_SESSION_LIST_INFO
            sessionManager.sessionListToDaemon.push(sessionManager._refactoringSessionInfo(sessionManager.srTempSession, message.data.sessionDesc.sessionCreator));
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
/**
 * :ref:`sessionListener` 에서 전달되는 스레드 메시지를 수신하는 이벤트 리스너.
 * @method
 * @private
 * @param message - dictionary(event, message) 구조의 스레드 메시지
 * @param message:event - ``TRANSMIT_NEGOTIATION_RESULT``
 * @see SessionListener._smTransmitNegotiationResult
 */
exports.SessionManager.prototype._slListener = function (message){
    switch (message.event) {
        // 데이터 허브 간 세션 협상에 의해 세션 연동이 결정난 경우, 상대방 세션의 endpoint 전달받는 이벤트
        case 'TRANSMIT_NEGOTIATION_RESULT':
            debug('[RX: TRANSMIT_NEGOTIATION_RESULT] from SessionListener');
            sessionManager.slTempSession.snResult = message.data.snResult;
            sessionManager.slTempSession.otherIp = message.data.endPoint.ip;
            sessionManager.slTempSession.otherPort = message.data.endPoint.port;

            sessionManager.sessionListToDaemon.push(sessionManager._refactoringSessionInfo(sessionManager.slTempSession, message.data.sessionDesc.sessionCreator));
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
/**
 * :ref:`session` 에서 전달되는 스레드 메시지를 수신하는 이벤트 리스너.
 * @method
 * @private
 * @param message - dictionary(event, message) 구조의 스레드 메시지
 * @param message:event - ``RECONFIGURATION_NEGOTIATION_OPTIONS``
 */
exports.SessionManager.prototype._sessionListener = function (message){
    switch (message.event) {
        // 데이터 허브 간 세션 협상에 의해 세션 연동이 결정난 경우, 상대방 세션의 endpoint 전달받는 이벤트
        case 'RECONFIGURATION_NEGOTIATION_OPTIONS':
            break;
    }
}

/* DHDaemon methods */
/**
 * :ref:`sessionRequester` 와 :ref:`sessionListener` 간 세션 연동이 되어 세션 리스트가 업데이트된 경우,
 * :ref:`dhDaemon` 으로 업데이트된 세션 리스트를 ``GET_SESSION_LIST_INFO`` 이벤트 스레드 메시지로 전달함.
 * @method
 * @private
 * @see DHDaemon._smListener
 */
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
/**
 * :ref:`sessionRequester` worker thread 의 초기화 실행을 위한 함수로 ``INIT`` 이벤트 스레드 메시지를 전달함.
 * @method
 * @private
 * @see SessionRequester._smListener
 */
exports.SessionManager.prototype._srInit = function () {
    this.sessionRequester.postMessage({
        event: "INIT",
        data: null
    });
}
/**
 * :ref:`dhDaemon` 으로부터 ``SYNC_ON`` 이벤트 스레드 메시지를 받으면 실행되는 함수로,
 * :ref:`sessionRequester` 로 bucketList 내 데이터 허브 리스트와의 세션 협상을 시작하는 ``START_SESSION_CONNECTION`` 이벤트 스레드 메시지를 전달함.
 * @method
 * @private
 * @param bucketList - 데이터맵 동기화 세션 연동을 위한 세션 협상 대상에 해당하는 데이터 허브 리스트
 * @see SessionRequester._smListener
 */
exports.SessionManager.prototype._srStartSessionConnection = function (bucketList) {
    this.sessionRequester.postMessage({
        event: "START_SESSION_CONNECTION",
        data: bucketList
    });
}
/**
 * :ref:`sessionRequester` 로 세션 협상 과정에서 필요한 :ref:`session` worker thread 의 end point 정보를
 * ``GET_NEW_SESSION_INFO`` 이벤트 스레드 메시지와 함께 전달함.
 * @method
 * @private
 * @see SessionRequester._smListener
 */
exports.SessionManager.prototype._srGetNewSessionInfo = function () {
    this.sessionRequester.postMessage({
        event: "GET_NEW_SESSION_INFO",
        data: {'sessId': sessionManager.srTempSession.sessionId, 'sessIp': sessionManager.srTempSession.myIp, 'sessPortNum': sessionManager.srTempSession.myPort}
    });
}
/**
 * :ref:`dhDaemon` 으로부터 ``UPDATE_INTEREST_TOPIC`` 이벤트 스레드 메시지를 받으면 실행되는 함수로,
 * :ref:`sessionRequester` 로 업데이트된 관심 동기화 수준 정보를 ``UPDATE_INTEREST_LIST`` 이벤트 스레드 메시지와 함께 전달함.
 * @method
 * @private
 * @see SessionRequester._smListener
 */
exports.SessionManager.prototype._srUpdateInterestList = function () {
    this.sessionRequester.postMessage({
        event: "UPDATE_INTEREST_LIST",
        data: {'syncInterestList': sessionManager.snOptions.datamapDesc.syncInterestList}
    });
}
/**
 * :ref:`dhDaemon` 으로부터 ``UPDATE_NEGOTIATION_OPTIONS`` 이벤트 스레드 메시지를 받으면 실행되는 함수로,
 * :ref:`sessionRequester` 로 업데이트된 세션 협상 옵션 정보를 ``UPDATE_NEGOTIATION_OPTIONS`` 이벤트 스레드 메시지와 함께 전달함.
 * @method
 * @private
 * @see SessionRequester._smListener
 */
exports.SessionManager.prototype._srUpdateNegotiationOptions = function () {
    this.sessionRequester.postMessage({
        event: "UPDATE_NEGOTIATION_OPTIONS",
        data: sessionManager.snOptions
    });
}

/* SessionListener methods */
/**
 * :ref:`sessionListener` worker thread 의 초기화 실행을 위한 함수로 ``INIT`` 이벤트 스레드 메시지를 전달함.
 * @method
 * @private
 * @see SessionListener._smListener
 */
exports.SessionManager.prototype._slInit = function () {
    this.sessionListener.postMessage({
        event: "INIT",
        data: null
    });
}
/**
 * :ref:`sessionListener` 로 세션 협상 과정에서 필요한 :ref:`session` worker thread 의 end point 정보를
 * ``GET_NEW_SESSION_INFO`` 이벤트 스레드 메시지와 함께 전달함.
 * @method
 * @private
 * @see SessionListener._smListener
 */
exports.SessionManager.prototype._slGetNewSessionInfo = function () {
    this.sessionListener.postMessage({
        event: "GET_NEW_SESSION_INFO",
        data: {'sessId': sessionManager.slTempSession.sessionId, 'sessIp': sessionManager.slTempSession.myIp, 'sessPortNum': sessionManager.slTempSession.myPort}
    });
}
/**
 * :ref:`dhDaemon` 으로부터 ``UPDATE_INTEREST_TOPIC`` 이벤트 스레드 메시지를 받으면 실행되는 함수로,
 * :ref:`sessionListener` 로 업데이트된 관심 동기화 수준 정보를 ``UPDATE_INTEREST_LIST`` 이벤트 스레드 메시지와 함께 전달함.
 * @method
 * @private
 * @see SessionListener._smListener
 */
exports.SessionManager.prototype._slUpdateInterestList = function () {
    this.sessionListener.postMessage({
        event: "UPDATE_INTEREST_LIST",
        data: {'syncInterestList': sessionManager.snOptions.datamapDesc.syncInterestList}
    });
}
/**
 * :ref:`dhDaemon` 으로부터 ``UPDATE_NEGOTIATION_OPTIONS`` 이벤트 스레드 메시지를 받으면 실행되는 함수로,
 * :ref:`sessionListener` 로 업데이트된 세션 협상 옵션 정보를 ``UPDATE_NEGOTIATION_OPTIONS`` 이벤트 스레드 메시지와 함께 전달함.
 * @method
 * @private
 * @see SessionListener._smListener
 */
exports.SessionManager.prototype._slUpdateNegotiationOptions = function () {
    this.sessionListener.postMessage({
        event: "UPDATE_NEGOTIATION_OPTIONS",
        data: sessionManager.snOptions
    });
}

/* Session methods */
/**
 * :ref:`session` worker thread 의 초기화 실행을 위한 함수로 ``INIT`` 이벤트 스레드 메시지를 전달함.
 * @method
 * @param sessionWorker - 신규 생성한 세션 worker thread 객체
 * @private
 * @see Session._dhDaemonListener
 */
exports.SessionManager.prototype._sessionInit = function (sessionWorker) {
    sessionWorker.postMessage({
        event: "INIT",
        data: null
    });
}
/**
 * :ref:`sessionRequester` 와 :ref:`sessionListener` 간 세션 협상 체결이 된 경우,
 * :ref:`session` 로 상대 세션 모듈의 end point 정보와 세션 협상 결과를 ``TRANSMIT_NEGOTIATION_RESULT`` 이벤트 스레드 메시지와 함께 전달함.
 * @method
 * @param sessionWorker - 세션 협상 체결 이후, 다른 데이터 허브의 세션 모듈과 연동할 내부 세션 객체
 * @param end_point - 다른 데이터 허브의 세션 모듈의 접속 정보(IP, Port)
 * @param session_desc - 세션 객체의 메타데이터(세션 생성자 정보, 세션 ID)
 * @param sn_options - 세션 협상 결과
 * @private
 * @see Session._dhDaemonListener
 */
exports.SessionManager.prototype._sessionTransmitNegotiationResult = function (sessionWorker, end_point, session_desc, sn_options) {
    sessionWorker.postMessage({
        event: "TRANSMIT_NEGOTIATION_RESULT",
        data: { endPoint: end_point, sessionDesc: session_desc, snOptions: sn_options }
    });
}
// ETRI's KAFKA 에서 Asset 데이터맵 변화 이벤트 감지 시, 해당 데이터맵 및 git Commit 정보를 전달받아서
// sessionList 정보 조회 후, 해당 session 에게 UPDATE_PUB_ASSET 이벤트 전달
/**
 * :ref:`versionControl` 에서 ``send.asset`` 토픽을 통해 데이터맵 변화 이벤트 감지 및 git commit 실행한 뒤,
 * SessionManager 모듈로 ``UPDATE_PUB_ASSET`` 이벤트 스레드 메시지로 전달하고, SessionManager 모듈은 업데이트된 데이터맵 수준을 포함하는 관심 동기화 수준으로 협상된
 * :ref:`session` 모듈로 commit number 를 ``UPDATE_PUB_ASSET`` 이벤트 스레드 메시지와 함께 전달함.
 * @method
 * @param sessionWorker - 변경된 Pub 데이터맵이 동기화 수준에 해당하는 세션 모듈 객체
 * @param commit_number - VC 모듈에서 최근 커밋한 커밋 번호
 * @private
 * @see Session._dhDaemonListener
 */
exports.SessionManager.prototype._sessionUpdatePubAsset = function (sessionWorker, commit_number) {
    sessionWorker.postMessage({
        event: "UPDATE_PUB_ASSET",
        data: { commitNumber: commit_number }
    });
}

/* sessionManager methods */
/**
 * :ref:`session` 모듈을 worker thread 로 실행하고, 미사용 Port 번호를 할당하는 함수.
 * @method
 * @private
 */
exports.SessionManager.prototype._createSession = async function () {
    var session = {};
    session.sessionId = crypto.randomBytes(20).toString('hex');
    session.myIp = this.disIp
    await this._setSessionPort().then(value => session.myPort = value);
    session.worker = await new Worker(__dirname+'/DHSession/session.js', { workerData: {'mySessionId': session.sessionId, 'myIp': session.myIp, 'myPortNum': session.myPort, 'kafka': sessionManager.kafka, 'pubvcRoot': sessionManager.pubvcRoot, 'subvcRoot': sessionManager.subvcRoot, 'mutexFlag': sessionManager.mutexFlag} });
    session.worker.on('message', this._sessionListener);

    return session
}

/**
 * 신규 :ref:`session` 모듈 생성을 위한, 미사용 Port 번호를 조회하는 함수.
 * @method
 * @private
 */
exports.SessionManager.prototype._setSessionPort = async function () {
    await detect(MIN_PORT_NUM_OF_SESSION)
        .then(_port => {
        })
        .catch(err => {
            debug('[ERROR]', err);
        });
    return detect();
}

/**
 * :ref:`sessionRequester` 와 :ref:`sessionListener` 간 세션 연동이 되어 세션 리스트가 업데이트된 경우,
 * 업데이트된 내부 세션 관리용 dictionary 에서 :ref:`dhDaemon` 으로 전달하는 세션 리스트로 자료구조를 리팩토링하는 함수.
 * @method
 * @private
 * @param tempSession - 신규 연동된 임시 세션 객체
 * @param otherNodeId - 세션 연동을 할 상대 데이터 허브의 ID
 */
exports.SessionManager.prototype._refactoringSessionInfo = function (tempSession, otherNodeId) {
    let append_session = {};

    append_session.sessionId = tempSession.sessionId;
    append_session.myNodeId = this.myNodeId;
    append_session.myIp = tempSession.myIp;
    append_session.myPort = tempSession.myPort;
    append_session.otherNodeId = otherNodeId;
    append_session.otherIp = tempSession.otherIp;
    append_session.otherPort = tempSession.otherPort;
    append_session.snResult = tempSession.snResult;

    return append_session
}

/**
 * 인자로 주어진 dictionary 가 빈 객체인지를 체크하는 함수.
 * @method
 * @private
 * @param obj - 빈 객체인지를 확인하기 위한 dictionary
 */
exports.SessionManager.prototype._isEmptyObj = function (obj) {
    if (obj.constructor === Object && Object.keys(obj).length === 0) {
        return true;
    }

    return false;
}

const sessionManager = new sm.SessionManager()
sessionManager.run();
